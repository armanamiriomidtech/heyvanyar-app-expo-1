import { z } from 'zod';

const userIdSchema = z.union([z.string(), z.number().int()]);

export const chatMessageSchema = z
  .object({
    _id: z.string(),
    senderId: userIdSchema,
    type: z.enum(['text', 'image', 'video', 'audio', 'file']).optional(),
    content: z
      .object({
        text: z.string().optional(),
        media: z
          .object({
            url: z.string(),
            thumbnail: z.string().optional(),
            size: z.number().optional(),
            format: z.string().optional(),
          })
          .optional(),
      })
      .passthrough(),
    repliedTo: z
      .object({
        messageId: z.string(),
        content: z.string(),
        senderId: userIdSchema,
      })
      .optional(),
    createdAt: z.string(),
    isRead: z.boolean().optional(),
    seenBy: z
      .array(z.object({ userId: userIdSchema, seenAt: z.string().optional() }).passthrough())
      .optional(),
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
        isRead: z.boolean().optional(),
        seenBy: z
          .array(z.object({ userId: userIdSchema, seenAt: z.string().optional() }).passthrough())
          .optional(),
      })
      .passthrough()
      .optional(),
    updatedAt: z.string().optional(),
    unreadCount: z.number().int().nonnegative().optional(),
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
