import { z } from "zod";

export const patternDocumentSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1),
  timeframes: z.array(z.string().trim().min(1)).min(1),
  marketConditions: z.array(z.string().trim().min(1)).min(1),
  setupSummary: z.string().trim().min(1),
  confirmationSignals: z.array(z.string().trim().min(1)).min(1),
  failureModes: z.array(z.string().trim().min(1)).min(1),
  invalidationLogic: z.array(z.string().trim().min(1)).min(1),
  examples: z.array(z.string().trim().min(1)).min(1),
  strategyIds: z.array(z.string().trim().min(1)).min(1),
  body: z.string().trim().min(1)
});

export const retrievedPatternSchema = z.object({
  id: z.string(),
  title: z.string(),
  score: z.number().min(0),
  matchedTags: z.array(z.string()),
  matchedConditions: z.array(z.string()),
  summary: z.string(),
  confirmationSignals: z.array(z.string()),
  invalidationLogic: z.array(z.string())
});

export type PatternDocument = z.infer<typeof patternDocumentSchema>;
export type RetrievedPattern = z.infer<typeof retrievedPatternSchema>;
