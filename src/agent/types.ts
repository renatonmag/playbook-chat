import type { z } from "zod";
import type { ChatMessage } from "~/db/schema";
import type {
  agentStateSchema,
  responseStyleSchema,
  tradingAgentStepEventSchema,
  tradingAgentStepSchema,
  tradingAgentResultSchema,
} from "./schemas";

export type AgentState = z.infer<typeof agentStateSchema>;
export type ResponseStyle = z.infer<typeof responseStyleSchema>;
export type TradingAgentStep = z.infer<typeof tradingAgentStepSchema>;
export type TradingAgentStepEvent = z.infer<
  typeof tradingAgentStepEventSchema
>;

export type ActiveMarketCicle =
  | "breakout"
  | "tight_channel"
  | "broad_channel"
  | "trading_range"
  | "reversal"
  | "unclear";

export type RangeType =
  | "tight_range"
  | "normal_range"
  | "wide_range"
  | "expanding_range"
  | "no_range";

export type RangeLocation =
  | "above_range"
  | "top"
  | "middle"
  | "bottom"
  | "below_range"
  | "no_range";

export type StructureStatus =
  | "active"
  | "ended"
  | "weakening"
  | "completed"
  | "broken"
  | "failed"
  | "unclear";

export type DirectionalBias = "bullish" | "bearish" | "neutral";

export type DayType =
  | "trend_from_open"
  | "trading_range_day"
  | "trending_trading_ranges"
  | "broad_channel_day"
  | "small_pullback_trend_day"
  | "unclear";

export type MarketState = {
  cicle: {
    broaderMarketCicle: ActiveMarketCicle;
    innerMarketCicle: ActiveMarketCicle;
  };
  rangeType?: RangeType;
  locationInRange?: RangeLocation;
  sessionContext?: {
    barNumber?: number;
    dayType?: DayType;
  };
  activeStructures: {
    name: string;
    status: StructureStatus;
    evidence: string[];
  }[];
  currentBias: {
    primaryDirection: DirectionalBias;
    currentDirection: DirectionalBias;
    confidenceOfCurrentDirection: number;
    reason: string;
  };
  latestEvent?: {
    description: string;
    tags: string[];
    direction: DirectionalBias;
    changesPreviousRead: boolean;
    effect: string;
    invalidates: string[];
    supports: string[];
  };
  openQuestions: string[];
};

export type TradingAgentInput = {
  prompt: string;
  history: ChatMessage[];
  responseStyle: ResponseStyle;
};

export type TradingAgentResult = z.infer<typeof tradingAgentResultSchema>;
