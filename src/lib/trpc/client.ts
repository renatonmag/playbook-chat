import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { getRequestEvent, isServer } from "solid-js/web";
import type { AppRouter } from "~/server/trpc/router";

function getTRPCBaseUrl() {
  // Browser fetch can use a relative path, but SSR needs an absolute URL.
  if (!isServer) {
    return "/api/trpc";
  }

  const event = getRequestEvent();

  if (event) {
    return new URL("/api/trpc", event.request.url).toString();
  }

  return `http://localhost:${process.env.PORT ?? 3000}/api/trpc`;
}

function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: getTRPCBaseUrl()
      })
    ]
  });
}

let browserTRPCClient: ReturnType<typeof makeTRPCClient> | undefined;

export function getTRPCClient() {
  if (isServer) {
    return makeTRPCClient();
  }

  browserTRPCClient ??= makeTRPCClient();
  return browserTRPCClient;
}
