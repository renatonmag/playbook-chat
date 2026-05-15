import { TRPCError } from "@trpc/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { runTradingAgent, streamTradingAgent } from "~/agent";
import {
  agentStateSchema,
  responseStyleSchema,
} from "~/agent/schemas";
import { db } from "~/db";
import { chatThreadsTable, type ChatMessage } from "~/db/schema";
import {
  chatMessagesSchema,
  createMessage,
  createThread,
  deleteThread,
  getLatestThread,
  getThreadById,
  updateThread,
} from "~/server/chat-store";
import { publicProcedure, router } from "./init";

const chatInputSchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().trim().min(1),
  responseStyle: responseStyleSchema.default("report"),
});

const chatResponseSchema = z.object({
  threadId: z.string().uuid(),
  messages: chatMessagesSchema,
  message: z.string().min(1),
  state: agentStateSchema,
});

async function resolveChatThread(threadId: string | undefined) {
  const existingThread = threadId
    ? await getThreadById(threadId)
    : await getLatestThread();

  if (threadId && !existingThread) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat thread not found.",
    });
  }

  return existingThread ?? (await createThread([]));
}

async function sendChatMessage(input: z.infer<typeof chatInputSchema>) {
  const thread = await resolveChatThread(input.threadId);
  const userMessage = createMessage("user", input.message, {
    responseStyle: input.responseStyle,
  });
  const result = await runTradingAgent({
    prompt: input.message,
    history: thread.messages,
    responseStyle: input.responseStyle,
  });
  const assistantMessage = createMessage("assistant", result.report, {
    agentState: result.state,
    responseStyle: input.responseStyle,
  });
  const messages = [...thread.messages, userMessage, assistantMessage];
  const updatedThread = await updateThread(thread.id, messages);

  return {
    threadId: updatedThread.id,
    messages: updatedThread.messages,
    message: result.report,
    state: result.state,
  };
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
  chat: router({
    send: publicProcedure
      .input(chatInputSchema)
      .output(chatResponseSchema)
      .mutation(({ input }) => sendChatMessage(input)),
    stream: publicProcedure
      .input(chatInputSchema)
      .mutation(async function* ({ input, signal }) {
        const thread = await resolveChatThread(input.threadId);
        const userMessage = createMessage("user", input.message, {
          responseStyle: input.responseStyle,
        });
        const messagesWithUser: ChatMessage[] = [
          ...thread.messages,
          userMessage,
        ];
        const userThread = await updateThread(thread.id, messagesWithUser);

        yield {
          type: "thread" as const,
          threadId: userThread.id,
          userMessage,
        };

        const agentStream = streamTradingAgent(
          {
            prompt: input.message,
            history: thread.messages,
            responseStyle: input.responseStyle,
          },
          signal,
        );

        let next = await agentStream.next();

        while (!next.done) {
          yield next.value;
          next = await agentStream.next();
        }

        const result = next.value;
        const assistantMessage = createMessage("assistant", result.report, {
          agentState: result.state,
          responseStyle: input.responseStyle,
        });
        const finalMessages = [...messagesWithUser, assistantMessage];
        const updatedThread = await updateThread(userThread.id, finalMessages);

        yield {
          type: "complete" as const,
          threadId: updatedThread.id,
          messages: updatedThread.messages,
          message: result.report,
          state: result.state,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
