import { z } from "zod";
import { runTradingAgent } from "~/agent";
import { publicProcedure, router } from "./init";

export const appRouter = router({
  health: publicProcedure.input(z.void()).query(() => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  })),
  greeting: publicProcedure
    .input(z.object({ name: z.string().trim().min(1).default("trader") }))
    .query(({ input }) => ({
      message: `Hello, ${input.name}.`,
    })),
  chat: publicProcedure
    .input(
      z.object({
        message: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await runTradingAgent({ prompt: input.message });
      console.log("chat", result);

      return {
        message: result.report,
      };
    }),
});

export type AppRouter = typeof appRouter;
