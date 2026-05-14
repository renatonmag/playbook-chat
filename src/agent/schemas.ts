import { z } from "zod";

export const agentStateSchema = z.enum([
  "needs_context",
  "analysis_ready",
  "trade_plan_ready",
]);

export const responseStyleSchema = z.enum(["report", "freeform"]);

export const chatMessageMetadataSchema = z.object({
  agentState: agentStateSchema.optional(),
  responseStyle: responseStyleSchema.optional(),
});

export const tradingAgentResultSchema = z.object({
  state: agentStateSchema,
  report: z.string().trim().min(1),
});
