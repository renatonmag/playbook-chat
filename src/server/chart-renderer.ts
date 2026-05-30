import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer, { type Browser, type Page } from "puppeteer";

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
  ma20?: ChartRenderLinePoint[];
};

type ChartRendererOptions = {
  width?: number;
  height?: number;
};

function calculateSma(candles: ChartRenderCandle[], period = 20) {
  const result: ChartRenderLinePoint[] = [];

  for (let index = period - 1; index < candles.length; index += 1) {
    const slice = candles.slice(index - period + 1, index + 1);
    const average =
      slice.reduce((sum, candle) => sum + candle.close, 0) / period;

    result.push({
      time: candles[index].time,
      value: Number(average.toFixed(2)),
    });
  }

  return result;
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

    await this.page.evaluate(this.createChartScript());
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

  private createChartScript() {
    return `
      (() => {
        window.__chartReady = false;

        const chartContainer = document.getElementById("chart");

        if (!chartContainer) {
          throw new Error("Chart container was not found.");
        }

        const chart = LightweightCharts.createChart(chartContainer, {
          width: ${JSON.stringify(this.width)},
          height: ${JSON.stringify(this.height)},
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
            mode: LightweightCharts.CrosshairMode.Normal,
          },
        });

        const candleSeries = chart.addSeries(
          LightweightCharts.CandlestickSeries,
          {
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
          },
        );

        const ma20Series = chart.addSeries(LightweightCharts.LineSeries, {
          color: "#2962ff",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });

        window.setChartData = function setChartData(payload) {
          window.__chartReady = false;

          const { candles, ma20 } = payload;

          candleSeries.setData(candles);
          ma20Series.setData(ma20 || []);
          chart.timeScale().fitContent();

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.__chartReady = true;
            });
          });
        };

        window.__chartReady = true;
      })();
    `;
  }

  private async renderInternal(payload: ChartRenderPayload) {
    if (!this.page) {
      throw new Error("ChartRenderer has not been started. Call start() first.");
    }

    if (!Array.isArray(payload.candles) || payload.candles.length === 0) {
      throw new Error("payload.candles must be a non-empty array.");
    }

    const ma20 = payload.ma20 ?? calculateSma(payload.candles, 20);

    await this.page.evaluate(
      `window.setChartData(${JSON.stringify({
        symbol: payload.symbol,
        timeframe: payload.timeframe,
        candles: payload.candles,
        ma20,
      } satisfies ChartRenderPayload)})`,
    );

    await this.page.waitForFunction("window.__chartReady === true", {
      timeout: 5000,
    });

    const chartElement = await this.page.$("#wrapper");

    if (!chartElement) {
      throw new Error("Chart wrapper was not found.");
    }

    return Buffer.from(await chartElement.screenshot({ type: "png" }));
  }
}
