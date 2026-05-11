import { A, useParams } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { Show } from "solid-js";
import JsonBlock from "~/components/trading/JsonBlock";
import SectionFrame from "~/components/trading/SectionFrame";
import { runByIdQueryOptions } from "~/lib/trpc/query";

export default function RunDetailPage() {
  const params = useParams();
  const run = useQuery(() => runByIdQueryOptions(params.id));

  return (
    <main class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">Replay</p>
          <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">Analysis run detail</h1>
        </div>
        <A href="/" class="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
          Back to console
        </A>
      </div>

      <Show when={run.isPending}>
        <SectionFrame title="Loading" subtitle="Fetching the selected run">
          <p class="text-sm text-slate-400">Loading run data…</p>
        </SectionFrame>
      </Show>

      <Show when={run.error}>
        {error => (
          <SectionFrame title="Error" subtitle="The run could not be loaded">
            <p class="text-sm text-rose-200">{error().message}</p>
          </SectionFrame>
        )}
      </Show>

      <Show when={run.data}>
        {data => (
          <Show
            when={data()}
            fallback={
              <SectionFrame title="Not found" subtitle="The requested run is not available in memory">
                <p class="text-sm text-slate-400">
                  This prototype stores runs in memory only, so restarting the app clears replay
                  history.
                </p>
              </SectionFrame>
            }
          >
            {resolved => (
              <>
                <section class="grid gap-8 lg:grid-cols-4">
                  <SectionFrame title="Request" subtitle="Input fields that produced the run">
                    <JsonBlock value={resolved().request} />
                  </SectionFrame>
                  <SectionFrame title="Strategy" subtitle="Explicit strategy definition used for the run">
                    <JsonBlock value={resolved().strategy} />
                  </SectionFrame>
                  <SectionFrame title="Prompts" subtitle="Version references recorded for replay">
                    <JsonBlock value={resolved().promptVersions} />
                  </SectionFrame>
                  <SectionFrame title="Models" subtitle="Current engine identifiers">
                    <JsonBlock value={resolved().modelIds} />
                  </SectionFrame>
                </section>

                <section class="grid gap-8 xl:grid-cols-2">
                  <SectionFrame title="Technical Analyst JSON">
                    <JsonBlock value={resolved().analystOutput} />
                  </SectionFrame>
                  <SectionFrame title="Planner JSON">
                    <JsonBlock value={resolved().plannerOutput} />
                  </SectionFrame>
                  <SectionFrame title="Retrieved Patterns">
                    <JsonBlock value={resolved().retrievedPatterns} />
                  </SectionFrame>
                  <SectionFrame title="Validation Issues">
                    <JsonBlock value={resolved().validationIssues} />
                  </SectionFrame>
                </section>
              </>
            )}
          </Show>
        )}
      </Show>
    </main>
  );
}
