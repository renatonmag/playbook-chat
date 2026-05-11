import { patternLibrary } from "~/data/seed-patterns";
import type { MarketState } from "~/schemas/market-state.schema";
import type { RetrievedPattern } from "~/schemas/pattern.schema";
import { rankPatterns } from "./rank-patterns";

export function retrievePatterns(input: {
  analysis: MarketState;
  strategyId: string;
  timeframe: string;
}): RetrievedPattern[] {
  const eligiblePatterns = patternLibrary.filter(pattern =>
    pattern.strategyIds.includes(input.strategyId)
  );

  return rankPatterns(eligiblePatterns, input.analysis, input.timeframe).slice(0, 5);
}
