import { z } from 'zod';

import { strings } from '@/constants/strings';
import { http } from '@/services/http';

import { getStoredMedia } from './mediaStorage';

const uploadResultSchema = z
  .object({
    id: z.number().int().positive(),
    storedName: z.string().min(1),
  })
  .strict();

const chatMediaUploadResultSchema = z
  .object({
    storedName: z.string().min(1),
    fullUrl: z.string().url(),
  })
  .passthrough();

export async function uploadChatMedia(
  key: string,
  uri: string,
  fileName: string,
  type: 'image' | 'video',
  signal: AbortSignal,
): Promise<{ storedName: string; fullUrl: string; size: number }> {
  const file = await getStoredMedia(key, uri);
  const path = type === 'video' ? '/files-v2/upload-video' : '/files-v2/upload-image';
  const response = await http.uploadFile(path, file, fileName, signal);
  const parsed = chatMediaUploadResultSchema.safeParse(response);
  if (!parsed.success) throw new Error(strings.auth.invalidResponse);
  return { storedName: parsed.data.storedName, fullUrl: parsed.data.fullUrl, size: file.size };
}

export async function uploadAdImage(
  key: string,
  uri: string,
  fileName: string,
  signal: AbortSignal,
): Promise<{ id: number }> {
  const file = await getStoredMedia(key, uri);
  const response = await http.uploadFile('/files-v2/upload-image', file, fileName, signal);
  const parsed = uploadResultSchema.safeParse(response);
  if (!parsed.success) throw new Error(strings.auth.invalidResponse);
  return { id: parsed.data.id };
}

export async function uploadAdVideo(
  key: string,
  uri: string,
  fileName: string,
  signal: AbortSignal,
): Promise<{ storedName: string }> {
  const file = await getStoredMedia(key, uri);
  const response = await http.uploadFile('/files-v2/upload-video', file, fileName, signal);
  const parsed = uploadResultSchema.safeParse(response);
  if (!parsed.success) throw new Error(strings.auth.invalidResponse);
  return { storedName: parsed.data.storedName };
}
