import { z } from "zod";

export const strategyDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  marketType: z.string().trim().min(1),
  preferredConditions: z.array(z.string().trim().min(1)).min(1),
  disallowedConditions: z.array(z.string().trim().min(1)).min(1),
  entryLogicPrinciples: z.array(z.string().trim().min(1)).min(1),
  stopLogicPrinciples: z.array(z.string().trim().min(1)).min(1),
  targetLogicPrinciples: z.array(z.string().trim().min(1)).min(1),
  qualityFilters: z.array(z.string().trim().min(1)).min(1),
  noTradeRules: z.array(z.string().trim().min(1)).min(1)
});

export type StrategyDefinition = z.infer<typeof strategyDefinitionSchema>;
