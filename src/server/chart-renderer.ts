import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { wma } from "technicalindicators";

const require = createRequire(import.meta.url);
const lightweightChartsPackagePath = require.resolve(
  "lightweight-charts/package.json",
);
const lightweightChartsPath = path.join(
  path.dirname(lightweightChartsPackagePath),
  "dist",
  "lightweight-charts.standalone.production.js",
);

if (!fs.existsSync(lightweightChartsPath)) {
  throw new Error(
    `Could not find Lightweight Charts standalone bundle at ${lightweightChartsPath}.`,
  );
}

export type ChartRenderCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartRenderLinePoint = {
  time: number;
  value: number;
};

export type ChartRenderPayload = {
  symbol?: string;
  timeframe?: string;
  candles: ChartRenderCandle[];
  wma30?: ChartRenderLinePoint[];
};

type ChartRendererOptions = {
  width?: number;
  height?: number;
};

type BrowserChartConfig = {
  width: number;
  height: number;
};

type BrowserPriceFormat = {
  type: "price";
  precision: number;
  minMove: number;
};

type BrowserChartPayload = {
  symbol?: string;
  timeframe?: string;
  candles: ChartRenderCandle[];
  wma30: ChartRenderLinePoint[];
  priceFormat: BrowserPriceFormat;
};

type BrowserSeriesApi = {
  applyOptions(options: unknown): void;
  setData(data: unknown[]): void;
};

type BrowserChartApi = {
  addSeries(seriesDefinition: unknown, options: unknown): BrowserSeriesApi;
  timeScale(): {
    fitContent(): void;
  };
};

type BrowserLightweightCharts = {
  CandlestickSeries: unknown;
  CrosshairMode: {
    Normal: unknown;
  };
  LineSeries: unknown;
  createChart(container: HTMLElement, options: unknown): BrowserChartApi;
};

declare global {
  interface Window {
    LightweightCharts?: BrowserLightweightCharts;
    __chartReady?: boolean;
    setChartData?: (payload: BrowserChartPayload) => void;
  }
}

function calculateWma(candles: ChartRenderCandle[], period = 30) {
  const values = candles.map(candle => candle.close);
  const averages = wma({ period, values });

  return averages.map((value, index) => ({
    time: candles[index + period - 1].time,
    value,
  }));
}

function getDecimalPrecision(value: number) {
  if (Number.isInteger(value)) {
    return 0;
  }

  const [coefficient, exponentText] = Math.abs(value)
    .toString()
    .toLowerCase()
    .split("e");
  const fractionLength = coefficient.split(".")[1]?.length ?? 0;
  const exponent = exponentText ? Number(exponentText) : 0;

  return Math.max(0, fractionLength - exponent);
}

function inferPriceFormat(candle: ChartRenderCandle): BrowserPriceFormat {
  const prices = [candle.open, candle.high, candle.low, candle.close];
  const maximumPrecision = Math.max(...prices.map(getDecimalPrecision));
  const isBelowTen = prices.every(price => Math.abs(price) < 10);

  if (isBelowTen && maximumPrecision >= 4) {
    return {
      type: "price",
      precision: 5,
      minMove: 0.00001,
    };
  }

  if (maximumPrecision >= 3) {
    return {
      type: "price",
      precision: 3,
      minMove: 0.001,
    };
  }

  return {
    type: "price",
    precision: 0,
    minMove: 5,
  };
}

function initializeChartPage(config: BrowserChartConfig) {
  const lightweightCharts = window.LightweightCharts;

  if (!lightweightCharts) {
    throw new Error("Lightweight Charts was not loaded.");
  }

  window.__chartReady = false;

  const chartContainer = document.getElementById("chart");

  if (!chartContainer) {
    throw new Error("Chart container was not found.");
  }

  const chart = lightweightCharts.createChart(chartContainer, {
    width: config.width,
    height: config.height,
    layout: {
      background: { color: "#ffffff" },
      textColor: "#334155",
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: "#e5e7eb" },
      horzLines: { color: "#e5e7eb" },
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

  const candleSeries = chart.addSeries(lightweightCharts.CandlestickSeries, {
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

  const wma30Series = chart.addSeries(lightweightCharts.LineSeries, {
    color: "#2962ff",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
  });

  window.setChartData = payload => {
    window.__chartReady = false;

    const { candles, priceFormat, wma30 } = payload;

    candleSeries.applyOptions({ priceFormat });
    wma30Series.applyOptions({ priceFormat });
    candleSeries.setData(candles);
    wma30Series.setData(wma30);
    chart.timeScale().fitContent();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__chartReady = true;
      });
    });
  };

  window.__chartReady = true;
}

export class ChartRenderer {
  private readonly width: number;
  private readonly height: number;
  private browser: Browser | undefined;
  private page: Page | undefined;
  private renderQueue: Promise<void> = Promise.resolve();

  constructor({ width = 1000, height = 600 }: ChartRendererOptions = {}) {
    this.width = width;
    this.height = height;
  }

  async start() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({
      width: this.width,
      height: this.height,
      deviceScaleFactor: 2,
    });

    await this.page.setContent(this.createHtml(), {
      waitUntil: "load",
    });
    await this.page.addScriptTag({
      path: lightweightChartsPath,
    });

    await this.page.evaluate(initializeChartPage, {
      width: this.width,
      height: this.height,
    });
  }

  async render(payload: ChartRenderPayload) {
    const renderTask = this.renderQueue
      .catch(() => undefined)
      .then(() => this.renderInternal(payload));

    this.renderQueue = renderTask.then(
      () => undefined,
      () => undefined,
    );

    return renderTask;
  }

  async stop() {
    await this.browser?.close();

    this.browser = undefined;
    this.page = undefined;
  }

  private createHtml() {
    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            html,
            body {
              margin: 0;
              padding: 0;
              width: ${this.width}px;
              height: ${this.height}px;
              background: #ffffff;
              overflow: hidden;
              font-family: Inter, Arial, sans-serif;
            }

            #wrapper {
              position: relative;
              width: ${this.width}px;
              height: ${this.height}px;
              background: #ffffff;
            }

            #chart {
              width: ${this.width}px;
              height: ${this.height}px;
            }
          </style>
        </head>
        <body>
          <div id="wrapper">
            <div id="chart"></div>
          </div>
        </body>
      </html>
    `;
  }

  private async renderInternal(payload: ChartRenderPayload) {
    if (!this.page) {
      throw new Error("ChartRenderer has not been started. Call start() first.");
    }

    if (!Array.isArray(payload.candles) || payload.candles.length === 0) {
      throw new Error("payload.candles must be a non-empty array.");
    }

    const wma30 = payload.wma30 ?? calculateWma(payload.candles, 30);
    const browserPayload = {
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      candles: payload.candles,
      wma30,
      priceFormat: inferPriceFormat(payload.candles[0]),
    } satisfies BrowserChartPayload;

    await this.page.evaluate(nextPayload => {
      if (!window.setChartData) {
        throw new Error("Chart data setter was not initialized.");
      }

      window.setChartData(nextPayload);
    }, browserPayload);

    await this.page.waitForFunction(() => window.__chartReady === true, {
      timeout: 5000,
    });

    const chartElement = await this.page.$("#wrapper");

    if (!chartElement) {
      throw new Error("Chart wrapper was not found.");
    }

    return Buffer.from(await chartElement.screenshot({ type: "png" }));
  }
}
