import { A } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import JsonBlock from "~/components/trading/JsonBlock";
import SectionFrame from "~/components/trading/SectionFrame";
import { listRecentRunsQueryOptions, listStrategiesQueryOptions } from "~/lib/trpc/query";
import { getTRPCClient } from "~/lib/trpc/client";
import type { AnalysisRun } from "~/schemas/analysis-run.schema";

export default function Home() {
  const strategies = useQuery(() => listStrategiesQueryOptions());
  const recentRuns = useQuery(() => listRecentRunsQueryOptions(8));

  const [instrument, setInstrument] = createSignal("ES");
  const [timeframe, setTimeframe] = createSignal("5m");
  const [strategyId, setStrategyId] = createSignal("");
  const [sessionContext, setSessionContext] = createSignal("US cash session opening hour");
  const [riskContext, setRiskContext] = createSignal("Decision support only. Wait for clear invalidation.");
  const [marketDescription, setMarketDescription] = createSignal(
    "ES is in a bullish intraday trend after the open. We broke above the morning range, pulled back in a tight channel toward prior breakout support around 5284, and buyers are starting to defend that area again. The pullback still looks corrective rather than impulsive reversal, but I need to know whether this is good continuation or too late."
  );
  const [activeRun, setActiveRun] = createSignal<AnalysisRun | null>(null);
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const selectedStrategy = createMemo(() => {
    const allStrategies = strategies.data ?? [];
    const explicit = allStrategies.find(strategy => strategy.id === strategyId());
    return explicit ?? allStrategies[0] ?? null;
  });

  createEffect(() => {
    if (!strategyId() && strategies.data?.[0]) {
      setStrategyId(strategies.data[0].id);
    }
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const run = await getTRPCClient().analyzeMarket.mutate({
        instrument: instrument(),
        timeframe: timeframe(),
        strategyId: selectedStrategy()?.id ?? "",
        sessionContext: sessionContext().trim() || undefined,
        riskContext: riskContext().trim() || undefined,
        marketDescription: marketDescription()
      });

      setActiveRun(run);
      await recentRuns.refetch();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10">
      <section class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-5">
          <p class="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">
            Decision-Support Copilot
          </p>
          <h1 class="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Read the market like source code. Plan the trade like an operator.
          </h1>
          <p class="max-w-2xl text-base leading-7 text-slate-300">
            This V1 prototype converts freeform market narration into structured context, retrieves
            relevant local playbook patterns, and returns a trade plan or explicit no-trade.
          </p>
        </div>

        <SectionFrame
          title="Strategy"
          subtitle="One explicit playbook is active in V1 so outputs stay narrow and inspectable."
        >
          <Show when={selectedStrategy()} fallback={<p class="text-sm text-slate-400">Loading strategy…</p>}>
            {strategy => (
              <div class="space-y-4 text-sm text-slate-300">
                <div>
                  <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Selected playbook</p>
                  <p class="mt-1 text-lg font-semibold text-white">{strategy().name}</p>
                </div>
                <p class="leading-6 text-slate-300">{strategy().marketType}</p>
                <div class="grid gap-3 md:grid-cols-2">
                  <div>
                    <p class="text-xs uppercase tracking-[0.22em] text-emerald-300">Preferred</p>
                    <ul class="mt-2 space-y-2 leading-6">
                      <For each={strategy().preferredConditions.slice(0, 3)}>
                        {item => <li>{item}</li>}
                      </For>
                    </ul>
                  </div>
                  <div>
                    <p class="text-xs uppercase tracking-[0.22em] text-rose-300">Reject</p>
                    <ul class="mt-2 space-y-2 leading-6">
                      <For each={strategy().disallowedConditions.slice(0, 3)}>
                        {item => <li>{item}</li>}
                      </For>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </SectionFrame>
      </section>

      <section class="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <SectionFrame
          title="Market Input"
          subtitle="Describe the live structure the way you would explain it to another trader."
        >
          <form class="space-y-5" onSubmit={handleSubmit}>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="space-y-2 text-sm">
                <span class="text-slate-300">Instrument</span>
                <input
                  class="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
                  value={instrument()}
                  onInput={event => setInstrument(event.currentTarget.value)}
                />
              </label>
              <label class="space-y-2 text-sm">
                <span class="text-slate-300">Timeframe</span>
                <input
                  class="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
                  value={timeframe()}
                  onInput={event => setTimeframe(event.currentTarget.value)}
                />
              </label>
            </div>

            <label class="space-y-2 text-sm">
              <span class="text-slate-300">Strategy</span>
              <select
                class="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none"
                value={selectedStrategy()?.id ?? ""}
                onChange={event => setStrategyId(event.currentTarget.value)}
              >
                <For each={strategies.data ?? []}>
                  {strategy => <option value={strategy.id}>{strategy.name}</option>}
                </For>
              </select>
            </label>

            <label class="space-y-2 text-sm">
              <span class="text-slate-300">Session context</span>
              <input
                class="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                value={sessionContext()}
                onInput={event => setSessionContext(event.currentTarget.value)}
              />
            </label>

            <label class="space-y-2 text-sm">
              <span class="text-slate-300">Risk context</span>
              <input
                class="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                value={riskContext()}
                onInput={event => setRiskContext(event.currentTarget.value)}
              />
            </label>

            <label class="space-y-2 text-sm">
              <span class="text-slate-300">Market description</span>
              <textarea
                rows="10"
                class="w-full rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-4 text-white outline-none placeholder:text-slate-500"
                value={marketDescription()}
                onInput={event => setMarketDescription(event.currentTarget.value)}
              />
            </label>

            <div class="flex items-center justify-between gap-4">
              <p class="text-xs leading-5 text-slate-500">
                The current implementation is deterministic and inspectable. A model backend can
                replace the analyst and planner modules later without changing the UI contract.
              </p>
              <button
                type="submit"
                disabled={isSubmitting()}
                class="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting() ? "Analyzing…" : "Analyze Market"}
              </button>
            </div>

            <Show when={submitError()}>
              {message => <p class="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{message()}</p>}
            </Show>
          </form>
        </SectionFrame>

        <SectionFrame
          title="Recent Runs"
          subtitle="Replay recent analyses to inspect what the system believed and why."
        >
          <div class="space-y-3">
            <Show
              when={(recentRuns.data?.length ?? 0) > 0}
              fallback={<p class="text-sm text-slate-400">No runs yet. Submit a market description to create the first replay.</p>}
            >
              <For each={recentRuns.data ?? []}>
                {run => (
                  <A
                    href={`/runs/${run.id}`}
                    class="block rounded-2xl border border-white/10 bg-slate-900/70 p-4 transition hover:border-amber-300/60"
                  >
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <p class="text-xs uppercase tracking-[0.22em] text-slate-500">
                          {run.instrument} · {run.timeframe}
                        </p>
                        <p class="mt-1 text-base font-semibold text-white">{run.strategyName}</p>
                      </div>
                      <span class="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                        {run.noTrade ? "No Trade" : run.bias}
                      </span>
                    </div>
                    <p class="mt-3 text-sm text-slate-400">
                      Quality {run.setupQuality} · Confidence {Math.round(run.confidence * 100)}%
                    </p>
                  </A>
                )}
              </For>
            </Show>
          </div>
        </SectionFrame>
      </section>

      <Show when={activeRun()}>
        {run => (
          <section class="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionFrame
              title="Technical Analyst Output"
              subtitle="Structured market-state extraction before the planner makes any trade decision."
            >
              <div class="mb-4 grid gap-3 sm:grid-cols-3">
                <div class="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Trend</p>
                  <p class="mt-2 text-lg font-semibold text-white">{run().analystOutput.trendState.state}</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Volatility</p>
                  <p class="mt-2 text-lg font-semibold text-white">{run().analystOutput.volatility.level}</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Alignment</p>
                  <p class="mt-2 text-lg font-semibold text-white">
                    {run().analystOutput.strategyAlignment.verdict}
                  </p>
                </div>
              </div>
              <JsonBlock value={run().analystOutput} />
            </SectionFrame>

            <SectionFrame
              title="Planner Output"
              subtitle="Trade plan or no-trade decision after retrieval and strategy checks."
            >
              <div class="mb-4 grid gap-3 sm:grid-cols-3">
                <div class="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Bias</p>
                  <p class="mt-2 text-lg font-semibold text-white">{run().plannerOutput.bias.direction}</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Quality</p>
                  <p class="mt-2 text-lg font-semibold text-white">
                    {run().plannerOutput.setupQuality.grade}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Confidence</p>
                  <p class="mt-2 text-lg font-semibold text-white">
                    {Math.round(run().plannerOutput.confidence * 100)}%
                  </p>
                </div>
              </div>

              <div class="mb-5 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm leading-7 text-slate-300">
                <p class="font-semibold text-white">Reasoning summary</p>
                <p class="mt-2">{run().plannerOutput.reasoningSummary}</p>
              </div>

              <JsonBlock value={run().plannerOutput} />
            </SectionFrame>

            <SectionFrame
              title="Retrieved Patterns"
              subtitle="The planner receives only the most relevant local playbook notes."
            >
              <JsonBlock value={run().retrievedPatterns} />
            </SectionFrame>

            <SectionFrame
              title="Run Replay"
              subtitle="Open the dedicated detail page for the full request, prompt versions, and raw JSON."
            >
              <div class="flex flex-col gap-4 text-sm text-slate-300">
                <p>
                  Run <span class="font-mono text-amber-300">{run().id}</span> was stored at{" "}
                  {new Date(run().createdAt).toLocaleString()}.
                </p>
                <A
                  href={`/runs/${run().id}`}
                  class="inline-flex w-fit rounded-full border border-amber-300/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-300/10"
                >
                  Open run detail
                </A>
              </div>
            </SectionFrame>
          </section>
        )}
      </Show>
    </main>
  );
}
