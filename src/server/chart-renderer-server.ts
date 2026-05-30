import express from "express";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { ChartRenderer, type ChartRenderCandle } from "./chart-renderer";
import {
  getCandlesEndingAt,
  InvalidMarketDataRangeError,
  loadWinM5Candles,
  MarketDataCandleNotFoundError,
  type MarketDataCandle,
} from "./market-data";

const DEFAULT_PORT = 3001;
const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 600;
const DEFAULT_OUTPUT_FILE = "latest-chart.png";
const MAX_CANDLES = 200;

const chartCandleSchema = z.object({
  time: z.number().int().positive(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
});

const renderRequestSchema = z.object({
  lastCandleTime: z.string().trim().min(1),
  candleCount: z.number().int().positive(),
  symbol: z.string().trim().optional(),
  timeframe: z.string().trim().optional(),
});

const newBarRequestSchema = chartCandleSchema.extend({
  symbol: z.string().trim().optional(),
  timeframe: z.string().trim().optional(),
});

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
  label: string,
) {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsedValue;
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .map(issue => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";

        return `${path}${issue.message}`;
      })
      .join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}

function generateDemoCandles(count = 120): ChartRenderCandle[] {
  const candles: ChartRenderCandle[] = [];
  let price = 100;
  const start = Math.floor(Date.now() / 1000) - count * 60 * 15;

  for (let index = 0; index < count; index += 1) {
    const open = price;
    const movement = (Math.random() - 0.48) * 3;
    const close = open + movement;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    price = close;

    candles.push({
      time: start + index * 60 * 15,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    });
  }

  return candles;
}

const port = parsePositiveIntegerEnv(
  process.env.CHART_RENDERER_PORT,
  DEFAULT_PORT,
  "CHART_RENDERER_PORT",
);
const width = parsePositiveIntegerEnv(
  process.env.CHART_RENDERER_WIDTH,
  DEFAULT_WIDTH,
  "CHART_RENDERER_WIDTH",
);
const height = parsePositiveIntegerEnv(
  process.env.CHART_RENDERER_HEIGHT,
  DEFAULT_HEIGHT,
  "CHART_RENDERER_HEIGHT",
);
const outputFile =
  process.env.CHART_RENDERER_OUTPUT_FILE?.trim() || DEFAULT_OUTPUT_FILE;

const app = express();
app.use(express.json({ limit: "10mb" }));

const renderer = new ChartRenderer({
  width,
  height,
});
let loadedCandles: MarketDataCandle[] = [];
let legacyCandles = generateDemoCandles();

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    ready: loadedCandles.length > 0,
    candles: loadedCandles.length,
  });
});

app.get("/chart.png", async (_request, response) => {
  try {
    const latestCandles = loadedCandles.slice(
      -Math.min(100, loadedCandles.length),
    );

    const png = await renderer.render({
      symbol: "WIN@N",
      timeframe: "M5",
      candles: latestCandles,
    });

    response.setHeader("Content-Type", "image/png");
    response.send(png);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: getErrorMessage(error),
    });
  }
});

app.post("/new-bar", async (request, response) => {
  try {
    const bar = newBarRequestSchema.parse(request.body);
    const nextCandle: ChartRenderCandle = {
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    };

    legacyCandles = [...legacyCandles, nextCandle].slice(-MAX_CANDLES);

    const png = await renderer.render({
      symbol: bar.symbol || "BTCUSDT",
      timeframe: bar.timeframe || "15m",
      candles: legacyCandles,
    });

    await writeFile(outputFile, png);

    response.json({
      ok: true,
      message: "New bar processed and chart image rendered.",
      imageFile: outputFile,
      candles: legacyCandles.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: getErrorMessage(error),
      });
      return;
    }

    console.error(error);
    response.status(500).json({
      error: getErrorMessage(error),
    });
  }
});

app.post("/render", async (request, response) => {
  try {
    const payload = renderRequestSchema.parse(request.body);
    const selectedCandles = getCandlesEndingAt({
      candles: loadedCandles,
      lastCandleTime: payload.lastCandleTime,
      candleCount: payload.candleCount,
    });
    const png = await renderer.render({
      symbol: payload.symbol || "WIN@N",
      timeframe: payload.timeframe || "M5",
      candles: selectedCandles,
    });

    response.setHeader("Content-Type", "image/png");
    response.send(png);
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: getErrorMessage(error),
      });
      return;
    }

    if (error instanceof InvalidMarketDataRangeError) {
      response.status(400).json({
        error: getErrorMessage(error),
      });
      return;
    }

    if (error instanceof MarketDataCandleNotFoundError) {
      response.status(404).json({
        error: getErrorMessage(error),
      });
      return;
    }

    console.error(error);
    response.status(500).json({
      error: getErrorMessage(error),
    });
  }
});

async function stopRendererAndExit(signal: NodeJS.Signals) {
  console.log(`Received ${signal}. Stopping renderer...`);
  await renderer.stop();
  process.exit(0);
}

async function main() {
  loadedCandles = await loadWinM5Candles();
  await renderer.start();

  app.listen(port, () => {
    console.log(`Renderer running on http://localhost:${port}`);
    console.log(`Loaded ${loadedCandles.length} WIN@N M5 candles.`);
    console.log(`Open latest chart: http://localhost:${port}/chart.png`);
  });
}

process.on("SIGINT", () => {
  void stopRendererAndExit("SIGINT");
});

process.on("SIGTERM", () => {
  void stopRendererAndExit("SIGTERM");
});

main().catch(async error => {
  console.error(error);
  await renderer.stop();
  process.exit(1);
});
