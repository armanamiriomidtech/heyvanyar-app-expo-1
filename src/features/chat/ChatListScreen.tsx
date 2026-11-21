import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';
import { getCurrentUser } from '@/features/profile/api';
import { getAuthErrorMessage } from '@/features/auth/api';
import { createChatSocket } from '@/features/chat/socket';
import { formatChatTime } from '@/features/chat/format';
import { chatPvSchema, type ChatPv } from '@/features/chat/types';
import { readAuthSession, useAuthStore } from '@/store/authStore';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ChatListScreen() {
  const status = useAuthStore((state) => state.status);
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const userQuery = useQuery({
    queryKey: ['chat-user'],
    queryFn: getCurrentUser,
    enabled: status === 'authenticated',
    retry: false,
  });
  const [chats, setChats] = useState<ChatPv[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [socketError, setSocketError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const userId = userQuery.data?.id;

  useEffect(() => {
    if (status !== 'authenticated' || userId == null) return;
    let active = true;
    let responseTimeout: ReturnType<typeof setTimeout> | undefined;

    void readAuthSession()
      .then((session) => {
        if (!active) return;
        if (!session) {
          setSocketError(strings.auth.sessionExpired);
          setIsConnecting(false);
          return;
        }

        setIsConnecting(true);
        const socket = createChatSocket('chat-pv', session.accessToken, userId);
        socketRef.current = socket;
        socket.on('connect', () => {
          setSocketError('');
          if (responseTimeout) clearTimeout(responseTimeout);
          responseTimeout = setTimeout(() => {
            setSocketError(strings.tabs.chatLoadingError);
            setIsConnecting(false);
          }, 10_000);
          socket.emit('getAllPv');
        });
        socket.on('findAllPv', (payload: unknown) => {
          if (responseTimeout) clearTimeout(responseTimeout);
          if (!Array.isArray(payload)) {
            setSocketError(strings.tabs.chatLoadingError);
            setIsRefreshing(false);
            setIsConnecting(false);
            return;
          }
          const parsed = payload.map((item) => chatPvSchema.safeParse(item));
          if (parsed.some((item) => !item.success)) {
            setSocketError(strings.tabs.chatLoadingError);
          } else {
            setChats(parsed.map((item) => (item.success ? item.data : null)).filter(
              (item): item is ChatPv => item !== null,
            ));
            setSocketError('');
          }
          setIsRefreshing(false);
          setIsConnecting(false);
        });
        socket.on('updatePvWithLastMessage', (payload: unknown) => {
          const parsed = chatPvSchema.safeParse(payload);
          if (!parsed.success) {
            setSocketError(strings.tabs.chatLoadingError);
            return;
          }
          setChats((current) => [
            parsed.data,
            ...current.filter((item) => item._id !== parsed.data._id),
          ]);
        });
        socket.on('connect_error', (error: Error) => {
          if (responseTimeout) clearTimeout(responseTimeout);
          setSocketError(
            /unauthorized|authentication|token/i.test(error.message)
              ? strings.tabs.chatAuthError
              : strings.tabs.chatConnectionError,
          );
          setIsConnecting(false);
          setIsRefreshing(false);
        });
        socket.on('disconnect', (reason: string) => {
          if (responseTimeout) clearTimeout(responseTimeout);
          setSocketError(
            reason === 'io server disconnect'
              ? strings.tabs.chatAuthError
              : strings.tabs.chatConnectionError,
          );
          setIsConnecting(false);
          setIsRefreshing(false);
        });
        socket.connect();
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSocketError(getAuthErrorMessage(error, strings.tabs.chatConnectionError));
        setIsConnecting(false);
      });

    return () => {
      active = false;
      if (responseTimeout) clearTimeout(responseTimeout);
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [status, userId]);

  if (status === 'unauthenticated') {
    return <Redirect href={{ pathname: '/(auth)/login', params: { returnTo: 'chat-list' } }} />;
  }

  const openConversation = (chat: ChatPv) => {
    router.push({
      pathname: '/chat/[pvId]',
      params: { pvId: chat._id, adShortLink: chat.adShortLink },
    });
  };

  const refresh = () => {
    if (!socketRef.current?.connected) {
      setSocketError(strings.tabs.chatConnectionError);
      setIsConnecting(true);
      socketRef.current?.connect();
      return;
    }
    setIsRefreshing(true);
    socketRef.current.emit('getAllPv');
  };

  if (userQuery.isError) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text accessibilityRole="alert" style={[styles.message, { color: colors.textSecondary }]}>
          {getAuthErrorMessage(userQuery.error, strings.tabs.chatLoadingError)}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void userQuery.refetch()}>
          <Text style={{ color: colors.primary }}>{strings.common.retry}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{strings.tabs.chatTitle}</Text>
        <Pressable
          accessibilityLabel={strings.common.retry}
          accessibilityRole="button"
          onPress={refresh}
          style={({ pressed }) => [styles.refreshButton, pressed ? styles.pressed : null]}>
          <Text style={{ color: colors.primary }}>{strings.common.retry}</Text>
        </Pressable>
      </View>
      {socketError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
          {socketError}
        </Text>
      ) : null}
      {userQuery.isPending || isConnecting ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary }}>{strings.common.loading}</Text>
        </View>
      ) : chats.length === 0 && !socketError ? (
        <View style={styles.centered}>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {strings.tabs.chatEmpty}
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <ChatRow
              chat={item}
              userId={userId ?? 0}
              colors={colors}
              onPress={() => openConversation(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ChatRow({
  chat,
  userId,
  colors,
  onPress,
}: {
  chat: ChatPv;
  userId: number;
  colors: (typeof Colors)[keyof typeof Colors];
  onPress: () => void;
}) {
  const currentUserId = String(userId);
  const participant = String(chat.sender.id) === currentUserId ? chat.receiver : chat.sender;
  const participantName =
    [participant.name, participant.family].filter(Boolean).join(' ') || strings.tabs.chatUnknownUser;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${chat.ad.title}، ${participantName}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chatRow,
        { borderBottomColor: colors.border },
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.chatDetails}>
        <View style={styles.chatTitleLine}>
          <Text numberOfLines={1} style={[styles.adTitle, { color: colors.text }]}>
            {chat.ad.title}
          </Text>
          <Text style={[styles.time, { color: colors.textSubtle }]}>
            {formatChatTime(chat.lastMessage?.createdAt ?? chat.updatedAt)}
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.participant, { color: colors.textSecondary }]}>
          {participantName}
        </Text>
        <Text numberOfLines={1} style={[styles.lastMessage, { color: colors.textSecondary }]}>
          {chat.lastMessage?.text ?? strings.tabs.chatNoMessages}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'right' },
  refreshButton: { padding: Spacing.two },
  listContent: { flexGrow: 1, paddingHorizontal: Spacing.three },
  chatRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 90,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
  chatDetails: { gap: Spacing.one },
  chatTitleLine: { alignItems: 'center', flexDirection: 'row-reverse', gap: Spacing.two },
  adTitle: { flex: 1, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  time: { fontSize: 11 },
  participant: { fontSize: 12, textAlign: 'right' },
  lastMessage: { fontSize: 13, textAlign: 'right' },
  message: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  error: { paddingHorizontal: Spacing.three, textAlign: 'right' },
  pressed: { opacity: 0.7 },
});
