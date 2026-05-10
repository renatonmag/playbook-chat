import { QueryClient } from "@tanstack/solid-query";
import { isServer } from "solid-js/web";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false
      }
    }
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
