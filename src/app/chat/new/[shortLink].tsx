import { Redirect, useLocalSearchParams } from 'expo-router';

import ChatConversationScreen from '@/features/chat/ChatConversationScreen';

export default function NewChatRoute() {
  const { shortLink: rawShortLink } = useLocalSearchParams<{ shortLink: string | string[] }>();
  const shortLink = Array.isArray(rawShortLink) ? rawShortLink[0] : rawShortLink;

  if (!shortLink) return <Redirect href="/(tabs)/chat" />;
  return <ChatConversationScreen adShortLink={shortLink} />;
}
