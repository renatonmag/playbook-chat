import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  barAnalysisSchema,
  chartRenderRequestSchema,
  predictionMemorySchema,
} from "~/agent";
import { db } from "~/db";
import {
  reactThreadsTable,
  type ReactThreadState,
} from "~/db/schema";

export const reactAnalysisHistoryItemSchema = z.object({
  candleTime: z.string().trim().min(1),
  chartRequest: chartRenderRequestSchema,
  analysis: barAnalysisSchema,
});

export const reactThreadStateSchema = z.object({
  lastCandleTime: z.string().trim().min(1),
  candleCount: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  timeframe: z.string().trim().min(1),
  previousState: predictionMemorySchema,
  analysisHistory: z.array(reactAnalysisHistoryItemSchema),
});

export type ReactThread = typeof reactThreadsTable.$inferSelect;

export type ReactThreadSummary = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastCandleTime: string;
  symbol: string;
  timeframe: string;
  analysisCount: number;
};

function makeReactThreadTitle(state: ReactThreadState) {
  return `${state.symbol} ${state.timeframe} - ${state.lastCandleTime}`;
}

function summarizeReactThread(thread: ReactThread): ReactThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastCandleTime: thread.state.lastCandleTime,
    symbol: thread.state.symbol,
    timeframe: thread.state.timeframe,
    analysisCount: thread.state.analysisHistory.length,
  };
}

function parseReactThreadState(state: ReactThreadState) {
  return reactThreadStateSchema.parse(state);
}

export async function getReactThreads() {
  const threads = await db
    .select()
    .from(reactThreadsTable)
    .orderBy(desc(reactThreadsTable.updatedAt));

  return threads.map(summarizeReactThread);
}

export async function getReactThreadById(id: string) {
  const [thread] = await db
    .select()
    .from(reactThreadsTable)
    .where(eq(reactThreadsTable.id, id))
    .limit(1);

  return thread ?? null;
}

export async function createReactThread(state: ReactThreadState) {
  const parsedState = parseReactThreadState(state);
  const id = crypto.randomUUID();

  await db.insert(reactThreadsTable).values({
    id,
    title: makeReactThreadTitle(parsedState),
    state: parsedState,
  });

  const thread = await getReactThreadById(id);

  if (!thread) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not create React thread.",
    });
  }

  return thread;
}

export async function updateReactThread(id: string, state: ReactThreadState) {
  const parsedState = parseReactThreadState(state);

  await db
    .update(reactThreadsTable)
    .set({
      title: makeReactThreadTitle(parsedState),
      state: parsedState,
      updatedAt: new Date(),
    })
    .where(eq(reactThreadsTable.id, id));

  const thread = await getReactThreadById(id);

  if (!thread) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "React thread not found.",
    });
  }

  return thread;
}

export async function deleteReactThread(id: string) {
  const thread = await getReactThreadById(id);

  if (!thread) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "React thread not found.",
    });
  }

  await db.delete(reactThreadsTable).where(eq(reactThreadsTable.id, id));

  return { id };
}
