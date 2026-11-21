import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

import { env } from '@/constants/env';

export type ChatNamespace = 'chat-pv' | 'chat-message';

export function createChatSocket(
  namespace: ChatNamespace,
  accessToken: string,
  userId: number,
): Socket {
  return io(`${env.chatUrl}/${namespace}`, {
    autoConnect: false,
    timeout: 10_000,
    query: { userId: String(userId) },
    auth: { accessToken },
    extraHeaders: { Cookie: `accessToken=${accessToken}` },
    withCredentials: true,
  });
}
