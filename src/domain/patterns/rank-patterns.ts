import type { MarketState } from "~/schemas/market-state.schema";
import type { PatternDocument, RetrievedPattern } from "~/schemas/pattern.schema";

function normalize(value: string) {
  return value.toLowerCase();
}

function collectNeedles(analysis: MarketState) {
  return [
    analysis.trendState.state,
    analysis.volatility.level,
    ...analysis.keySignals,
    ...analysis.marketContext.observation,
    ...analysis.candidatePatterns.map(pattern => pattern.name)
  ]
    .join(" ")
    .toLowerCase();
}

export function rankPatterns(
  patterns: PatternDocument[],
  analysis: MarketState,
  timeframe: string
): RetrievedPattern[] {
  const needles = collectNeedles(analysis);
  const normalizedTimeframe = normalize(timeframe);

  return patterns
    .map(pattern => {
      const matchedTags = pattern.tags.filter(tag => needles.includes(normalize(tag)));
      const matchedConditions = pattern.marketConditions.filter(condition =>
        needles.includes(normalize(condition))
      );

      let score = matchedTags.length * 2 + matchedConditions.length * 2;

      if (pattern.timeframes.map(normalize).includes(normalizedTimeframe)) {
        score += 2;
      }

      if (analysis.trendState.state !== "unclear" && needles.includes(analysis.trendState.state)) {
        score += 1;
      }

      return {
        id: pattern.id,
        title: pattern.title,
        score,
        matchedTags,
        matchedConditions,
        summary: pattern.setupSummary,
        confirmationSignals: pattern.confirmationSignals,
        invalidationLogic: pattern.invalidationLogic
      };
    })
    .filter(pattern => pattern.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}
