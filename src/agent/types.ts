import type { z } from "zod";
import type { ChatMessage } from "~/db/schema";
import type {
  agentStateSchema,
  contextSufficiencyResultSchema,
  tradingAgentResultSchema,
} from "./schemas";

export type AgentState = z.infer<typeof agentStateSchema>;

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
