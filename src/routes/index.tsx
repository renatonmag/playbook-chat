import { A } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { healthQueryOptions } from "~/lib/trpc/query";

export default function Home() {
  const health = useQuery(() => healthQueryOptions());

  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      <h1 class="max-6-xs text-6xl text-sky-700 font-thin uppercase my-16">Playbook Chat</h1>
      <p class="mx-auto max-w-2xl text-sm leading-6 text-gray-600">
        Solid Query is wired to a minimal tRPC endpoint so the app has a typed client-server data
        path to build on.
      </p>
      <section class="mx-auto mt-10 max-w-xl rounded-lg border border-sky-200 bg-sky-50 p-6 text-left shadow-sm">
        <h2 class="text-lg font-semibold text-sky-900">tRPC health query</h2>
        {health.isPending && <p class="mt-3 text-sm text-sky-700">Loading query state...</p>}
        {health.error && (
          <p class="mt-3 text-sm text-red-700">Query failed: {health.error.message}</p>
        )}
        {health.data && (
          <dl class="mt-4 space-y-2 text-sm text-sky-950">
            <div class="flex items-center justify-between gap-4">
              <dt class="font-medium">Status</dt>
              <dd>{health.data.status}</dd>
            </div>
            <div class="flex items-center justify-between gap-4">
              <dt class="font-medium">Timestamp</dt>
              <dd>{health.data.timestamp}</dd>
            </div>
          </dl>
        )}
      </section>
      <p class="mt-8">
        Visit{" "}
        <a href="https://solidjs.com" target="_blank" class="text-sky-600 hover:underline">
          solidjs.com
        </a>{" "}
        to learn how to build Solid apps.
      </p>
      <p class="my-4">
        <span>Home</span>
        {" - "}
        <A href="/about" class="text-sky-600 hover:underline">
          About Page
        </A>{" "}
      </p>
    </main>
  );
}
