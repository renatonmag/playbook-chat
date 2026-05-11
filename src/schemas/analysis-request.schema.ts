import { z } from "zod";

export const analysisRequestSchema = z.object({
  instrument: z.string().trim().min(1, "Instrument is required."),
  timeframe: z.string().trim().min(1, "Timeframe is required."),
  marketDescription: z.string().trim().min(30, "Market description must be at least 30 characters."),
  strategyId: z.string().trim().min(1, "Strategy is required."),
  sessionContext: z.string().trim().min(1).optional(),
  riskContext: z.string().trim().min(1).optional()
});

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
