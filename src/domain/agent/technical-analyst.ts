import type { AnalysisRequest } from "~/schemas/analysis-request.schema";
import { marketStateSchemaV1, type MarketState } from "~/schemas/market-state.schema";
import type { StrategyDefinition } from "~/schemas/strategy.schema";

const bullishKeywords = [
  "bull",
  "bullish",
  "higher high",
  "higher low",
  "buyers",
  "bid",
  "breakout",
  "holding above",
  "trend up"
];

const bearishKeywords = [
  "bear",
  "bearish",
  "lower high",
  "lower low",
  "sellers",
  "offered",
  "breakdown",
  "holding below",
  "trend down"
];

const rangeKeywords = ["range", "chop", "balanced", "sideways", "inside", "rotation"];
const expandingKeywords = ["volatile", "expanding", "wide bars", "fast tape", "impulse"];
const contractingKeywords = ["tight", "compressed", "compression", "coiling", "quiet"];

function splitSentences(text: string) {
  return text
    .split(/[.!?\n]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function countMatches(haystack: string, keywords: string[]) {
  return keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
}

function detectTrend(text: string) {
  const bullishScore = countMatches(text, bullishKeywords);
  const bearishScore = countMatches(text, bearishKeywords);
  const rangeScore = countMatches(text, rangeKeywords);

  if (rangeScore >= bullishScore && rangeScore >= bearishScore && rangeScore > 0) {
    return {
      state: "range" as const,
      evidence: ["The description emphasizes two-sided or sideways trade."]
    };
  }

  if (bullishScore > bearishScore && bullishScore > 0) {
    return {
      state: "bullish" as const,
      evidence: ["The description contains more upside continuation language than downside language."]
    };
  }

  if (bearishScore > bullishScore && bearishScore > 0) {
    return {
      state: "bearish" as const,
      evidence: ["The description contains more downside continuation language than upside language."]
    };
  }

  if (bullishScore > 0 && bearishScore > 0) {
    return {
      state: "transition" as const,
      evidence: ["The description mixes bullish and bearish cues without a clear winner."]
    };
  }

  return {
    state: "unclear" as const,
    evidence: ["The description does not define trend clearly enough."]
  };
}

function detectVolatility(text: string) {
  const expanding = countMatches(text, expandingKeywords);
  const contracting = countMatches(text, contractingKeywords);

  if (expanding > contracting && expanding > 0) {
    return {
      level: "expanding" as const,
      evidence: ["The description implies expansion or impulsive movement."]
    };
  }

  if (contracting > expanding && contracting > 0) {
    return {
      level: "contracting" as const,
      evidence: ["The description implies compression or tighter bars."]
    };
  }

  if (expanding > 0 && contracting > 0) {
    return {
      level: "balanced" as const,
      evidence: ["The description includes both compression and expansion cues."]
    };
  }

  return {
    level: "unclear" as const,
    evidence: ["Volatility conditions are not described precisely."]
  };
}

function extractLevels(sentences: string[]) {
  const detectedLevels = sentences.flatMap(sentence => {
    const matches = sentence.match(/\b\d{2,6}(?:\.\d+)?\b/g) ?? [];

    return matches.map(level => {
      const normalized = sentence.toLowerCase();
      const type = normalized.includes("support")
        ? "support"
        : normalized.includes("resistance")
          ? "resistance"
          : "pivot";

      return {
        level,
        type: type as "support" | "resistance" | "pivot",
        source: sentence
      };
    });
  });

  return detectedLevels.slice(0, 6);
}

function detectCandidatePatterns(text: string) {
  const patternChecks = [
    ["tight channel", "Tight Trend Channel Pullback"],
    ["channel", "Tight Trend Channel Pullback"],
    ["flag", "Final Flag Near Exhaustion"],
    ["triangle", "Triangle Compression Break"],
    ["compression", "Triangle Compression Break"],
    ["coil", "Triangle Compression Break"]
  ] as const;

  const hits = patternChecks
    .filter(([keyword]) => text.includes(keyword))
    .map(([, name]) => name);

  return Array.from(new Set(hits)).map(name => ({
    name,
    confidence: 0.6,
    rationale: `The description explicitly references ${name.toLowerCase()} characteristics.`
  }));
}

function inferControlSide(trendState: MarketState["trendState"]) {
  switch (trendState.state) {
    case "bullish":
      return {
        side: "buyers" as const,
        rationale: "Directional evidence currently favors buyers."
      };
    case "bearish":
      return {
        side: "sellers" as const,
        rationale: "Directional evidence currently favors sellers."
      };
    case "range":
      return {
        side: "balanced" as const,
        rationale: "The market appears balanced rather than directional."
      };
    default:
      return {
        side: "unclear" as const,
        rationale: "Control is not clear from the description."
      };
  }
}

function buildStrategyAlignment(
  trendState: MarketState["trendState"],
  volatility: MarketState["volatility"],
  description: string,
  strategy: StrategyDefinition
) {
  const reasons: string[] = [];
  let score = 0.5;

  if (trendState.state === "bullish" || trendState.state === "bearish") {
    score += 0.2;
    reasons.push("The market is described as directional rather than fully balanced.");
  } else {
    score -= 0.2;
    reasons.push("Directional control is not clear enough for a continuation playbook.");
  }

  if (description.includes("pullback") || description.includes("retest") || description.includes("flag")) {
    score += 0.2;
    reasons.push("The description suggests a pullback or continuation structure.");
  } else {
    reasons.push("There is limited explicit pullback structure in the description.");
  }

  if (volatility.level === "expanding" || volatility.level === "contracting") {
    score += 0.05;
    reasons.push("Volatility context is at least partly described, which helps continuation planning.");
  }

  if (description.includes("range") || description.includes("chop")) {
    score -= 0.25;
    reasons.push("Range or chop language conflicts with the preferred continuation context.");
  }

  const verdict =
    score >= 0.7 ? "aligned" : score >= 0.45 ? "mixed" : "misaligned";

  return {
    verdict,
    score: Math.max(0, Math.min(1, score)),
    reasons: reasons.length > 0 ? reasons : strategy.qualityFilters
  } as const;
}

function buildAmbiguities(text: string, levels: MarketState["supportResistance"]) {
  const ambiguities: string[] = [];

  if (!text.includes("timeframe")) {
    ambiguities.push("The narrative does not explain how nearby higher timeframe structure fits the setup.");
  }

  if (levels.length === 0) {
    ambiguities.push("No explicit price levels were provided for support, resistance, or invalidation.");
  }

  if (!text.includes("stop") && !text.includes("invalidate")) {
    ambiguities.push("The description does not define where the idea is clearly wrong.");
  }

  return ambiguities;
}

function summarizeObservations(sentences: string[]) {
  return sentences.slice(0, 4).map(sentence => sentence.replace(/\s+/g, " "));
}

export function runTechnicalAnalyst(input: {
  request: AnalysisRequest;
  strategy: StrategyDefinition;
}): MarketState {
  const sentences = splitSentences(input.request.marketDescription);
  const normalizedDescription = input.request.marketDescription.toLowerCase();
  const trendState = detectTrend(normalizedDescription);
  const volatility = detectVolatility(normalizedDescription);
  const supportResistance = extractLevels(sentences);
  const candidatePatterns = detectCandidatePatterns(normalizedDescription);
  const likelyControlSide = inferControlSide(trendState);
  const strategyAlignment = buildStrategyAlignment(
    trendState,
    volatility,
    normalizedDescription,
    input.strategy
  );
  const ambiguities = buildAmbiguities(normalizedDescription, supportResistance);
  const missingCriticalContext = [];

  if (!input.request.sessionContext) {
    missingCriticalContext.push("Session context");
  }

  if (!input.request.riskContext) {
    missingCriticalContext.push("Risk context");
  }

  if (!normalizedDescription.includes("support") && !normalizedDescription.includes("resistance")) {
    missingCriticalContext.push("Explicit support or resistance reference");
  }

  const analysisConfidence = Math.max(
    0.2,
    Math.min(0.92, strategyAlignment.score - ambiguities.length * 0.07 + sentences.length * 0.03)
  );

  return marketStateSchemaV1.parse({
    marketContext: {
      observation:
        summarizeObservations(sentences).length > 0
          ? summarizeObservations(sentences)
          : ["The trader described the market in general terms without enough structure."],
      interpretation: [
        `The current read is ${trendState.state} with ${volatility.level} volatility conditions.`,
        `This is ${strategyAlignment.verdict} with the ${input.strategy.name} playbook.`
      ]
    },
    candidatePatterns,
    trendState,
    volatility,
    supportResistance,
    likelyControlSide,
    strategyAlignment,
    keySignals: [
      ...trendState.evidence,
      ...volatility.evidence,
      ...(supportResistance.length > 0
        ? [`The trader mentioned ${supportResistance.length} explicit price reference points.`]
        : ["The trader did not provide hard price references."])
    ],
    ambiguities,
    analysisConfidence,
    missingCriticalContext,
    timeframeNotes: [
      `Primary operating timeframe: ${input.request.timeframe}.`,
      input.request.sessionContext
        ? `Session context: ${input.request.sessionContext}.`
        : "No session context was supplied."
    ],
    schemaVersion: "market-state.v1"
  });
}
