import { Redirect, useLocalSearchParams } from 'expo-router';

import ChatConversationScreen from '@/features/chat/ChatConversationScreen';

export default function ExistingChatRoute() {
  const { pvId: rawPvId, adShortLink: rawAdShortLink } = useLocalSearchParams<{
    pvId: string | string[];
    adShortLink: string | string[];
  }>();
  const pvId = Array.isArray(rawPvId) ? rawPvId[0] : rawPvId;
  const adShortLink = Array.isArray(rawAdShortLink) ? rawAdShortLink[0] : rawAdShortLink;

  if (!pvId || !adShortLink) return <Redirect href="/(tabs)/chat" />;
  return <ChatConversationScreen adShortLink={adShortLink} pvId={pvId} />;
}
