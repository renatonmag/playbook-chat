import type {
  CandlestickData,
  IChartApi,
  UTCTimestamp,
} from "lightweight-charts";
import { getTRPCClient } from "~/lib/trpc/client";

export type WinM5ChartScreenshotInput = {
  startDate: string | Date;
  endDate: string | Date;
  width?: number;
  height?: number;
};

type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const DEFAULT_CHART_WIDTH = 1200;
const DEFAULT_CHART_HEIGHT = 720;

function normalizeDate(value: string | Date, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ${label}.`);
  }

  return {
    iso: date.toISOString(),
    timestamp,
    timestampSeconds: Math.floor(timestamp / 1000),
  };
}

function normalizeDimension(
  value: number | undefined,
  fallback: number,
  label: string,
) {
  const dimension = value ?? fallback;

  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return dimension;
}

function toChartCandles(candles: ChartCandle[]): CandlestickData<UTCTimestamp>[] {
  return candles.map(candle => ({
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

function createOffscreenContainer(width: number, height: number) {
  const container = document.createElement("div");

  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.pointerEvents = "none";

  document.body.append(container);

  return container;
}

function waitForAnimationFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

export async function takeWinM5ChartScreenshot(
  input: WinM5ChartScreenshotInput,
): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("Chart screenshots require a browser DOM.");
  }

  const startDate = normalizeDate(input.startDate, "startDate");
  const endDate = normalizeDate(input.endDate, "endDate");

  if (startDate.timestamp >= endDate.timestamp) {
    throw new Error("startDate must be earlier than endDate.");
  }

  const width = normalizeDimension(input.width, DEFAULT_CHART_WIDTH, "width");
  const height = normalizeDimension(input.height, DEFAULT_CHART_HEIGHT, "height");
  const marketData = await getTRPCClient().marketData.winM5Range.query({
    startDate: startDate.iso,
    endDate: endDate.iso,
  });
  const container = createOffscreenContainer(width, height);
  let chart: IChartApi | undefined;

  try {
    const lightweightCharts = await import("lightweight-charts");
    const { CandlestickSeries, ColorType, createChart } = lightweightCharts;

    chart = createChart(container, {
      width,
      height,
      layout: {
        background: {
          type: ColorType.Solid,
          color: "#ffffff",
        },
        textColor: "#334155",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
      grid: {
        vertLines: {
          color: "#e5e7eb",
        },
        horzLines: {
          color: "#e5e7eb",
        },
      },
      rightPriceScale: {
        borderColor: "#cbd5e1",
        visible: true,
      },
      timeScale: {
        borderColor: "#cbd5e1",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: lightweightCharts.CrosshairMode.Normal,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#089981",
      downColor: "#f23645",
      borderVisible: false,
      wickUpColor: "#089981",
      wickDownColor: "#f23645",
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 5,
      },
    });

    candleSeries.setData(toChartCandles(marketData.candles));
    chart.timeScale().setVisibleRange({
      from: startDate.timestampSeconds as UTCTimestamp,
      to: endDate.timestampSeconds as UTCTimestamp,
    });

    await waitForAnimationFrame();
    await waitForAnimationFrame();

    const canvas = chart.takeScreenshot(true, false);
    const dataUrl = canvas.toDataURL("image/png");

    if (!dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("Could not serialize chart screenshot.");
    }

    return dataUrl;
  } finally {
    chart?.remove();
    container.remove();
  }
}
