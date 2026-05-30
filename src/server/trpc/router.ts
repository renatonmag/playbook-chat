import { TRPCError } from "@trpc/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import {
  barAnalysisSchema,
  chartRenderRequestSchema,
  runPriceActionAgent,
  runTradingAgent,
  streamTradingAgent,
} from "~/agent";
import { agentStateSchema } from "~/agent/schemas";
import { db } from "~/db";
import { chatThreadsTable, type ChatMessage } from "~/db/schema";
import { PATTERN_DOCS } from "~/pattern-docs/patterns";
import {
  chatMessagesSchema,
  createMessage,
  createThread,
  deleteThread,
  getLatestThread,
  getThreadById,
  updateThread,
} from "~/server/chat-store";
import {
  EmptyMarketDataRangeError,
  getWinM5CandlesInRange,
  getWinM5Last100Candles,
  InvalidMarketDataRangeError,
  marketDataRangeResponseSchema,
  marketDataResponseSchema,
} from "~/server/market-data";
import { publicProcedure, router } from "./init";

const chatInputSchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().trim().min(1),
});

const priceActionMemorySchema = z.object({
  previousPrediction: z.string().nullable().optional(),
  previousAnalysis: barAnalysisSchema.nullable().optional(),
  history: z.array(barAnalysisSchema).optional(),
});

const reactAnalyzeChartInputSchema = chartRenderRequestSchema.extend({
  previousState: priceActionMemorySchema.optional(),
});

const chatResponseSchema = z.object({
  threadId: z.string().uuid(),
  messages: chatMessagesSchema,
  message: z.string().min(1),
  report: z.string().min(1),
  state: agentStateSchema,
});

const marketDataRangeInputSchema = z.object({
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1),
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
  const userMessage = createMessage("user", input.message);
  const result = await runTradingAgent({
    prompt: input.message,
    history: thread.messages,
    previousMarketState: thread.marketState ?? null,
  });
  const freeformMessage = createMessage("assistant", result.freeform, {
    agentState: result.state,
    responseStyle: "freeform",
  });
  const reportMessage = createMessage("assistant", result.report, {
    agentState: result.state,
    responseStyle: "report",
  });
  const messages = [
    ...thread.messages,
    userMessage,
    freeformMessage,
    reportMessage,
  ];
  const updatedThread = await updateThread(thread.id, messages, {
    marketState: result.marketState,
  });

  return {
    threadId: updatedThread.id,
    messages: updatedThread.messages,
    message: result.freeform,
    report: result.report,
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
  patternDocs: router({
    list: publicProcedure.query(() => PATTERN_DOCS),
  }),
  marketData: router({
    winM5Last100: publicProcedure
      .output(marketDataResponseSchema)
      .query(async () => {
        try {
          return await getWinM5Last100Candles();
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not load WIN@N M5 candle data.",
            cause: error,
          });
        }
      }),
    winM5Range: publicProcedure
      .input(marketDataRangeInputSchema)
      .output(marketDataRangeResponseSchema)
      .query(async ({ input }) => {
        try {
          return await getWinM5CandlesInRange(input);
        } catch (error) {
          if (error instanceof InvalidMarketDataRangeError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error.message,
              cause: error,
            });
          }

          if (error instanceof EmptyMarketDataRangeError) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: error.message,
              cause: error,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not load WIN@N M5 candle data.",
            cause: error,
          });
        }
      }),
  }),
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
        const userMessage = createMessage("user", input.message);
        const messagesWithUser: ChatMessage[] = [
          ...thread.messages,
          userMessage,
        ];
        const userThread = await updateThread(thread.id, messagesWithUser);
        const freeformAssistantMessageId = crypto.randomUUID();
        const reportAssistantMessageId = crypto.randomUUID();
        const assistantMetadata = {
          agentState: "analysis_ready" as const,
          responseStyle: "freeform" as const,
        };
        let assistantStarted = false;

        yield {
          type: "thread" as const,
          threadId: userThread.id,
          userMessage,
        };

        const agentStream = streamTradingAgent(
          {
            prompt: input.message,
            history: thread.messages,
            previousMarketState: thread.marketState ?? null,
          },
          signal,
        );

        let next = await agentStream.next();

        while (!next.done) {
          if (next.value.type === "text_delta") {
            if (!assistantStarted) {
              assistantStarted = true;

              yield {
                type: "assistant_start" as const,
                messageId: freeformAssistantMessageId,
                metadata: assistantMetadata,
              };
            }

            yield {
              type: "assistant_delta" as const,
              messageId: freeformAssistantMessageId,
              delta: next.value.delta,
            };
          } else {
            yield next.value;
          }

          next = await agentStream.next();
        }

        const result = next.value;
        const finalFreeformMetadata = {
          agentState: result.state,
          responseStyle: "freeform" as const,
        };
        const reportMetadata = {
          agentState: result.state,
          responseStyle: "report" as const,
        };
        const freeformMessage: ChatMessage = {
          id: freeformAssistantMessageId,
          role: "assistant",
          content: result.freeform,
          metadata: finalFreeformMetadata,
        };
        const reportMessage: ChatMessage = {
          id: reportAssistantMessageId,
          role: "assistant",
          content: result.report,
          metadata: reportMetadata,
        };
        const finalMessages = [
          ...messagesWithUser,
          freeformMessage,
          reportMessage,
        ];
        const updatedThread = await updateThread(userThread.id, finalMessages, {
          marketState: result.marketState,
        });

        if (!assistantStarted) {
          yield {
            type: "assistant_start" as const,
            messageId: freeformAssistantMessageId,
            metadata: finalFreeformMetadata,
          };
        }

        yield {
          type: "complete" as const,
          threadId: updatedThread.id,
          messages: updatedThread.messages,
          message: result.freeform,
          report: result.report,
          state: result.state,
        };
      }),
  }),
  react: router({
    analyzeChart: publicProcedure
      .input(reactAnalyzeChartInputSchema)
      .mutation(async ({ input }) => {
        const { previousState, ...renderRequest } = input;
        const state = await runPriceActionAgent(renderRequest, previousState);

        if (!state.result) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Price action agent returned no analysis.",
          });
        }

        return {
          analysis: state.result,
          previousState: {
            previousPrediction: state.previousPrediction,
            previousAnalysis: state.previousAnalysis,
            history: state.history,
          },
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
