import { z } from "zod";
import { publicProcedure, router } from "./init";
import { analysisRequestSchema } from "~/schemas/analysis-request.schema";
import { analysisRunSchema, analysisRunSummarySchema } from "~/schemas/analysis-run.schema";
import { strategyDefinitionSchema } from "~/schemas/strategy.schema";
import { getAnalysisRun, listRecentAnalysisRuns } from "~/server/analysis-run-store";
import { listStrategies } from "~/domain/agent/strategies";
import { runAgentPipeline } from "~/domain/agent/run-agent";

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
  listStrategies: publicProcedure.output(z.array(strategyDefinitionSchema)).query(() => listStrategies()),
  listRecentRuns: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(25).default(10) }).default({ limit: 10 }))
    .output(z.array(analysisRunSummarySchema))
    .query(({ input }) => listRecentAnalysisRuns(input.limit)),
  getRunById: publicProcedure
    .input(z.object({ id: z.string().trim().min(1) }))
    .output(analysisRunSchema.nullable())
    .query(({ input }) => getAnalysisRun(input.id)),
  analyzeMarket: publicProcedure
    .input(analysisRequestSchema)
    .output(analysisRunSchema)
    .mutation(({ input }) => runAgentPipeline(input))
});

export type AppRouter = typeof appRouter;
