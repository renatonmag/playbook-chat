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

export const tradingAgentStepSchema = z.enum([
  "detect_patterns",
  "retrieve_docs",
  "build_market_state",
  "generate_report",
]);

export const tradingAgentStepEventSchema = z.object({
  type: z.literal("step"),
  step: tradingAgentStepSchema,
  status: z.enum(["running", "completed"]),
  label: z.string().trim().min(1),
});
