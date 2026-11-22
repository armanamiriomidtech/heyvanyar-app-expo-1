import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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
import { getAuthErrorMessage } from '@/features/auth/api';
import { createChatSocket } from '@/features/chat/socket';
import { formatChatTime } from '@/features/chat/format';
import {
  chatMessageSchema,
  chatMessagesResponseSchema,
  type ChatMessage,
} from '@/features/chat/types';
import { getCurrentUser } from '@/features/profile/api';
import { readAuthSession, useAuthStore } from '@/store/authStore';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [socketError, setSocketError] = useState('');
  const [sendError, setSendError] = useState('');
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
                setMessages(parsed.data.messages);
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
          setMessages(parsed.data.messages);
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
    });
    setDraft('');
    setSendError('');
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
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
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
        <View style={[styles.adCard, { borderBottomColor: colors.border }]}>
          {imageUri ? (
            <Image contentFit="cover" source={{ uri: imageUri }} style={styles.adImage} />
          ) : (
            <View style={[styles.adImage, styles.imagePlaceholder, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.textSubtle }}>{strings.tabs.chatAdLabel}</Text>
            </View>
          )}
          <View style={styles.adDetails}>
            <Text style={[styles.adLabel, { color: colors.textSecondary }]}>
              {strings.tabs.chatAdLabel}
            </Text>
            <Text numberOfLines={2} style={[styles.adTitle, { color: colors.text }]}>
              {adQuery.data?.title ?? (adQuery.isError ? strings.tabs.chatAdLoadingError : strings.common.loading)}
            </Text>
            {adQuery.data ? (
              <Text style={[styles.adPrice, { color: colors.textSecondary }]}>
                {new Intl.NumberFormat('fa-IR').format(Number(adQuery.data.price))} {strings.tabs.priceUnit}
              </Text>
            ) : null}
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
        <View style={[styles.composer, { borderTopColor: colors.border }]}>
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
            textAlign="right"
            value={draft}
          />
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  isMine,
  colors,
}: {
  message: ChatMessage;
  isMine: boolean;
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  return (
    <View
      style={[
        styles.messageBubble,
        { backgroundColor: isMine ? colors.primary : colors.backgroundElement },
        isMine ? styles.ownMessage : styles.otherMessage,
      ]}>
      <Text style={{ color: isMine ? colors.onPrimary : colors.text, textAlign: 'right' }}>
        {message.content.text ?? ''}
      </Text>
      <Text style={[styles.messageTime, { color: isMine ? colors.onPrimary : colors.textSubtle }]}>
        {formatChatTime(message.createdAt)}
      </Text>
      {isMine ? (
        <Text
          accessibilityLabel={message.isRead ? 'پیام خوانده شد' : 'پیام خوانده نشد'}
          style={[
            styles.readStatus,
            { color: message.isRead ? '#2F80ED' : colors.onPrimary },
          ]}>
          {message.isRead ? '✓✓' : '✓'}
        </Text>
      ) : null}
    </View>
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
    gap: Spacing.three,
    padding: Spacing.three,
  },
  adImage: { borderRadius: 10, height: 76, width: 76 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  adDetails: { flex: 1, gap: Spacing.one },
  adLabel: { fontSize: 11, textAlign: 'right' },
  adTitle: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  adPrice: { fontSize: 12, textAlign: 'right' },
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
  messageBubble: { borderRadius: 14, gap: Spacing.one, maxWidth: '84%', padding: Spacing.two },
  ownMessage: { alignSelf: 'flex-end' },
  otherMessage: { alignSelf: 'flex-start' },
  messageTime: { fontSize: 10, textAlign: 'left' },
  readStatus: { fontSize: 11, letterSpacing: -2, textAlign: 'left' },
  sendError: { paddingHorizontal: Spacing.three, textAlign: 'right' },
  composer: {
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    padding: Spacing.two,
  },
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
  sendButton: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
