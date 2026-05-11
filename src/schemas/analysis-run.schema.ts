import { z } from "zod";
import { analysisRequestSchema } from "./analysis-request.schema";
import { marketStateSchemaV1 } from "./market-state.schema";
import { retrievedPatternSchema } from "./pattern.schema";
import { strategyDefinitionSchema } from "./strategy.schema";
import { tradePlanSchemaV1 } from "./trade-plan.schema";

export const promptVersionSchema = z.object({
  system: z.string().trim().min(1),
  technicalAnalyst: z.string().trim().min(1),
  planner: z.string().trim().min(1)
});

export const modelIdsSchema = z.object({
  technicalAnalyst: z.string().trim().min(1),
  planner: z.string().trim().min(1)
});

export const validationIssueSchema = z.object({
  stage: z.enum(["request", "technical-analyst", "retrieval", "planner"]),
  message: z.string().trim().min(1)
});

export const analysisRunSchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  request: analysisRequestSchema,
  strategy: strategyDefinitionSchema,
  analystOutput: marketStateSchemaV1,
  retrievedPatterns: z.array(retrievedPatternSchema),
  plannerOutput: tradePlanSchemaV1,
  promptVersions: promptVersionSchema,
  modelIds: modelIdsSchema,
  validationIssues: z.array(validationIssueSchema)
});

export const analysisRunSummarySchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  instrument: z.string().trim().min(1),
  timeframe: z.string().trim().min(1),
  strategyName: z.string().trim().min(1),
  bias: z.enum(["long", "short", "neutral"]),
  confidence: z.number().min(0).max(1),
  setupQuality: z.enum(["A", "B", "C", "D", "pass"]),
  noTrade: z.boolean()
});

export type AnalysisRun = z.infer<typeof analysisRunSchema>;
export type AnalysisRunSummary = z.infer<typeof analysisRunSummarySchema>;
