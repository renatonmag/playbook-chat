import type { z } from "zod";
import type { ChatMessage } from "~/db/schema";
import type {
  agentStateSchema,
  contextSufficiencyResultSchema,
  tradingAgentResultSchema,
} from "./schemas";

export type AgentState = z.infer<typeof agentStateSchema>;

export type MarketType =
  | "bull_trend"
  | "bear_trend"
  | "trading_range"
  | "breakout_mode"
  | "reversal_phase"
  | "unclear";

export type RangeType =
  | "tight_range"
  | "normal_range"
  | "wide_range"
  | "expanding_range";

export type RangeLocation =
  | "above_range"
  | "top"
  | "upper_middle"
  | "middle"
  | "lower_middle"
  | "bottom"
  | "below_range";

export type StructureStatus =
  | "active"
  | "weakening"
  | "completed"
  | "broken"
  | "failed"
  | "unclear";

export type DirectionalBias = "bullish" | "bearish" | "neutral";

export type DayType =
  | "trend_from_open"
  | "trading_range_day"
  | "spike_and_channel_day"
  | "broad_channel_day"
  | "double_distribution_day"
  | "possible_trend_day"
  | "unclear";

export type EventCategory =
  | "trend_resumption"
  | "trend_break"
  | "breakout_attempt"
  | "bull_breakout_attempt"
  | "bear_breakout_attempt"
  | "failed_breakout"
  | "reversal_attempt"
  | "exhaustion"
  | "test_of_support"
  | "test_of_resistance"
  | "unclear";

export type MarketState = {
  marketType: MarketType;
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
    newEvent: string;
    eventCategory: EventCategory;
    changesPreviousRead: boolean;
    effect: string;
    invalidates: string[];
    supports: string[];
  };
  openQuestions: string[];
};

export type ContextSufficiency =
  ContextSufficiencyResult["context_sufficiency"];

export type ContextSufficiencyResult = z.infer<
  typeof contextSufficiencyResultSchema
>;

export type TradingAgentInput = {
  prompt: string;
  history: ChatMessage[];
};

export type TradingAgentResult = z.infer<typeof tradingAgentResultSchema>;
