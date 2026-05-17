import type { z } from "zod";
import type { ChatMessage } from "~/db/schema";
import type {
  activeMarketCicleSchema,
  agentStateSchema,
  dayTypeSchema,
  directionalBiasSchema,
  marketStateSchema,
  rangeLocationSchema,
  rangeTypeSchema,
  responseStyleSchema,
  structureStatusSchema,
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
export type TradingAgentTextEvent =
  | TradingAgentStepEvent
  | {
      type: "text_delta";
      delta: string;
    };

export type ActiveMarketCicle = z.infer<typeof activeMarketCicleSchema>;
export type RangeType = z.infer<typeof rangeTypeSchema>;
export type RangeLocation = z.infer<typeof rangeLocationSchema>;
export type StructureStatus = z.infer<typeof structureStatusSchema>;
export type DirectionalBias = z.infer<typeof directionalBiasSchema>;
export type DayType = z.infer<typeof dayTypeSchema>;
export type MarketState = z.infer<typeof marketStateSchema>;

export type TradingAgentInput = {
  prompt: string;
  history: ChatMessage[];
  previousMarketState?: MarketState | null;
};

export type TradingAgentResult = z.infer<typeof tradingAgentResultSchema>;
