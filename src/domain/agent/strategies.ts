import { strategyDefinitionSchema, type StrategyDefinition } from "~/schemas/strategy.schema";

const strategyCatalog = [
  {
    id: "trend-pullback-continuation",
    name: "Trend Pullback Continuation",
    marketType: "Intraday directional trend with orderly pullbacks.",
    preferredConditions: [
      "Clear directional control by buyers or sellers.",
      "Orderly pullback after an impulsive leg.",
      "Breakout or continuation attempt near a prior breakout point or moving area of value.",
      "Compression followed by expansion in trend direction."
    ],
    disallowedConditions: [
      "Broad two-sided range with no directional follow-through.",
      "Late climactic move with no room to logical target.",
      "Conflicting timeframe structure with weak confirmation.",
      "Headline-driven volatility with no technical acceptance."
    ],
    entryLogicPrinciples: [
      "Prefer entries after pullback holds above support in an uptrend or below resistance in a downtrend.",
      "Require some evidence of re-acceptance in trend direction before entry.",
      "Avoid entries in the middle of a range or middle of a large bar."
    ],
    stopLogicPrinciples: [
      "Stops belong beyond the structure that proves the setup wrong.",
      "If the trade depends on a pullback low or high holding, the stop should sit beyond that level.",
      "If invalidation is unclear, no trade is preferred."
    ],
    targetLogicPrinciples: [
      "Use prior swing extension, measured move, or next clear resistance/support as the first target.",
      "Prefer setups with logical asymmetric reward relative to invalidation distance."
    ],
    qualityFilters: [
      "Trend must be obvious enough to describe in one sentence.",
      "The pullback must look corrective rather than a fresh reversal.",
      "A clear invalidation point must exist."
    ],
    noTradeRules: [
      "No trade when the description is incomplete or contradictory.",
      "No trade when the market appears trapped in broad balance.",
      "No trade when the trader cannot describe a clear invalidation."
    ]
  }
] satisfies StrategyDefinition[];

export const strategies = strategyCatalog.map(strategy => strategyDefinitionSchema.parse(strategy));

export function listStrategies() {
  return strategies;
}

export function getStrategyById(strategyId: string) {
  return strategies.find(strategy => strategy.id === strategyId) ?? null;
}
