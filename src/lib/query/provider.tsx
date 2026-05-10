import { QueryClientProvider } from "@tanstack/solid-query";
import type { ParentComponent } from "solid-js";
import { getQueryClient } from "./client";

export const QueryProvider: ParentComponent = props => {
  const queryClient = getQueryClient();

  return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
};
