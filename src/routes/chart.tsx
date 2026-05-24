import { Show, createSignal, onCleanup, onMount } from "solid-js";
import type {
  CandlestickData,
  IChartApi,
  UTCTimestamp,
} from "lightweight-charts";
import { getTRPCClient } from "~/lib/trpc/client";

type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function toChartCandles(candles: ChartCandle[]): CandlestickData<UTCTimestamp>[] {
  return candles.map(candle => ({
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

export default function Chart() {
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  let chartContainerRef: HTMLDivElement | undefined;
  let chart: IChartApi | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let isDisposed = false;

  onMount(() => {
    void loadChart();
  });

  onCleanup(() => {
    isDisposed = true;
    resizeObserver?.disconnect();
    chart?.remove();
  });

  async function loadChart() {
    if (!chartContainerRef) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const [marketData, lightweightCharts] = await Promise.all([
        getTRPCClient().marketData.winM5Last100.query(),
        import("lightweight-charts"),
      ]);

      if (isDisposed || !chartContainerRef) {
        return;
      }

      const { CandlestickSeries, ColorType, createChart } = lightweightCharts;
      const nextChart = createChart(chartContainerRef, {
        width: chartContainerRef.clientWidth,
        height: chartContainerRef.clientHeight,
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
      const candleSeries = nextChart.addSeries(CandlestickSeries, {
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
      nextChart.timeScale().fitContent();

      resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        nextChart.applyOptions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      });
      resizeObserver.observe(chartContainerRef);
      chart = nextChart;
    } catch (loadError) {
      if (import.meta.env.DEV) {
        console.error("Could not load chart.", loadError);
      }

      if (!isDisposed) {
        setError("Could not load WIN@N M5 candles.");
      }
    } finally {
      if (!isDisposed) {
        setIsLoading(false);
      }
    }
  }

  return (
    <main class="min-h-[calc(100vh-48px)] bg-slate-50">
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h1 class="text-2xl font-semibold tracking-normal text-slate-950">WIN@N</h1>
            <p class="text-sm text-slate-500">M5 - Last 100 candles</p>
          </div>
        </header>

        <section class="relative h-[calc(100vh-9rem)] min-h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div ref={chartContainerRef} class="h-full w-full" />

          <Show when={isLoading()}>
            <div class="absolute inset-0 flex items-center justify-center bg-white/80 text-sm font-medium text-slate-600">
              Loading chart...
            </div>
          </Show>

          <Show when={error()}>
            <div class="absolute inset-0 flex items-center justify-center bg-white/90 px-6 text-center text-sm font-medium text-red-700">
              {error()}
            </div>
          </Show>
        </section>
      </div>
    </main>
  );
}
