import { z } from "zod";

export const breakoutStrengthSchema = z.enum([
  "strong",
  "moderate",
  "weak",
  "failed",
  "none",
  "unclear",
]);

export const channelTransitionSchema = z.enum(["yes", "no", "unclear"]);

export const evidenceStatusSchema = z.enum(["present", "absent", "unclear"]);

export const evidenceCheckSchema = z.object({
  status: evidenceStatusSchema,
  note: z.string().trim().min(1),
});

export const gapEvidenceCheckSchema = evidenceCheckSchema.extend({
  direction: z.enum(["bullish", "bearish", "none", "unclear"]),
});

export const breakoutSpecialistReviewSchema = z.object({
  breakoutStrength: breakoutStrengthSchema,
  transitioningToChannel: channelTransitionSchema,
  evidenceChecks: z.object({
    closeBeyondStructure: evidenceCheckSchema,
    followThrough: evidenceCheckSchema,
    consecutiveTrendBars: evidenceCheckSchema,
    barSizeExpansion: evidenceCheckSchema,
    gapBehavior: gapEvidenceCheckSchema,
    pullbackDepth: evidenceCheckSchema,
    failedReturnInsideStructure: evidenceCheckSchema,
    oppositePressure: evidenceCheckSchema,
  }),
});

export type BreakoutStrength = z.infer<typeof breakoutStrengthSchema>;
export type ChannelTransition = z.infer<typeof channelTransitionSchema>;
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export type EvidenceCheck = z.infer<typeof evidenceCheckSchema>;
export type GapEvidenceCheck = z.infer<typeof gapEvidenceCheckSchema>;
export type BreakoutSpecialistReview = z.infer<
  typeof breakoutSpecialistReviewSchema
>;
