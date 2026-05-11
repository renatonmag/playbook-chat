import { useLocation } from "@solidjs/router";

export default function Nav() {
  const location = useLocation();
  const active = (path: string) =>
    path == location.pathname
      ? "border-amber-300 text-white"
      : "border-transparent text-slate-300 hover:border-slate-400 hover:text-white";
  return (
    <nav class="sticky top-0 z-10 border-b border-white/10 bg-slate-950/85 backdrop-blur">
      <ul class="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4 text-sm font-medium tracking-[0.18em] uppercase">
        <li class={`border-b-2 pb-1 ${active("/")}`}>
          <a href="/">Home</a>
        </li>
        <li class={`border-b-2 pb-1 ${active("/about")}`}>
          <a href="/about">About</a>
        </li>
      </ul>
    </nav>
  );
}
