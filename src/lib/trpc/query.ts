import { getTRPCClient } from "./client";

export function healthQueryOptions() {
  return {
    queryKey: ["trpc", "health"] as const,
    queryFn: () => getTRPCClient().health.query()
  };
}
