import { z } from "zod";

export const agentStateSchema = z.enum([
  "needs_context",
  "analysis_ready",
  "trade_plan_ready",
]);

export const responseStyleSchema = z.enum(["report", "freeform"]);

export const activeMarketCicleSchema = z.enum([
  "breakout",
  "tight_channel",
  "broad_channel",
  "trading_range",
  "reversal",
  "unclear",
]);

export const rangeTypeSchema = z.enum([
  "tight_range",
  "normal_range",
  "wide_range",
  "expanding_range",
  "no_range",
]);

export const rangeLocationSchema = z.enum([
  "above_range",
  "top",
  "middle",
  "bottom",
  "below_range",
  "no_range",
]);

export const structureStatusSchema = z.enum([
  "active",
  "ended",
  "weakening",
  "completed",
  "broken",
  "failed",
  "unclear",
]);

export const directionalBiasSchema = z.enum([
  "bullish",
  "bearish",
  "neutral",
]);

export const dayTypeSchema = z.enum([
  "trend_from_open",
  "trading_range_day",
  "trending_trading_ranges",
  "broad_channel_day",
  "small_pullback_trend_day",
  "unclear",
]);

export const latestEventSchema = z.object({
  description: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)),
  direction: directionalBiasSchema,
  changesPreviousRead: z.boolean(),
  effect: z.string().trim().min(1),
  invalidates: z.array(z.string().trim().min(1)),
  supports: z.array(z.string().trim().min(1)),
});

export const marketStateSchema = z.object({
  cicle: z.object({
    broaderMarketCicle: activeMarketCicleSchema,
    innerMarketCicle: activeMarketCicleSchema,
  }),
  rangeType: rangeTypeSchema.optional(),
  locationInRange: rangeLocationSchema.optional(),
  sessionContext: z
    .object({
      barNumber: z.number().int().nonnegative().optional(),
      dayType: dayTypeSchema.optional(),
    })
    .optional(),
  activeStructures: z.array(
    z.object({
      name: z.string().trim().min(1),
      status: structureStatusSchema,
      evidence: z.array(z.string().trim().min(1)),
    }),
  ),
  currentBias: z.object({
    primaryDirection: directionalBiasSchema,
    currentDirection: directionalBiasSchema,
    confidenceOfCurrentDirection: z.number().min(0).max(100),
    reason: z.string().trim().min(1),
  }),
  latestEvent: latestEventSchema.optional(),
  openQuestions: z.array(z.string().trim().min(1)),
});

export const chatMessageMetadataSchema = z.object({
  agentState: agentStateSchema.optional(),
  responseStyle: responseStyleSchema.optional(),
});

export const tradingAgentResultSchema = z.object({
  state: agentStateSchema,
  report: z.string().trim().min(1),
  marketState: marketStateSchema,
});

export const tradingAgentStepSchema = z.enum([
  "detect_patterns",
  "extract_latest_event",
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
