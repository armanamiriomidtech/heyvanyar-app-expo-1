// src/constants/env.ts
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing env variable: ${name}`);
  return value;
}

export const env = {
  apiUrl: required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL'),
  chatUrl: getChatUrl(),
};

function getChatUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_CHAT_URL;
  if (configuredUrl) return new URL(configuredUrl).origin;

  const url = new URL(required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL'));
  url.port = '5001';
  return url.origin;
}

// after change env run this => npx expo start -c