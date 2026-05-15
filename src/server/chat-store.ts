import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { chatMessageMetadataSchema } from "~/agent/schemas";
import { db } from "~/db";
import {
  chatThreadsTable,
  type ChatMessage,
  type ChatMessageMetadata,
} from "~/db/schema";

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  metadata: chatMessageMetadataSchema.optional(),
});

export const chatMessagesSchema = z.array(chatMessageSchema);

export function createMessage(
  role: ChatMessage["role"],
  content: string,
  metadata?: ChatMessageMetadata,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    ...(metadata ? { metadata } : {}),
  };
}

export async function getLatestThread() {
  const [thread] = await db
    .select()
    .from(chatThreadsTable)
    .orderBy(desc(chatThreadsTable.updatedAt))
    .limit(1);

  return thread ?? null;
}

export async function getThreadById(id: string) {
  const [thread] = await db
    .select()
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.id, id))
    .limit(1);

  return thread ?? null;
}

export async function createThread(messages: ChatMessage[]) {
  const id = crypto.randomUUID();

  await db.insert(chatThreadsTable).values({
    id,
    messages,
  });

  const thread = await getThreadById(id);

  if (!thread) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not create chat thread.",
    });
  }

  return thread;
}

export async function updateThread(id: string, messages: ChatMessage[]) {
  await db
    .update(chatThreadsTable)
    .set({
      messages,
      updatedAt: new Date(),
    })
    .where(eq(chatThreadsTable.id, id));

  const thread = await getThreadById(id);

  if (!thread) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat thread not found.",
    });
  }

  return thread;
}

export async function deleteThread(id: string) {
  const thread = await getThreadById(id);

  if (!thread) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat thread not found.",
    });
  }

  await db.delete(chatThreadsTable).where(eq(chatThreadsTable.id, id));

  return { id };
}
