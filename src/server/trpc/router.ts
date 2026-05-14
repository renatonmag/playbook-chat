import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { runTradingAgent } from "~/agent";
import { agentStateSchema, chatMessageMetadataSchema } from "~/agent/schemas";
import { db } from "~/db";
import {
  chatThreadsTable,
  type ChatMessage,
  type ChatMessageMetadata,
} from "~/db/schema";
import { publicProcedure, router } from "./init";

const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  metadata: chatMessageMetadataSchema.optional(),
});

const chatMessagesSchema = z.array(chatMessageSchema);

function createMessage(
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

async function getLatestThread() {
  const [thread] = await db
    .select()
    .from(chatThreadsTable)
    .orderBy(desc(chatThreadsTable.updatedAt))
    .limit(1);

  return thread ?? null;
}

async function getThreadById(id: string) {
  const [thread] = await db
    .select()
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.id, id))
    .limit(1);

  return thread ?? null;
}

async function createThread(messages: ChatMessage[]) {
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

async function updateThread(id: string, messages: ChatMessage[]) {
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

async function deleteThread(id: string) {
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

export const appRouter = router({
  health: publicProcedure.input(z.void()).query(() => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  })),
  greeting: publicProcedure
    .input(z.object({ name: z.string().trim().min(1).default("trader") }))
    .query(({ input }) => ({
      message: `Hello, ${input.name}.`,
    })),
  threads: router({
    list: publicProcedure.query(() =>
      db
        .select()
        .from(chatThreadsTable)
        .orderBy(desc(chatThreadsTable.updatedAt)),
    ),
    latest: publicProcedure.query(() => getLatestThread()),
    save: publicProcedure
      .input(
        z.object({
          messages: chatMessagesSchema,
        }),
      )
      .mutation(({ input }) => createThread(input.messages)),
    update: publicProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          messages: chatMessagesSchema,
        }),
      )
      .mutation(({ input }) => updateThread(input.id, input.messages)),
    delete: publicProcedure
      .input(
        z.object({
          id: z.string().uuid(),
        }),
      )
      .mutation(({ input }) => deleteThread(input.id)),
  }),
  chat: publicProcedure
    .input(
      z.object({
        threadId: z.string().uuid().optional(),
        message: z.string().trim().min(1),
      }),
    )
    .output(
      z.object({
        threadId: z.string().uuid(),
        messages: chatMessagesSchema,
        message: z.string().min(1),
        state: agentStateSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const existingThread = input.threadId
        ? await getThreadById(input.threadId)
        : await getLatestThread();

      if (input.threadId && !existingThread) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chat thread not found.",
        });
      }

      const thread = existingThread ?? (await createThread([]));
      const userMessage = createMessage("user", input.message);
      const result = await runTradingAgent({
        prompt: input.message,
        history: thread.messages,
      });
      const assistantMessage = createMessage("assistant", result.report, {
        agentState: result.state,
      });
      const messages = [...thread.messages, userMessage, assistantMessage];
      const updatedThread = await updateThread(thread.id, messages);

      return {
        threadId: updatedThread.id,
        messages: updatedThread.messages,
        message: result.report,
        state: result.state,
      };
    }),
});

export type AppRouter = typeof appRouter;
