import type { ParentComponent } from "solid-js";

type SectionFrameProps = {
  title: string;
  subtitle?: string;
};

const SectionFrame: ParentComponent<SectionFrameProps> = props => {
  return (
    <section class="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur">
      <div class="mb-4">
        <h2 class="text-lg font-semibold tracking-tight text-white">{props.title}</h2>
        {props.subtitle && <p class="mt-1 text-sm text-slate-400">{props.subtitle}</p>}
      </div>
      {props.children}
    </section>
  );
};

export default SectionFrame;
