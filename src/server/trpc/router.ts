import { z } from "zod";
import { publicProcedure, router } from "./init";

export const appRouter = router({
  health: publicProcedure
    .input(z.void())
    .query(() => ({
      status: "ok" as const,
      timestamp: new Date().toISOString()
    })),
  greeting: publicProcedure
    .input(z.object({ name: z.string().trim().min(1).default("trader") }))
    .query(({ input }) => ({
      message: `Hello, ${input.name}.`
    })),
  chat: publicProcedure
    .input(
      z.object({
        message: z.string().trim().min(1)
      })
    )
    .mutation(({ input }) => ({
      message: input.message
    }))
});

export type AppRouter = typeof appRouter;
