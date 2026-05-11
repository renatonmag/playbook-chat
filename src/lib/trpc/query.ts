import { getTRPCClient } from "./client";

export function healthQueryOptions() {
  return {
    queryKey: ["trpc", "health"] as const,
    queryFn: () => getTRPCClient().health.query()
  };
}

export function listStrategiesQueryOptions() {
  return {
    queryKey: ["trpc", "strategies"] as const,
    queryFn: () => getTRPCClient().listStrategies.query()
  };
}

export function listRecentRunsQueryOptions(limit = 10) {
  return {
    queryKey: ["trpc", "runs", "recent", limit] as const,
    queryFn: () => getTRPCClient().listRecentRuns.query({ limit })
  };
}

export function runByIdQueryOptions(id: string) {
  return {
    queryKey: ["trpc", "runs", id] as const,
    queryFn: () => getTRPCClient().getRunById.query({ id })
  };
}
