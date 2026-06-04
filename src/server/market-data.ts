import { z } from "zod";
import { getSupabaseClient } from "./supabase";

const SYMBOL = "WIN@N";
const TIMEFRAME = "M5";
const LAST_CANDLE_COUNT = 100;
const QUERY_PAGE_SIZE = 1_000;
const CANDLE_COLUMNS = "time, open, high, low, close";

const candleSchema = z.object({
  time: z.number().int().positive(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
});

const marketCandleRowSchema = z.object({
  time: z.string().min(1),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
});

export type MarketDataCandle = z.infer<typeof candleSchema>;

export const marketDataResponseSchema = z.object({
  symbol: z.literal(SYMBOL),
  timeframe: z.literal(TIMEFRAME),
  count: z.literal(LAST_CANDLE_COUNT),
  candles: z.array(candleSchema).length(LAST_CANDLE_COUNT),
});

export const marketDataRangeResponseSchema = z.object({
  symbol: z.literal(SYMBOL),
  timeframe: z.literal(TIMEFRAME),
  startDate: z.string(),
  endDate: z.string(),
  count: z.number().int().nonnegative(),
  candles: z.array(candleSchema),
});

export type MarketDataResponse = z.infer<typeof marketDataResponseSchema>;
export type MarketDataRangeResponse = z.infer<
  typeof marketDataRangeResponseSchema
>;

export class InvalidMarketDataRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMarketDataRangeError";
  }
}

export class EmptyMarketDataRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyMarketDataRangeError";
  }
}

export class MarketDataCandleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataCandleNotFoundError";
  }
}

function parseInputDate(value: string, label: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new InvalidMarketDataRangeError(`Invalid ${label}: ${value}`);
  }

  return timestamp;
}

function toEpochSeconds(timestamp: number) {
  return Math.floor(timestamp / 1000);
}

function toIsoSeconds(timestamp: number) {
  return new Date(toEpochSeconds(timestamp) * 1000).toISOString();
}

function parseCandleRow(row: unknown): MarketDataCandle {
  const parsedRow = marketCandleRowSchema.parse(row);
  const timestamp = Date.parse(parsedRow.time);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid market candle timestamp: ${parsedRow.time}`);
  }

  return candleSchema.parse({
    ...parsedRow,
    time: toEpochSeconds(timestamp),
  });
}

function throwQueryError(context: string, error: { message: string }) {
  throw new Error(`${context}: ${error.message}`);
}

export async function getWinM5LastCandles(): Promise<MarketDataResponse> {
  const { data, error } = await getSupabaseClient()
    .from("market_candles")
    .select(CANDLE_COLUMNS)
    .eq("symbol", SYMBOL)
    .eq("timeframe", TIMEFRAME)
    .order("time", { ascending: false })
    .limit(LAST_CANDLE_COUNT);

  if (error) {
    throwQueryError("Could not query latest WIN@N M5 candles", error);
  }

  const candles = (data ?? []).map(parseCandleRow).reverse();

  if (candles.length !== LAST_CANDLE_COUNT) {
    throw new Error(`Expected at least ${LAST_CANDLE_COUNT} candle rows.`);
  }

  return marketDataResponseSchema.parse({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    count: LAST_CANDLE_COUNT,
    candles,
  });
}

export async function getWinM5CandlesInRange(input: {
  startDate: string;
  endDate: string;
}): Promise<MarketDataRangeResponse> {
  const startTimestamp = parseInputDate(input.startDate, "startDate");
  const endTimestamp = parseInputDate(input.endDate, "endDate");

  if (startTimestamp >= endTimestamp) {
    throw new InvalidMarketDataRangeError(
      "startDate must be earlier than endDate.",
    );
  }

  const rangeCandles: MarketDataCandle[] = [];
  let totalCount: number | null = null;
  let offset = 0;

  while (totalCount === null || rangeCandles.length < totalCount) {
    const { count, data, error } = await getSupabaseClient()
      .from("market_candles")
      .select(CANDLE_COLUMNS, { count: "exact" })
      .eq("symbol", SYMBOL)
      .eq("timeframe", TIMEFRAME)
      .gte("time", toIsoSeconds(startTimestamp))
      .lte("time", toIsoSeconds(endTimestamp))
      .order("time", { ascending: true })
      .range(offset, offset + QUERY_PAGE_SIZE - 1);

    if (error) {
      throwQueryError("Could not query WIN@N M5 candles in range", error);
    }

    const rows = data ?? [];
    totalCount = count;
    rangeCandles.push(...rows.map(parseCandleRow));

    if (rows.length === 0) {
      break;
    }

    offset += rows.length;
  }

  if (rangeCandles.length === 0) {
    throw new EmptyMarketDataRangeError(
      "No WIN@N M5 candles found in the requested range.",
    );
  }

  return marketDataRangeResponseSchema.parse({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    startDate: new Date(startTimestamp).toISOString(),
    endDate: new Date(endTimestamp).toISOString(),
    count: rangeCandles.length,
    candles: rangeCandles,
  });
}

export async function getCandlesEndingAt(input: {
  lastCandleTime: string;
  candleCount: number;
  symbol: string;
  timeframe: string;
}): Promise<MarketDataCandle[]> {
  const lastCandleTimestamp = parseInputDate(
    input.lastCandleTime,
    "lastCandleTime",
  );
  const lastCandleTimestampSeconds = toEpochSeconds(lastCandleTimestamp);
  const normalizedLastCandleTime = toIsoSeconds(lastCandleTimestamp);
  const candles: MarketDataCandle[] = [];
  let offset = 0;

  while (candles.length < input.candleCount) {
    const pageSize = Math.min(
      QUERY_PAGE_SIZE,
      input.candleCount - candles.length,
    );
    const { data, error } = await getSupabaseClient()
      .from("market_candles")
      .select(CANDLE_COLUMNS)
      .eq("symbol", input.symbol)
      .eq("timeframe", input.timeframe)
      .lte("time", normalizedLastCandleTime)
      .order("time", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throwQueryError(
        `Could not query ${input.symbol} ${input.timeframe} candles ending at time`,
        error,
      );
    }

    const rows = data ?? [];
    candles.push(...rows.map(parseCandleRow));

    if (rows.length === 0) {
      break;
    }

    offset += rows.length;
  }

  if (candles[0]?.time !== lastCandleTimestampSeconds) {
    throw new MarketDataCandleNotFoundError(
      `No ${input.symbol} ${input.timeframe} candle found at ${normalizedLastCandleTime}.`,
    );
  }

  if (candles.length < input.candleCount) {
    throw new InvalidMarketDataRangeError(
      `Requested ${input.candleCount} ${input.symbol} ${input.timeframe} candles, but only ${candles.length} candles are available at or before ${normalizedLastCandleTime}.`,
    );
  }

  return candles.reverse();
}
