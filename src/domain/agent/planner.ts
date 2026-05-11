import type { AnalysisRequest } from "~/schemas/analysis-request.schema";
import type { MarketState } from "~/schemas/market-state.schema";
import type { RetrievedPattern } from "~/schemas/pattern.schema";
import type { StrategyDefinition } from "~/schemas/strategy.schema";
import { tradePlanSchemaV1, type TradePlan } from "~/schemas/trade-plan.schema";
import { buildTradePlan } from "~/domain/trade/build-trade-plan";

function determineDirection(analysis: MarketState) {
  if (analysis.trendState.state === "bullish") {
    return "long" as const;
  }

  if (analysis.trendState.state === "bearish") {
    return "short" as const;
  }

  return "neutral" as const;
}

function determineQuality(analysis: MarketState, patterns: RetrievedPattern[]) {
  if (analysis.strategyAlignment.verdict === "misaligned" || analysis.analysisConfidence < 0.45) {
    return {
      grade: "pass" as const,
      rationale: "The setup does not meet the minimum continuation criteria."
    };
  }

  if (patterns.length === 0 || analysis.ambiguities.length >= 3) {
    return {
      grade: "C" as const,
      rationale: "There is some structure, but confirmation quality is limited."
    };
  }

  if (analysis.strategyAlignment.verdict === "aligned" && analysis.analysisConfidence >= 0.72) {
    return {
      grade: "B" as const,
      rationale: "The setup is aligned, but the manual narrative still leaves room for uncertainty."
    };
  }

  return {
    grade: "C" as const,
    rationale: "The setup is partially aligned but still needs clearer confirmation."
  };
}

function buildNoTradePlan(analysis: MarketState, strategy: StrategyDefinition): TradePlan {
  return buildTradePlan({
    bias: {
      direction: "neutral",
      rationale: "The current description does not support a decisive trade bias."
    },
    setupQuality: {
      grade: "pass",
      rationale: "The setup does not satisfy the continuation playbook filters."
    },
    entry: {
      approach: "Wait",
      level: null,
      rationale: "No entry is justified while structure or invalidation remains unclear."
    },
    stop: {
      approach: "None",
      level: null,
      rationale: "No stop is defined because no trade is recommended."
    },
    target: {
      approach: "None",
      level: null,
      rationale: "No target is defined because no trade is recommended."
    },
    invalidation: [
      "If the market remains balanced or contradictory, the setup stays invalid.",
      ...strategy.noTradeRules.slice(0, 1)
    ],
    riskNotes: [
      "The current description carries too much ambiguity for a structured continuation trade.",
      ...analysis.ambiguities.slice(0, 2)
    ],
    confidence: Math.min(0.65, analysis.analysisConfidence),
    reasoningSummary:
      "The market read does not provide enough directional clarity, clean structure, or invalidation detail to support a continuation trade.",
    noTradeRationale:
      analysis.strategyAlignment.verdict === "misaligned"
        ? "The setup conflicts with the strategy's preferred continuation conditions."
        : "The setup might become tradable later, but the current information is too incomplete or balanced.",
    nextConfirmationToWaitFor: [
      "Clear directional reclaim or rejection at a defined level.",
      "A precise invalidation point tied to structure."
    ],
    positionIdeaType: "none",
    tradeManagementNotes: ["Preserve optionality and wait for a cleaner structural read."],
    schemaVersion: "trade-plan.v1"
  });
}

export function runPlanner(input: {
  request: AnalysisRequest;
  strategy: StrategyDefinition;
  analysis: MarketState;
  patterns: RetrievedPattern[];
}): TradePlan {
  const direction = determineDirection(input.analysis);
  const quality = determineQuality(input.analysis, input.patterns);

  if (
    direction === "neutral" ||
    quality.grade === "pass" ||
    input.analysis.strategyAlignment.verdict === "misaligned"
  ) {
    return tradePlanSchemaV1.parse(buildNoTradePlan(input.analysis, input.strategy));
  }

  const primaryPattern = input.patterns[0];
  const directionalLevel =
    input.analysis.supportResistance.find(level =>
      direction === "long" ? level.type !== "resistance" : level.type !== "support"
    ) ?? input.analysis.supportResistance[0];

  const invalidationLevel =
    input.analysis.supportResistance.find(level =>
      direction === "long" ? level.type === "support" : level.type === "resistance"
    ) ?? directionalLevel;

  const entryLevel = directionalLevel?.level ?? null;
  const stopLevel = invalidationLevel?.level ?? null;

  const plan = buildTradePlan({
    bias: {
      direction,
      rationale:
        direction === "long"
          ? "Buyers appear to retain directional control and the setup still reads like continuation."
          : "Sellers appear to retain directional control and the setup still reads like continuation."
    },
    setupQuality: quality,
    entry: {
      approach: direction === "long" ? "Buy strength after pullback hold" : "Sell weakness after pullback failure",
      level: entryLevel,
      rationale:
        entryLevel !== null
          ? `Use ${entryLevel} as the nearest structural decision point from the trader's description.`
          : "Wait for confirmation at the nearest described pullback or breakout decision point."
    },
    stop: {
      approach: "Beyond invalidation structure",
      level: stopLevel,
      rationale:
        stopLevel !== null
          ? `If ${stopLevel} fails, the continuation premise weakens materially.`
          : "The trader still needs to define the exact structure that proves the setup wrong."
    },
    target: {
      approach: "Prior swing extension or next obvious opposing level",
      level: null,
      rationale:
        "Project toward the next logical extension or opposing structural area rather than forcing a precise target from incomplete text."
    },
    invalidation: [
      direction === "long"
        ? "A clean break back below defended pullback structure invalidates the continuation thesis."
        : "A clean break back above defended pullback structure invalidates the continuation thesis.",
      "If the market rotates back into broad balance, continuation quality drops sharply."
    ],
    riskNotes: [
      "This plan is based on a manual narrative, so exact execution levels still need chart confirmation.",
      ...input.analysis.ambiguities.slice(0, 2)
    ],
    confidence: Math.min(0.86, input.analysis.analysisConfidence + input.patterns.length * 0.03),
    reasoningSummary: primaryPattern
      ? `The setup most closely resembles ${primaryPattern.title.toLowerCase()}, with ${input.analysis.trendState.state} control and ${input.analysis.strategyAlignment.verdict} playbook alignment.`
      : `The setup shows ${input.analysis.trendState.state} control with enough continuation structure to consider a trade plan.`,
    noTradeRationale: null,
    nextConfirmationToWaitFor: [
      direction === "long"
        ? "Buyers need to defend the pullback and close back in trend direction."
        : "Sellers need to defend the pullback and close back in trend direction.",
      "Avoid entry if the market stalls in the middle of a range."
    ],
    positionIdeaType:
      primaryPattern?.title.toLowerCase().includes("triangle")
        ? "breakout"
        : "trend-continuation",
    tradeManagementNotes: [
      "Scale aggressiveness to confidence because the input is discretionary and text-based.",
      "If the first continuation push fails immediately, reduce expectations or stand aside."
    ],
    schemaVersion: "trade-plan.v1"
  });

  return tradePlanSchemaV1.parse(plan);
}
