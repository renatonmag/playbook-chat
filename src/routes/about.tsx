import { A } from "@solidjs/router";
import SectionFrame from "~/components/trading/SectionFrame";

export default function About() {
  return (
    <main class="mx-auto flex min-h-[calc(100vh-73px)] max-w-5xl flex-col gap-6 px-4 py-10 text-slate-100">
      <div class="max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Playbook Chat</p>
        <h1 class="mt-3 text-4xl font-semibold tracking-tight">Trading copilot architecture</h1>
        <p class="mt-4 text-base leading-7 text-slate-300">
          This prototype treats a market description the way a coding agent treats a codebase:
          inspect the source material, extract structured state, pull the most relevant pattern
          references, and only then produce a decision-support plan.
        </p>
      </div>

      <SectionFrame title="Current implementation" subtitle="What the V1 prototype does today">
        <ul class="space-y-3 text-sm leading-6 text-slate-300">
          <li>Accepts manual chart narration plus instrument, timeframe, and strategy context.</li>
          <li>Runs a deterministic Technical Analyst stage that extracts structure and ambiguity.</li>
          <li>Retrieves local pattern documents for a single continuation playbook.</li>
          <li>Builds a structured trade plan or explicit no-trade output.</li>
          <li>Stores recent runs in memory for replay while the app process is alive.</li>
        </ul>
      </SectionFrame>

      <SectionFrame title="Design intent" subtitle="Why the UI is structured this way">
        <p class="text-sm leading-7 text-slate-300">
          The homepage is intentionally inspectable rather than conversational. You can review the
          raw analyst output, retrieved pattern context, and planner decision separately, which
          makes prompt and retrieval iteration easier later when a real model backend is added.
        </p>
      </SectionFrame>

      <p class="text-sm text-slate-400">
        <A href="/" class="text-amber-300 hover:text-amber-200">
          Return to the analysis console
        </A>
      </p>
    </main>
  );
}
