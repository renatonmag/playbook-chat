import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import {
  ChevronRight,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-solid";
import { getTRPCClient } from "~/lib/trpc/client";

type BarAnalysis = {
  mode: "initial_analysis" | "followup_analysis";
  corroborationWithPreviousPrediction: string | null;
  alBrooksContext: string;
  prediction: string;
  invalidation: string;
};

type PriceActionMemory = {
  immediatePredictions: string[];
};

type ChartRenderRequest = {
  lastCandleTime: string;
  candleCount: number;
  symbol: string;
  timeframe: string;
};

type ReactAnalysisHistoryItem = {
  candleTime: string;
  chartRequest: ChartRenderRequest;
  analysis: BarAnalysis;
};

type ReactThreadState = {
  lastCandleTime: string;
  candleCount: number;
  symbol: string;
  timeframe: string;
  previousState: PriceActionMemory;
  analysisHistory: ReactAnalysisHistoryItem[];
};

type ReactThread = {
  id: string;
  title: string;
  state: ReactThreadState;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ReactThreadSummary = {
  id: string;
  title: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastCandleTime: string;
  symbol: string;
  timeframe: string;
  analysisCount: number;
};

const INITIAL_LAST_CANDLE_TIME = "2026-05-22T09:05:00Z";
const DEFAULT_CANDLE_COUNT = 50;
const DEFAULT_SYMBOL = "WIN@N";
const DEFAULT_TIMEFRAME = "M5";
const TIMEFRAME_STEP_MINUTES = 5;

function addFiveMinutes(isoTime: string) {
  const timestamp = Date.parse(isoTime);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Invalid candle time.");
  }

  return new Date(timestamp + TIMEFRAME_STEP_MINUTES * 60 * 1000).toISOString();
}

function AnalysisSection(props: { label: string; value: string | null }) {
  return (
    <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </h2>
      <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">
        {props.value || "No follow-up prediction available yet."}
      </p>
    </section>
  );
}

function formatDateTime(value: Date | string) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return String(value);
  }

  return new Date(timestamp).toLocaleString();
}

