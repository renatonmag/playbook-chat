import { z } from "zod";

const tradeLevelSchema = z.object({
  approach: z.string().trim().min(1),
  level: z.string().trim().min(1).nullable(),
  rationale: z.string().trim().min(1)
});

export const tradePlanSchemaV1 = z.object({
  bias: z.object({
    direction: z.enum(["long", "short", "neutral"]),
    rationale: z.string().trim().min(1)
  }),
  setupQuality: z.object({
    grade: z.enum(["A", "B", "C", "D", "pass"]),
    rationale: z.string().trim().min(1)
  }),
  entry: tradeLevelSchema,
  stop: tradeLevelSchema,
  target: tradeLevelSchema,
  invalidation: z.array(z.string().trim().min(1)).min(1),
  riskNotes: z.array(z.string().trim().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().trim().min(1),
  noTradeRationale: z.string().trim().min(1).nullable(),
  nextConfirmationToWaitFor: z.array(z.string().trim().min(1)),
  positionIdeaType: z.enum(["trend-continuation", "breakout", "reversal", "range", "none"]),
  tradeManagementNotes: z.array(z.string().trim().min(1)),
  schemaVersion: z.literal("trade-plan.v1")
});

export type TradePlan = z.infer<typeof tradePlanSchemaV1>;
