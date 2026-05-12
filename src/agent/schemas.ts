import { z } from "zod";

export const agentStateSchema = z.enum([
  "needs_context",
  "analysis_ready",
  "trade_plan_ready",
]);

export const contextSufficiencyResultSchema = z.object({
  context_sufficiency: z.enum(["insufficient", "sufficient"]),
  context_request_header: z.string().trim().min(1),
  missing_context: z.array(z.string().trim().min(1)).max(8),
  questions: z.array(z.string().trim().min(1)).max(3),
});

export const chatMessageMetadataSchema = z.object({
  agentState: agentStateSchema.optional(),
  contextSufficiency: contextSufficiencyResultSchema.optional(),
});

export const tradingAgentResultSchema = z.object({
  state: agentStateSchema,
  report: z.string().trim().min(1),
  contextSufficiency: contextSufficiencyResultSchema,
});
