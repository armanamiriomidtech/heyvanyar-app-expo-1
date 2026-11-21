import { z } from 'zod';

const userIdSchema = z.union([z.string(), z.number().int()]);

export const chatMessageSchema = z
  .object({
    _id: z.string(),
    senderId: userIdSchema,
    content: z.object({ text: z.string().optional() }).passthrough(),
    createdAt: z.string(),
  })
  .passthrough();

export const chatPvSchema = z
  .object({
    _id: z.string(),
    sender: z
      .object({
        id: userIdSchema,
        name: z.string().optional(),
        family: z.string().optional(),
      })
      .passthrough(),
    receiver: z
      .object({
        id: userIdSchema,
        name: z.string().optional(),
        family: z.string().optional(),
      })
      .passthrough(),
    adShortLink: z.string(),
    ad: z
      .object({
        title: z.string(),
        image: z.string().nullable().optional(),
      })
      .passthrough(),
    lastMessage: z
      .object({
        text: z.string().optional(),
        senderId: userIdSchema.optional(),
        createdAt: z.string().optional(),
      })
      .passthrough()
      .optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const chatMessagesResponseSchema = z
  .object({
    messages: z.array(chatMessageSchema),
    totalMessages: z.number().int().nonnegative(),
  })
  .passthrough();

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatPv = z.infer<typeof chatPvSchema>;
