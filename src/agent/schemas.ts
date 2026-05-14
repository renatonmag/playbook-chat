import { z } from "zod";

export const agentStateSchema = z.enum([
  "needs_context",
  "analysis_ready",
  "trade_plan_ready",
]);

export const chatMessageMetadataSchema = z.object({
  agentState: agentStateSchema.optional(),
});

export const tradingAgentResultSchema = z.object({
  state: agentStateSchema,
  report: z.string().trim().min(1),
});
