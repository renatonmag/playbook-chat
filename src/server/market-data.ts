import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const WIN_M5_CSV_PATH = path.join(
  process.cwd(),
  "data",
  "WIN@N_M5_202210171545_202605221830.csv",
);

const candleSchema = z.object({
  time: z.number().int().positive(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
});

export type MarketDataCandle = z.infer<typeof candleSchema>;

export const marketDataResponseSchema = z.object({
  symbol: z.literal("WIN@N"),
  timeframe: z.literal("M5"),
  count: z.literal(100),
  candles: z.array(candleSchema).length(100),
});

export const marketDataRangeResponseSchema = z.object({
  symbol: z.literal("WIN@N"),
  timeframe: z.literal("M5"),
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

function parseCsvTimestamp(dateValue: string, timeValue: string) {
  const dateParts = dateValue.split(".").map(Number);
  const timeParts = timeValue.split(":").map(Number);

  if (dateParts.length !== 3 || timeParts.length !== 3) {
    throw new Error(`Invalid candle timestamp: ${dateValue} ${timeValue}`);
  }

  const [year, month, day] = dateParts;
  const [hour, minute, second] = timeParts;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    throw new Error(`Invalid candle timestamp: ${dateValue} ${timeValue}`);
  }

  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const normalizedDate = new Date(timestamp);

  if (
    normalizedDate.getUTCFullYear() !== year ||
    normalizedDate.getUTCMonth() !== month - 1 ||
    normalizedDate.getUTCDate() !== day ||
    normalizedDate.getUTCHours() !== hour ||
    normalizedDate.getUTCMinutes() !== minute ||
    normalizedDate.getUTCSeconds() !== second
  ) {
    throw new Error(`Invalid candle timestamp: ${dateValue} ${timeValue}`);
  }

  return timestamp / 1000;
}

function parseNumber(value: string, label: string) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid ${label} value: ${value}`);
  }

  return parsedValue;
}

function parseCandleRow(row: string) {
  const columns = row.split("\t");

  if (columns.length !== 9) {
    throw new Error(`Invalid candle row: ${row}`);
  }

  const [dateValue, timeValue, open, high, low, close] = columns;

  return candleSchema.parse({
    time: parseCsvTimestamp(dateValue, timeValue),
    open: parseNumber(open, "open"),
    high: parseNumber(high, "high"),
    low: parseNumber(low, "low"),
    close: parseNumber(close, "close"),
  });
}

async function readWinM5Candles() {
  const contents = await readFile(WIN_M5_CSV_PATH, "utf8");
  const lines = contents
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const rows = lines.slice(1);

  return rows
    .map(parseCandleRow)
    .sort((left, right) => left.time - right.time);
}

let winM5CandlesPromise: Promise<MarketDataCandle[]> | undefined;

export function loadWinM5Candles(): Promise<MarketDataCandle[]> {
  winM5CandlesPromise ??= readWinM5Candles();

  return winM5CandlesPromise;
}

function parseInputDate(value: string, label: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new InvalidMarketDataRangeError(`Invalid ${label}: ${value}`);
  }

  return timestamp;
}

export async function getWinM5Last100Candles(): Promise<MarketDataResponse> {
  const candles = await loadWinM5Candles();
  const lastCandles = candles.slice(-100);

  if (lastCandles.length < 100) {
    throw new Error("Expected at least 100 candle rows.");
  }

  return marketDataResponseSchema.parse({
    symbol: "WIN@N",
    timeframe: "M5",
    count: 100,
    candles: lastCandles,
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

  const startTimestampSeconds = Math.floor(startTimestamp / 1000);
  const endTimestampSeconds = Math.floor(endTimestamp / 1000);
  const candles = await loadWinM5Candles();
  const rangeCandles = candles.filter(
    candle =>
      candle.time >= startTimestampSeconds && candle.time <= endTimestampSeconds,
  );

  if (rangeCandles.length === 0) {
    throw new EmptyMarketDataRangeError(
      "No WIN@N M5 candles found in the requested range.",
    );
  }

  return marketDataRangeResponseSchema.parse({
    symbol: "WIN@N",
    timeframe: "M5",
    startDate: new Date(startTimestamp).toISOString(),
    endDate: new Date(endTimestamp).toISOString(),
    count: rangeCandles.length,
    candles: rangeCandles,
  });
}

export function getCandlesEndingAt(input: {
  candles: readonly MarketDataCandle[];
  lastCandleTime: string;
  candleCount: number;
}): MarketDataCandle[] {
  const lastCandleTimestamp = parseInputDate(
    input.lastCandleTime,
    "lastCandleTime",
  );
  const lastCandleTimestampSeconds = Math.floor(lastCandleTimestamp / 1000);
  const matchedIndex = input.candles.findIndex(
    candle => candle.time === lastCandleTimestampSeconds,
  );

  if (matchedIndex === -1) {
    const normalizedLastCandleTime = new Date(
      lastCandleTimestamp,
    ).toISOString();

    throw new MarketDataCandleNotFoundError(
      `No WIN@N M5 candle found at ${normalizedLastCandleTime}.`,
    );
  }

  const endIndex = matchedIndex + 1;
  const startIndex = endIndex - input.candleCount;

  if (startIndex < 0) {
    const normalizedLastCandleTime = new Date(
      lastCandleTimestamp,
    ).toISOString();

    throw new InvalidMarketDataRangeError(
      `Requested ${input.candleCount} candles, but only ${endIndex} candles are available at or before ${normalizedLastCandleTime}.`,
    );
  }

  return input.candles.slice(startIndex, endIndex);
}
