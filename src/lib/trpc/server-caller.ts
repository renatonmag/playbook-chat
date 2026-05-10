import { appRouter } from "~/server/trpc/router";
import { createTRPCContext } from "~/server/trpc/context";

export async function createServerCaller() {
  const ctx = await createTRPCContext();

  return appRouter.createCaller(ctx);
}
