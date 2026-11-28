import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, FontFamilies, Spacing } from '@/constants/theme';
import { getAdDetails } from '@/features/ads/api';
import {
  createMediaKey,
  deleteStoredMedia,
  savePickedMedia,
} from '@/features/ads/mediaStorage';
import { uploadChatMedia } from '@/features/ads/uploadApi';
import { getAuthErrorMessage } from '@/features/auth/api';
import { formatChatTime } from '@/features/chat/format';
import { createChatSocket } from '@/features/chat/socket';
import {
  chatMessageSchema,
  chatMessagesResponseSchema,
  type ChatMessage,
} from '@/features/chat/types';
import { getCurrentUser } from '@/features/profile/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { readAuthSession, useAuthStore } from '@/store/authStore';

interface ChatConversationScreenProps {
  adShortLink: string;
  pvId?: string;
}

export default function ChatConversationScreen({
  adShortLink,
  pvId,
}: ChatConversationScreenProps) {
  const status = useAuthStore((state) => state.status);
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const userQuery = useQuery({
    queryKey: ['chat-user'],
    queryFn: getCurrentUser,
    enabled: status === 'authenticated',
    retry: false,
  });
  const adQuery = useQuery({
    queryKey: ['chat-ad', adShortLink],
    queryFn: () => getAdDetails(adShortLink, false),
    enabled: Boolean(adShortLink),
    retry: false,
  });
  console.log(adQuery, 'adQuery')
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [socketError, setSocketError] = useState('');
  const [sendError, setSendError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{
    uri: string;
    type: 'image' | 'video';
  } | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const pickerLock = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const userId = userQuery.data?.id;

  useEffect(() => {
    if (status !== 'authenticated' || userId == null) return;
    let active = true;
    let historyTimeout: ReturnType<typeof setTimeout> | undefined;

    void readAuthSession()
      .then((session) => {
        if (!active) return;
        if (!session) {
          setSocketError(strings.auth.sessionExpired);
          setHistoryLoaded(true);
          return;
        }

        const socket = createChatSocket('chat-message', session.accessToken, userId);
        socketRef.current = socket;
        socket.on('connect', () => {
          setIsConnected(true);
          setHistoryLoaded(false);
          setMessages([]);
          setSocketError('');
          if (historyTimeout) clearTimeout(historyTimeout);
          historyTimeout = setTimeout(() => {
            setSocketError(strings.tabs.chatMessageLoadingError);
            setHistoryLoaded(true);
          }, 10_000);
          socket.emit(
            'getPvMessages',
            { adShortLink: pvId ?? adShortLink },
            (response: unknown) => {
              if (historyTimeout) clearTimeout(historyTimeout);
              if (response === null || response === undefined) setMessages([]);
              setHistoryLoaded(true);
            },
          );
          if (pvId) {
            socket.emit('openPv', { pvId }, (response: unknown) => {
              if (historyTimeout) clearTimeout(historyTimeout);
              const parsed = chatMessagesResponseSchema.safeParse(response);
              if (parsed.success) {
                setMessages(parsed.data.messages.slice().reverse());
                setHistoryLoaded(true);
              }
            });
          }
        });
        socket.on('disconnect', (reason: string) => {
          if (historyTimeout) clearTimeout(historyTimeout);
          setIsConnected(false);
          setSocketError(
            reason === 'io server disconnect'
              ? strings.tabs.chatAuthError
              : strings.tabs.chatConnectionError,
          );
          setHistoryLoaded(true);
        });
        socket.on('getPvMessages', (payload: unknown) => {
          if (historyTimeout) clearTimeout(historyTimeout);
          const parsed = chatMessagesResponseSchema.safeParse(payload);
          if (!parsed.success) {
            setSocketError(strings.tabs.chatMessageLoadingError);
            setHistoryLoaded(true);
            return;
          }
          setMessages(parsed.data.messages.slice().reverse());
          setHistoryLoaded(true);
        });
        socket.on('newMessage', (payload: unknown) => {
          const parsed = chatMessageSchema.safeParse(payload);
          if (!parsed.success) {
            setSendError(strings.tabs.chatSendError);
            return;
          }
          setMessages((current) => [
            parsed.data,
            ...current.filter((message) => message._id !== parsed.data._id),
          ]);
          if (pvId && String(parsed.data.senderId) !== String(userId)) {
            socket.emit('markMessagesAsSeen', {
              pvId,
              messageIds: [parsed.data._id],
            });
          }
          setSendError('');
        });
        socket.on(
          'messagesSeen',
          (payload: unknown) => {
            if (typeof payload !== 'object' || payload === null) return;
            const { pvId: seenPvId, messageIds, seenBy } = payload as {
              pvId?: string;
              messageIds?: string[];
              seenBy?: { userId: string | number; seenAt?: string };
            };
            if (seenPvId && seenPvId !== pvId) return;
            if (!Array.isArray(messageIds)) return;
            const idSet = new Set(messageIds.map(String));
            setMessages((current) =>
              current.map((message) =>
                idSet.has(String(message._id))
                  ? {
                    ...message,
                    isRead: true,
                    seenBy: [
                      ...(message.seenBy ?? []),
                      ...(seenBy ? [seenBy] : []),
                    ],
                  }
                  : message,
              ),
            );
          },
        );
        socket.on('exception', () => setSendError(strings.tabs.chatSendError));
        socket.on('connect_error', (error: Error) => {
          if (historyTimeout) clearTimeout(historyTimeout);
          setSocketError(
            /unauthorized|authentication|token/i.test(error.message)
              ? strings.tabs.chatAuthError
              : strings.tabs.chatConnectionError,
          );
          setIsConnected(false);
          setHistoryLoaded(true);
        });
        socket.connect();
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSocketError(getAuthErrorMessage(error, strings.tabs.chatConnectionError));
        setHistoryLoaded(true);
      });

    return () => {
      active = false;
      if (historyTimeout) clearTimeout(historyTimeout);
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [adShortLink, pvId, status, userId]);

  if (status === 'unauthenticated') {
    return (
      <Redirect
        href={{
          pathname: '/(auth)/login',
          params: {
            returnTo: pvId ? 'chat-thread' : 'chat',
            ...(pvId ? { pvId } : {}),
            adShortLink,
          },
        }}
      />
    );
  }

  const sendMessage = () => {
    const text = draft.trim();
    const socket = socketRef.current;
    if (!text || !socket?.connected || userId == null) return;
    socket.emit('createMessage', {
      text,
      adShortLink: pvId ?? adShortLink,
      messageType: 'text',
      senderId: userId,
      ...(replyingTo ? { replyTo: replyingTo._id } : {}),
    });
    setDraft('');
    setReplyingTo(null);
    setSelectedMessageId(null);
    setSendError('');
    setActionNotice('');
  };

  const pickAndUploadMedia = async () => {
    if (pickerLock.current || isUploadingMedia || !isConnected || userId == null) return;
    pickerLock.current = true;
    setIsUploadingMedia(true);
    setSendError('');
    setActionNotice('');

    let storedMedia: Awaited<ReturnType<typeof savePickedMedia>> | null = null;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setSendError(strings.tabs.mediaPermissionDenied);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) throw new Error(strings.auth.invalidResponse);
      const mediaType =
        asset.type === 'video' || asset.mimeType?.startsWith('video/') ? 'video' : 'image';
      setPendingUpload({ uri: asset.uri, type: mediaType });
      storedMedia = await savePickedMedia(asset, createMediaKey());
      setPendingUpload({ uri: storedMedia.previewUri, type: mediaType });

      const controller = new AbortController();
      const uploaded = await uploadChatMedia(
        storedMedia.key,
        storedMedia.uri,
        storedMedia.fileName,
        mediaType,
        controller.signal,
      );
      const socket = socketRef.current;
      if (!socket?.connected) throw new Error(strings.tabs.chatConnectionError);

      socket.emit('createMessage', {
        adShortLink: pvId ?? adShortLink,
        messageType: mediaType,
        senderId: userId,
        media: {
          url: uploaded.fullUrl,
          size: uploaded.size,
          format: asset.mimeType?.split('/')[1] ?? mediaType,
        },
        ...(replyingTo ? { replyTo: replyingTo._id } : {}),
      });
      setReplyingTo(null);
      setSelectedMessageId(null);
    } catch (error) {
      setSendError(getAuthErrorMessage(error, strings.tabs.chatSendError));
    } finally {
      if (storedMedia) {
        try {
          await deleteStoredMedia(storedMedia.key, storedMedia.uri);
        } catch (error) {
          setSendError(getAuthErrorMessage(error, strings.tabs.chatSendError));
        }
      }
      setPendingUpload(null);
      setIsUploadingMedia(false);
      pickerLock.current = false;
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    const text = message.content.text ?? message.content.media?.url;
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      setSelectedMessageId(null);
      setActionNotice(strings.tabs.chatCopied);
      setSendError('');
    } catch (error) {
      setSendError(getAuthErrorMessage(error, strings.tabs.chatSendError));
    }
  };

  const confirmLocalDelete = () => {
    if (!deleteTarget || String(deleteTarget.senderId) !== String(userId)) return;
    setMessages((current) => current.filter((message) => message._id !== deleteTarget._id));
    setDeleteTarget(null);
  };

  const imageUri =
    adQuery.data?.mainImage?.url ??
    adQuery.data?.files?.find((file) => file.url)?.url;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={strings.common.back}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'arrow_forward', web: 'arrow_forward' }}
            size={22}
            tintColor={colors.text}
          />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>
          {strings.tabs.chatConversationTitle}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <View style={[styles.adCard, { borderBottomColor: colors.border, backgroundColor: colors.backgroundElement }]}>
          {imageUri ? (
            <Image contentFit="cover" source={{ uri: imageUri }} style={styles.adImage} />
          ) : (
            <View style={[styles.adImage, styles.imagePlaceholder, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.textSubtle }}>{strings.tabs.chatAdLabel}</Text>
            </View>
          )}
          <View style={styles.adDetails}>
            {/* <Text style={[styles.adLabel, { color: colors.textSecondary }]}>
              {strings.tabs.chatAdLabel}
            </Text> */}
            <Text numberOfLines={2} style={[styles.adTitle, { color: colors.text }]}>
              {adQuery.data?.title ?? (adQuery.isError ? strings.tabs.chatAdLoadingError : strings.common.loading)}
            </Text>
            {/* {adQuery.data ? (
              <Text style={[styles.adPrice, { color: colors.textSecondary }]}>
                {new Intl.NumberFormat('fa-IR').format(Number(adQuery.data.price))} {strings.tabs.priceUnit}
              </Text>
            ) : null} */}
          </View>
        </View>

        {socketError ? (
          <View style={styles.connectionError}>
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
              {socketError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => socketRef.current?.connect()}
              style={({ pressed }) => [pressed ? styles.pressed : null]}>
              <Text style={{ color: colors.primary }}>{strings.common.retry}</Text>
            </Pressable>
          </View>
        ) : null}
        {userQuery.isError ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
            {getAuthErrorMessage(userQuery.error, strings.tabs.chatLoadingError)}
          </Text>
        ) : null}

        {historyLoaded ? (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item._id}
            contentContainerStyle={messages.length ? styles.messageList : styles.emptyMessages}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {strings.tabs.chatNoMessages}
              </Text>
            }
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isMine={String(item.senderId) === String(userId)}
                colors={colors}
                menuVisible={selectedMessageId === item._id}
                onPress={() =>
                  setSelectedMessageId((current) => current === item._id ? null : item._id)
                }
                onCopy={() => void copyMessage(item)}
                onReply={() => {
                  setReplyingTo(item);
                  setSelectedMessageId(null);
                  setActionNotice('');
                }}
                onDelete={() => {
                  setDeleteTarget(item);
                  setSelectedMessageId(null);
                }}
              />
            )}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textSecondary }}>{strings.common.loading}</Text>
          </View>
        )}

        {sendError ? (
          <Text accessibilityRole="alert" style={[styles.sendError, { color: colors.error }]}>
            {sendError}
          </Text>
        ) : null}
        {actionNotice ? (
          <Text style={[styles.actionNotice, { color: colors.primary }]}>{actionNotice}</Text>
        ) : null}
        <View style={[styles.composer, { borderTopColor: colors.border }]}>
          {replyingTo ? (
            <View style={[styles.replyPreview, { backgroundColor: colors.backgroundElement }]}>
              <View style={styles.replyPreviewText}>
                <Text style={[styles.replyPreviewLabel, { color: colors.primary }]}>
                  {strings.tabs.chatReplyingTo}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.textSecondary }}>
                  {replyingTo.content.text ??
                    (replyingTo.type === 'video'
                      ? strings.tabs.chatVideoMessage
                      : replyingTo.content.media
                        ? strings.tabs.chatImageMessage
                        : '')}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={strings.tabs.chatCancel}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setReplyingTo(null)}>
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={18}
                  tintColor={colors.textSecondary}
                />
              </Pressable>
            </View>
          ) : null}
          {pendingUpload ? (
            <View style={styles.uploadPreview}>
              {pendingUpload.type === 'image' ? (
                <Image contentFit="cover" source={{ uri: pendingUpload.uri }} style={styles.uploadPreviewMedia} />
              ) : (
                <ChatVideo uri={pendingUpload.uri} preview />
              )}
              <View style={[styles.uploadOverlay, { backgroundColor: colors.overlay }]}>
                <ActivityIndicator color={colors.onPrimary} />
                <Text style={{ color: colors.onPrimary }}>{strings.tabs.chatUploadingMedia}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <Pressable
              accessibilityLabel={strings.tabs.chatSendAction}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isConnected || !draft.trim() }}
              disabled={!isConnected || !draft.trim()}
              onPress={sendMessage}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: colors.primary },
                (!isConnected || !draft.trim()) ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <SymbolView
                name={{ ios: 'arrow.up', android: 'send', web: 'send' }}
                size={20}
                tintColor={colors.onPrimary}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={strings.tabs.chatPickMedia}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isConnected || isUploadingMedia }}
              disabled={!isConnected || isUploadingMedia}
              onPress={() => void pickAndUploadMedia()}
              style={({ pressed }) => [styles.mediaButton, pressed ? styles.pressed : null]}>
              <SymbolView
                name={{ ios: 'paperclip', android: 'attach_file', web: 'attach_file' }}
                size={21}
                tintColor={colors.primary}
              />
            </Pressable>
            <TextInput
              accessibilityLabel={strings.tabs.chatMessagePlaceholder}
              editable={isConnected}
              maxLength={2000}
              multiline
              onChangeText={setDraft}
              onSubmitEditing={sendMessage}
              placeholder={strings.tabs.chatMessagePlaceholder}
              placeholderTextColor={colors.textSubtle}
              returnKeyType="send"
              style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
              textAlign="left"
              value={draft}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
      <Modal
        animationType="fade"
        transparent
        visible={deleteTarget !== null}
        onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.deleteDialog, { backgroundColor: colors.background }]}>
            <Text style={[styles.deleteTitle, { color: colors.text }]}>
              {strings.tabs.chatDeleteLocalTitle}
            </Text>
            <Text style={[styles.deleteDescription, { color: colors.textSecondary }]}>
              {strings.tabs.chatDeleteLocalDescription}
            </Text>
            <View style={styles.deleteActions}>
              <Pressable onPress={() => setDeleteTarget(null)} style={styles.deleteAction}>
                <Text style={{ color: colors.textSecondary }}>{strings.tabs.chatCancel}</Text>
              </Pressable>
              <Pressable onPress={confirmLocalDelete} style={styles.deleteAction}>
                <Text style={{ color: colors.error }}>{strings.tabs.chatDeleteLocalConfirm}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  isMine,
  colors,
  menuVisible,
  onPress,
  onCopy,
  onReply,
  onDelete,
}: {
  message: ChatMessage;
  isMine: boolean;
  colors: (typeof Colors)[keyof typeof Colors];
  menuVisible: boolean;
  onPress: () => void;
  onCopy: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <View
      style={[
        styles.messageRow,
        isMine ? styles.ownMessage : styles.otherMessage,
        menuVisible ? styles.messageRowActive : null,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={message.content.text ?? strings.tabs.chatReplyingTo}
        onPress={onPress}
        style={[
          styles.messageBubble,
          { backgroundColor: isMine ? colors.lightBlue : colors.backgroundElement },
        ]}>
        {message.repliedTo ? (
          <View
            style={[
              styles.messageReplyQuote,
              { borderRightColor: isMine ? colors.onPrimary : colors.primary },
            ]}>
            <Text
              numberOfLines={2}
              style={{
                color: isMine ? colors.text : colors.textSecondary,
                fontSize: 11,
                textAlign: 'right',
              }}>
              {message.repliedTo.content}
            </Text>
          </View>
        ) : null}
        {message.content.text ? (
          <Text style={{ color: isMine ? colors.text : colors.text, textAlign: 'right' }}>
            {message.content.text}
          </Text>
        ) : null}
        {message.content.media ? (
          message.type === 'video' ? (
            <ChatVideo uri={message.content.media.url} />
          ) : (
            <Image
              contentFit="cover"
              source={{ uri: message.content.media.url }}
              style={styles.messageMedia}
            />
          )
        ) : null}
        <View style={styles.messageMeta}>
          {isMine ? (
            <Text
              accessibilityLabel={message.isRead ? 'پیام خوانده شد' : 'پیام خوانده نشد'}
              style={[
                styles.readStatus,
                { color: message.isRead ? colors.textSubtle : colors.textSubtle },
              ]}>
              {message.isRead ? '✓✓' : '✓'}
            </Text>
          ) : null}
          <Text style={[styles.messageTime, { color: isMine ? colors.textSubtle : colors.textSubtle }]}>
            {formatChatTime(message.createdAt)}
          </Text>
        </View>
      </Pressable>
      {menuVisible ? (
        <View
          style={[
            styles.messageActions,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <Pressable accessibilityRole="button" onPress={onCopy} style={styles.messageAction}>
            <Text style={{ color: colors.text }}>{strings.tabs.chatCopy}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onReply} style={styles.messageAction}>
            <Text style={{ color: colors.text }}>{strings.tabs.chatReply}</Text>
          </Pressable>
          {isMine ? (
            <Pressable accessibilityRole="button" onPress={onDelete} style={styles.messageAction}>
              <Text style={{ color: colors.error }}>{strings.tabs.chatDelete}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ChatVideo({ uri, preview = false }: { uri: string; preview?: boolean }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = preview;
    videoPlayer.muted = preview;
    if (preview) videoPlayer.play();
  });

  return (
    <VideoView
      contentFit="cover"
      nativeControls={!preview}
      player={player}
      style={preview ? styles.uploadPreviewMedia : styles.messageMedia}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
  },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'right' },
  adCard: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  adImage: { borderRadius: 10, height: 40, width: 40 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  adDetails: { flex: 1, gap: Spacing.one },
  adTitle: { fontSize: 12, fontWeight: '500', textAlign: 'right' },
  error: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, textAlign: 'right' },
  connectionError: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingEnd: Spacing.three,
  },
  loading: { alignItems: 'center', flex: 1, gap: Spacing.two, justifyContent: 'center' },
  messageList: { gap: Spacing.two, padding: Spacing.three },
  emptyMessages: { flexGrow: 1, justifyContent: 'center', padding: Spacing.three },
  emptyText: { fontSize: 14, textAlign: 'center' },
  messageRow: { maxWidth: '88%', position: 'relative' },
  messageRowActive: { elevation: 10, zIndex: 10 },
  ownMessage: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  otherMessage: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  messageBubble: { borderRadius: 14, gap: Spacing.one, maxWidth: '100%', padding: Spacing.two },
  messageMedia: { borderRadius: 10, height: 190, width: 240 },
  messageReplyQuote: { borderRightWidth: 2, paddingEnd: Spacing.two },
  messageActions: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row-reverse',
    gap: Spacing.three,
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    transform: [{ translateY: -20 }],
    zIndex: 20,
    elevation: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  messageAction: { paddingVertical: Spacing.one },
  messageMeta: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: Spacing.one,
    justifyContent: 'flex-start',
    width: '100%',
  },
  messageTime: { fontSize: 10, textAlign: 'right' },
  readStatus: { fontSize: 11, letterSpacing: -2 },
  sendError: { paddingHorizontal: Spacing.three, textAlign: 'right' },
  actionNotice: { paddingHorizontal: Spacing.three, textAlign: 'right' },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.two,
  },
  composerRow: { alignItems: 'center', flexDirection: 'row-reverse', gap: Spacing.one },
  input: {
    borderRadius: 20,
    flex: 1,
    fontFamily: FontFamilies.regular,
    fontSize: 14,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    writingDirection: 'rtl',
  },
  mediaButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 36,
  },
  sendButton: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  replyPreview: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  replyPreviewText: { flex: 1, gap: Spacing.one },
  replyPreviewLabel: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  uploadPreview: {
    alignSelf: 'flex-end',
    borderRadius: 12,
    height: 132,
    overflow: 'hidden',
    width: 176,
  },
  uploadPreviewMedia: { height: '100%', width: '100%' },
  uploadOverlay: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: '#00000066',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  deleteDialog: { borderRadius: 16, gap: Spacing.three, maxWidth: 380, padding: Spacing.four, width: '100%' },
  deleteTitle: { fontSize: 17, fontWeight: '600', textAlign: 'right' },
  deleteDescription: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  deleteActions: { flexDirection: 'row-reverse', gap: Spacing.four, justifyContent: 'flex-start' },
  deleteAction: { paddingVertical: Spacing.one },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