export default function ReactChat() {
  const [threadId, setThreadId] = createSignal<string>();
  const [threads, setThreads] = createSignal<ReactThreadSummary[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = createSignal(false);
  const [lastCandleTime, setLastCandleTime] = createSignal(
    INITIAL_LAST_CANDLE_TIME,
  );
  const [candleCount, setCandleCount] = createSignal(DEFAULT_CANDLE_COUNT);
  const [symbol, setSymbol] = createSignal(DEFAULT_SYMBOL);
  const [timeframe, setTimeframe] = createSignal(DEFAULT_TIMEFRAME);
  const [analysis, setAnalysis] = createSignal<BarAnalysis>();
  const [previousState, setPreviousState] = createSignal<PriceActionMemory>({
    immediatePredictions: [],
  });
  const [analysisHistory, setAnalysisHistory] = createSignal<
    ReactAnalysisHistoryItem[]
  >([]);
  const [selectedAnalysisIndex, setSelectedAnalysisIndex] = createSignal<
    number | null
  >(null);
  const [isAnalyzing, setIsAnalyzing] = createSignal(false);
  const [error, setError] = createSignal("");
  const formattedCandleTime = createMemo(() => {
    const timestamp = Date.parse(lastCandleTime());

    if (!Number.isFinite(timestamp)) {
      return lastCandleTime();
    }

    return new Date(timestamp).toISOString();
  });
  const selectedHistoryItem = createMemo(() => {
    const index = selectedAnalysisIndex();

    return index === null ? null : (analysisHistory()[index] ?? null);
  });

  onMount(() => {
    void loadThreads();
  });

  async function loadThreads() {
    setIsLoadingThreads(true);

    try {
      setThreads(await getTRPCClient().react.threads.list.query());
    } catch (threadsError) {
      if (import.meta.env.DEV) {
        console.error("Could not load React threads.", threadsError);
      }

      setError("Could not load previous analysis threads.");
    } finally {
      setIsLoadingThreads(false);
    }
  }

  function applyThreadState(thread: ReactThread) {
    const latestAnalysis =
      thread.state.analysisHistory.at(-1)?.analysis ?? undefined;

    setThreadId(thread.id);
    setLastCandleTime(thread.state.lastCandleTime);
    setCandleCount(thread.state.candleCount);
    setSymbol(thread.state.symbol);
    setTimeframe(thread.state.timeframe);
    setPreviousState(thread.state.previousState);
    setAnalysisHistory(thread.state.analysisHistory);
    setAnalysis(latestAnalysis);
    setSelectedAnalysisIndex(null);
    setError("");
  }

  function loadHistoryAnalysis(index: number) {
    const historyItem = analysisHistory()[index];

    if (!historyItem) {
      return;
    }

    setAnalysis(historyItem.analysis);
    setLastCandleTime(historyItem.candleTime);
    setSelectedAnalysisIndex(index);
  }

  function loadLatestAnalysis() {
    const latestHistoryItem = analysisHistory().at(-1);

    if (!latestHistoryItem) {
      setAnalysis(undefined);
      setSelectedAnalysisIndex(null);
      return;
    }

    setAnalysis(latestHistoryItem.analysis);
    setLastCandleTime(latestHistoryItem.candleTime);
    setSelectedAnalysisIndex(null);
  }

  async function loadThread(id: string) {
    if (isAnalyzing()) {
      return;
    }

    setError("");

    try {
      applyThreadState(await getTRPCClient().react.threads.byId.query({ id }));
    } catch (threadError) {
      if (import.meta.env.DEV) {
        console.error("Could not load React thread.", threadError);
      }

      setError("Could not load the selected analysis thread.");
    }
  }

  async function deleteThread(id: string) {
    if (isAnalyzing()) {
      return;
    }

    setError("");

    try {
      await getTRPCClient().react.threads.delete.mutate({ id });

      if (threadId() === id) {
        resetSession();
      }

      await loadThreads();
    } catch (deleteError) {
      if (import.meta.env.DEV) {
        console.error("Could not delete React thread.", deleteError);
      }

      setError("Could not delete the selected analysis thread.");
    }
  }

  async function analyzeCurrentCandle(nextTime = lastCandleTime()) {
    if (isAnalyzing()) {
      return;
    }

    setIsAnalyzing(true);
    setError("");

    try {
      const result = await getTRPCClient().react.analyzeChart.mutate({
        threadId: threadId(),
        lastCandleTime: nextTime,
        candleCount: candleCount(),
        symbol: symbol(),
        timeframe: timeframe(),
        previousState: previousState(),
      });

      setThreadId(result.threadId);
      setLastCandleTime(result.thread.state.lastCandleTime);
      setCandleCount(result.thread.state.candleCount);
      setSymbol(result.thread.state.symbol);
      setTimeframe(result.thread.state.timeframe);
      setAnalysis(result.analysis);
      setPreviousState(result.previousState);
      setAnalysisHistory(result.thread.state.analysisHistory);
      setSelectedAnalysisIndex(null);
      await loadThreads();
    } catch (analyzeError) {
      if (import.meta.env.DEV) {
        console.error("Could not analyze chart.", analyzeError);
      }

      setError(
        "Could not analyze chart. Confirm the renderer is running and the candle time exists.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function analyzeNextCandle() {
    try {
      void analyzeCurrentCandle(addFiveMinutes(lastCandleTime()));
    } catch {
      setError("Current candle time is invalid.");
    }
  }

  function resetSession() {
    setThreadId(undefined);
    setLastCandleTime(INITIAL_LAST_CANDLE_TIME);
    setCandleCount(DEFAULT_CANDLE_COUNT);
    setSymbol(DEFAULT_SYMBOL);
    setTimeframe(DEFAULT_TIMEFRAME);
    setAnalysis(undefined);
    setPreviousState({
      immediatePredictions: [],
    });
    setAnalysisHistory([]);
    setSelectedAnalysisIndex(null);
    setError("");
  }

  return (
    <main class="min-h-[calc(100vh-48px)] bg-slate-100 text-slate-950">
      <div class="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-7xl flex-col px-4 py-6">
        <header class="mb-5 border-b border-slate-200 pb-4">
          <h1 class="text-2xl font-semibold tracking-normal text-slate-950">
            Price Action Review
          </h1>
          <p class="mt-1 text-sm text-slate-600">WIN@N M5 renderer analysis</p>
        </header>

        <div class="grid flex-1 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside class="self-start rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-slate-950">Threads</h2>
              <button
                type="button"
                onClick={resetSession}
                disabled={isAnalyzing()}
                title="New thread"
                aria-label="New thread"
                class="flex size-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Plus class="size-4" aria-hidden="true" />
              </button>
            </div>

            <Show
              when={!isLoadingThreads()}
              fallback={
                <div class="mt-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  <Loader2 class="size-4 animate-spin" aria-hidden="true" />
                  Loading
                </div>
              }
            >
              <Show
                when={threads().length > 0}
                fallback={
                  <p class="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-500">
                    No saved analysis threads yet.
                  </p>
                }
              >
                <div class="mt-3 space-y-2">
                  <For each={threads()}>
                    {(thread) => (
                      <div
                        class={`rounded-md border p-2 transition ${
                          threadId() === thread.id
                            ? "border-sky-500 bg-sky-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div class="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => void loadThread(thread.id)}
                            disabled={isAnalyzing()}
                            class="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                          >
                            <span class="block truncate text-sm font-medium text-slate-900">
                              {thread.symbol} {thread.timeframe}
                            </span>
                            <span class="mt-1 block truncate text-xs text-slate-500">
                              {thread.lastCandleTime}
                            </span>
                            <span class="mt-1 block text-xs text-slate-500">
                              {thread.analysisCount} analyses
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteThread(thread.id)}
                            disabled={isAnalyzing()}
                            title="Delete thread"
                            aria-label="Delete thread"
                            class="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
                          >
                            <Trash2 class="size-4" aria-hidden="true" />
                          </button>
                        </div>
                        <p class="mt-2 truncate text-xs text-slate-400">
                          {formatDateTime(thread.updatedAt)}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </aside>

          <div class="min-w-0">
            <section class="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div class="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_8rem_7rem_7rem_auto_auto_auto] md:items-end">
            <label class="min-w-0">
              <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Last Candle Time
              </span>
              <input
                value={lastCandleTime()}
                onInput={(event) =>
                  setLastCandleTime(event.currentTarget.value)
                }
                disabled={isAnalyzing()}
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </label>

            <label>
              <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Candles
              </span>
              <input
                type="number"
                min="1"
                value={candleCount()}
                onInput={(event) =>
                  setCandleCount(
                    Number(event.currentTarget.value) || DEFAULT_CANDLE_COUNT,
                  )
                }
                disabled={isAnalyzing()}
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </label>

            <label>
              <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Symbol
              </span>
              <input
                value={symbol()}
                onInput={(event) => setSymbol(event.currentTarget.value)}
                disabled={isAnalyzing()}
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </label>

            <label>
              <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Timeframe
              </span>
              <input
                value={timeframe()}
                onInput={(event) => setTimeframe(event.currentTarget.value)}
                disabled={isAnalyzing()}
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </label>

            <button
              type="button"
              onClick={() => void analyzeCurrentCandle()}
              disabled={isAnalyzing()}
              class="flex h-10 items-center justify-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Show
                when={isAnalyzing()}
                fallback={<Play class="size-4" aria-hidden="true" />}
              >
                <Loader2 class="size-4 animate-spin" aria-hidden="true" />
              </Show>
              Analyze
            </button>

            <button
              type="button"
              onClick={analyzeNextCandle}
              disabled={isAnalyzing()}
              class="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <ChevronRight class="size-4" aria-hidden="true" />
              Next
            </button>

            <button
              type="button"
              onClick={resetSession}
              disabled={isAnalyzing()}
              title="Reset"
              aria-label="Reset"
              class="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <RotateCcw class="size-4" aria-hidden="true" />
              </button>
            </div>

              <div class="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span class="rounded-full bg-slate-100 px-2.5 py-1">
                  Current: {formattedCandleTime()}
                </span>
                <span class="rounded-full bg-slate-100 px-2.5 py-1">
                  Step: +{TIMEFRAME_STEP_MINUTES} min
                </span>
              </div>

              <Show when={error()}>
                <p class="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error()}
                </p>
              </Show>
            </section>

            <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
          <Show when={isAnalyzing()}>
            <div class="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-sm">
              <Loader2 class="size-4 animate-spin" aria-hidden="true" />
              Analyzing chart...
            </div>
          </Show>

          <Show
            when={analysis()}
            fallback={
              <Show when={!isAnalyzing()}>
                <div class="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm leading-6 text-slate-600 shadow-sm">
                  Run the first analysis to review the selected WIN@N M5 candle
                  window.
                </div>
              </Show>
            }
          >
            {(currentAnalysis) => (
              <>
                <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 class="text-sm font-semibold text-slate-950">
                        {selectedAnalysisIndex() === null
                          ? "Latest Analysis"
                          : `Historical Analysis #${selectedAnalysisIndex()! + 1}`}
                      </h2>
                      <p class="mt-1 text-xs text-slate-500">
                        {selectedHistoryItem()?.candleTime ??
                          formattedCandleTime()}
                      </p>
                    </div>
                    <span class="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                      {currentAnalysis().mode.replace("_", " ")}
                    </span>
                  </div>
                </section>

                <AnalysisSection
                  label="Al Brooks Context"
                  value={currentAnalysis().alBrooksContext}
                />
                <AnalysisSection
                  label="Prediction"
                  value={currentAnalysis().prediction}
                />
                <AnalysisSection
                  label="Invalidation"
                  value={currentAnalysis().invalidation}
                />
                <AnalysisSection
                  label="Corroboration With Previous Prediction"
                  value={currentAnalysis().corroborationWithPreviousPrediction}
                />
              </>
            )}
          </Show>

          <Show when={analysisHistory().length > 0}>
            <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-sm font-semibold text-slate-950">
                  Analysis History
                </h2>
                <Show when={selectedAnalysisIndex() !== null}>
                  <button
                    type="button"
                    onClick={loadLatestAnalysis}
                    disabled={isAnalyzing()}
                    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Latest
                  </button>
                </Show>
              </div>
              <div class="mt-3 space-y-2">
                <For each={analysisHistory()}>
                  {(item, index) => (
                    <button
                      type="button"
                      onClick={() => loadHistoryAnalysis(index())}
                      disabled={isAnalyzing()}
                      class={`block w-full rounded-md border p-3 text-left transition disabled:cursor-not-allowed ${
                        selectedAnalysisIndex() === index()
                          ? "border-sky-500 bg-sky-50"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:bg-slate-50"
                      }`}
                    >
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-xs font-semibold text-slate-500">
                          #{index() + 1}
                        </span>
                        <span class="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                          {item.analysis.mode.replace("_", " ")}
                        </span>
                      </div>
                      <p class="mt-1 text-xs text-slate-500">
                        {item.candleTime}
                      </p>
                      <p class="mt-2 text-sm leading-5 text-slate-700">
                        {item.analysis.prediction}
                      </p>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
