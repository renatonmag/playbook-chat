import { z } from "zod";

export const marketContextSchema = z.object({
  observation: z.array(z.string().trim().min(1)).min(1),
  interpretation: z.array(z.string().trim().min(1)).min(1)
});

export const candidatePatternSchema = z.object({
  name: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1)
});

export const trendStateSchema = z.object({
  state: z.enum(["bullish", "bearish", "range", "transition", "unclear"]),
  evidence: z.array(z.string().trim().min(1)).min(1)
});

export const volatilitySchema = z.object({
  level: z.enum(["contracting", "expanding", "balanced", "unclear"]),
  evidence: z.array(z.string().trim().min(1)).min(1)
});

export const supportResistanceLevelSchema = z.object({
  level: z.string().trim().min(1),
  type: z.enum(["support", "resistance", "pivot"]),
  source: z.string().trim().min(1)
});

export const controlSideSchema = z.object({
  side: z.enum(["buyers", "sellers", "balanced", "unclear"]),
  rationale: z.string().trim().min(1)
});

export const strategyAlignmentSchema = z.object({
  verdict: z.enum(["aligned", "mixed", "misaligned"]),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string().trim().min(1)).min(1)
});

export const marketStateSchemaV1 = z.object({
  marketContext: marketContextSchema,
  candidatePatterns: z.array(candidatePatternSchema),
  trendState: trendStateSchema,
  volatility: volatilitySchema,
  supportResistance: z.array(supportResistanceLevelSchema),
  likelyControlSide: controlSideSchema,
  strategyAlignment: strategyAlignmentSchema,
  keySignals: z.array(z.string().trim().min(1)).min(1),
  ambiguities: z.array(z.string().trim().min(1)),
  analysisConfidence: z.number().min(0).max(1),
  missingCriticalContext: z.array(z.string().trim().min(1)),
  timeframeNotes: z.array(z.string().trim().min(1)),
  schemaVersion: z.literal("market-state.v1")
});

export type MarketState = z.infer<typeof marketStateSchemaV1>;
