import "dotenv/config";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { ChatOpenAI } from "@langchain/openai";
import {
  END,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { z } from "zod";
import { responseStyleSchema, tradingAgentResultSchema } from "./schemas";
import {
  freeformTradingSystemPrompt,
  technicalAnalysisSystemPrompt,
} from "./prompts";
import type {
  MarketState,
  TradingAgentInput,
  TradingAgentResult,
} from "./types";

export type { TradingAgentInput, TradingAgentResult } from "./types";

const DEFAULT_LANGSMITH_PROJECT = "playbook-chat";
const TRADING_MODEL_NAME = "gpt-5.4-mini";
const BASE_TRACE_TAGS = ["trading-agent", "langgraph", "analysis"] as const;

const activeMarketCicleSchema = z.enum([
  "breakout",
  "tight_channel",
  "broad_channel",
  "trading_range",
  "reversal",
  "unclear",
]);

const rangeTypeSchema = z.enum([
  "tight_range",
  "normal_range",
  "wide_range",
  "expanding_range",
  "no_range",
]);

const rangeLocationSchema = z.enum([
  "above_range",
  "top",
  "middle",
  "bottom",
  "below_range",
  "no_range",
]);

const structureStatusSchema = z.enum([
  "active",
  "ended",
  "weakening",
  "completed",
  "broken",
  "failed",
  "unclear",
]);

const directionalBiasSchema = z.enum(["bullish", "bearish", "neutral"]);

const dayTypeSchema = z.enum([
  "trend_from_open",
  "trading_range_day",
  "trending_trading_ranges",
  "broad_channel_day",
  "small_pullback_trend_day",
  "unclear",
]);

const marketStateSchema: z.ZodType<MarketState> = z.object({
  cicle: z.object({
    broaderMarketCicle: activeMarketCicleSchema,
    innerMarketCicle: activeMarketCicleSchema,
  }),
  rangeType: rangeTypeSchema.optional(),
  locationInRange: rangeLocationSchema.optional(),
  sessionContext: z
    .object({
      barNumber: z.number().int().nonnegative().optional(),
      dayType: dayTypeSchema.optional(),
    })
    .optional(),
  activeStructures: z.array(
    z.object({
      name: z.string().trim().min(1),
      status: structureStatusSchema,
      evidence: z.array(z.string().trim().min(1)),
    }),
  ),
  currentBias: z.object({
    primaryDirection: directionalBiasSchema,
    currentDirection: directionalBiasSchema,
    confidenceOfCurrentDirection: z.number().min(0).max(100),
    reason: z.string().trim().min(1),
  }),
  latestEvent: z
    .object({
      description: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)),
      direction: directionalBiasSchema,
      changesPreviousRead: z.boolean(),
      effect: z.string().trim().min(1),
      invalidates: z.array(z.string().trim().min(1)),
      supports: z.array(z.string().trim().min(1)),
    })
    .optional(),
  openQuestions: z.array(z.string().trim().min(1)),
});

const marketStateResponseSchema = z.object({
  cicle: z.object({
    broaderMarketCicle: activeMarketCicleSchema,
    innerMarketCicle: activeMarketCicleSchema,
  }),
  rangeType: rangeTypeSchema.nullable(),
  locationInRange: rangeLocationSchema.nullable(),
  sessionContext: z
    .object({
      barNumber: z.number().int().nonnegative().nullable(),
      dayType: dayTypeSchema.nullable(),
    })
    .nullable(),
  activeStructures: z.array(
    z.object({
      name: z.string().trim().min(1),
      status: structureStatusSchema,
      evidence: z.array(z.string().trim().min(1)),
    }),
  ),
  currentBias: z.object({
    primaryDirection: directionalBiasSchema,
    currentDirection: directionalBiasSchema,
    confidenceOfCurrentDirection: z.number().min(0).max(100),
    reason: z.string().trim().min(1),
  }),
  latestEvent: z
    .object({
      description: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)),
      direction: directionalBiasSchema,
      changesPreviousRead: z.boolean(),
      effect: z.string().trim().min(1),
      invalidates: z.array(z.string().trim().min(1)),
      supports: z.array(z.string().trim().min(1)),
    })
    .nullable(),
  openQuestions: z.array(z.string().trim().min(1)),
});

const AgentState = new StateSchema({
  userInput: z.string(),
  responseStyle: responseStyleSchema.default("report"),
  detectedPatterns: z.array(z.string()).default([]),
  patternDocs: z.array(z.string()).default([]),
  marketState: marketStateSchema.optional(),
  report: z.string().optional(),
});

type AgentStateType = typeof AgentState.State;
type AgentStateUpdate = typeof AgentState.Update;

const PATTERN_DOCS: Record<string, string> = {
  "failed breakout":
    "Failed breakouts often lead to reversals or trading ranges.",
  triangle: "Triangles are breakout mode patterns with balanced pressure.",
  breakout_mode:
    "Breakout mode means either side can win. Traders wait for confirmation.",
  trading_range:
    "Trading ranges favor fading breakouts and disappoint trend traders.",
};

let llm: ChatOpenAI | undefined;

function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the trading agent.");
  }

  return apiKey;
}

function getTradingModel() {
  llm ??= new ChatOpenAI({
    apiKey: getOpenAIApiKey(),
    model: TRADING_MODEL_NAME,
  });

  return llm;
}

function getMarketStateModel() {
  return getTradingModel().withStructuredOutput(marketStateResponseSchema, {
    name: "market_state_response",
    method: "functionCalling",
    strict: true,
  });
}

function getLangSmithProjectName() {
  return process.env.LANGSMITH_PROJECT?.trim() || DEFAULT_LANGSMITH_PROJECT;
}

function contentToText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function buildConversationTranscript(
  history: TradingAgentInput["history"],
  prompt: string,
) {
  const lines = history.map((message) => {
    const role = message.role === "assistant" ? "Assistant" : "User";

    return `${role}: ${message.content}`;
  });

  lines.push(`User: ${prompt}`);

  return lines.join("\n\n");
}

function normalizeMarketState(
  marketState: z.infer<typeof marketStateResponseSchema>,
): MarketState {
  const sessionContext =
    marketState.sessionContext === null
      ? undefined
      : {
          ...(marketState.sessionContext.barNumber !== null
            ? { barNumber: marketState.sessionContext.barNumber }
            : {}),
          ...(marketState.sessionContext.dayType !== null
            ? { dayType: marketState.sessionContext.dayType }
            : {}),
        };

  const normalized = {
    cicle: marketState.cicle,
    activeStructures: marketState.activeStructures,
    currentBias: marketState.currentBias,
    openQuestions: marketState.openQuestions,
    ...(marketState.rangeType !== null
      ? { rangeType: marketState.rangeType }
      : {}),
    ...(marketState.locationInRange !== null
      ? { locationInRange: marketState.locationInRange }
      : {}),
    ...(sessionContext && Object.keys(sessionContext).length > 0
      ? { sessionContext }
      : {}),
    ...(marketState.latestEvent !== null
      ? { latestEvent: marketState.latestEvent }
      : {}),
  };

  return marketStateSchema.parse(normalized);
}

const detectPatterns: GraphNode<typeof AgentState> = async (
  state,
): Promise<AgentStateUpdate> => {
  const result = await getTradingModel().invoke(`
You are a technical analyst.

Extract the relevant Al Brooks style patterns from this description.

Market description:
${state.userInput}

Return ONLY a comma separated list.
`);

  const patterns = contentToText(result.content)
    .split(",")
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);

  return {
    detectedPatterns: patterns,
  };
};

const retrieveDocs: GraphNode<typeof AgentState> = (
  state,
): AgentStateUpdate => {
  const docs = state.detectedPatterns.flatMap((pattern) => {
    return Object.entries(PATTERN_DOCS)
      .filter(([key]) => pattern.includes(key))
      .map(([, value]) => value);
  });

  return {
    patternDocs: [...new Set(docs)],
  };
};

const buildMarketState: GraphNode<typeof AgentState> = async (
  state,
): Promise<AgentStateUpdate> => {
  const marketStateResponse = await getMarketStateModel().invoke(`
You are a market structure extraction assistant for an Al Brooks price action trading workflow.

Build a conservative structured market state from the transcript and detected patterns.

Conversation transcript:
${state.userInput}

Detected patterns:
${state.detectedPatterns.join(", ")}

Pattern knowledge:
${state.patternDocs.join("\n")}

Rules:
- Extract only what is supported by the transcript.
- Use "unclear" enum values when evidence is weak or missing.
- Do not invent price levels, indicators, timeframes, or events.
- Keep activeStructures evidence grounded in quoted or closely paraphrased transcript details.
- Use openQuestions for remaining high-signal unknowns that materially limit confidence.
- openQuestions should contain concise missing-context statements, not conversational follow-up questions.
- If no meaningful latest event is described, omit latestEvent.
- When data is missing for nullable fields, return null instead of omitting the key.
- confidenceOfCurrentDirection must be a number from 0 to 100.
`);

  return {
    marketState: normalizeMarketState(marketStateResponse),
  };
};

const generateReport: GraphNode<typeof AgentState> = async (
  state,
): Promise<AgentStateUpdate> => {
  const marketState = state.marketState;

  if (!marketState) {
    throw new Error("Trading agent could not build market state.");
  }

  const promptInput = {
    userInput: state.userInput,
    detectedPatterns: state.detectedPatterns,
    patternDocs: state.patternDocs,
    marketState: JSON.stringify(marketState, null, 2),
  };
  const prompt =
    state.responseStyle === "freeform"
      ? freeformTradingSystemPrompt(promptInput)
      : technicalAnalysisSystemPrompt(promptInput);

  const result = await getTradingModel().invoke(
    prompt,
  );

  const report = contentToText(result.content).trim();

  if (!report) {
    throw new Error("Trading agent returned an empty report.");
  }

  return {
    report,
  };
};

const graph = new StateGraph(AgentState)
  .addNode("detect_patterns", detectPatterns)
  .addNode("retrieve_docs", retrieveDocs)
  .addNode("build_market_state", buildMarketState)
  .addNode("generate_report", generateReport)
  .addEdge(START, "detect_patterns")
  .addEdge("detect_patterns", "retrieve_docs")
  .addEdge("retrieve_docs", "build_market_state")
  .addEdge("build_market_state", "generate_report")
  .addEdge("generate_report", END)
  .compile();

async function runTradingAgentImpl(
  input: TradingAgentInput,
): Promise<TradingAgentResult> {
  const prompt = input.prompt.trim();

  if (!prompt) {
    const error = new Error("Trading agent prompt is required.");
    throw error;
  }

  try {
    const transcript = buildConversationTranscript(input.history, prompt);

    const graphResult = await graph.invoke({
      userInput: transcript,
      responseStyle: input.responseStyle,
    });
    const report = graphResult.report?.trim();

    if (!report) {
      throw new Error("Trading agent returned an empty report.");
    }

    const result = tradingAgentResultSchema.parse({
      state: "analysis_ready",
      report,
    });

    return result;
  } catch (error) {
    console.error("Error running trading agent:", error);
    throw error;
  }
}

type RunTradingAgent = (
  input: TradingAgentInput,
) => Promise<TradingAgentResult>;

export const runTradingAgent: RunTradingAgent = traceable(runTradingAgentImpl, {
  name: "runTradingAgent",
  run_type: "chain",
  project_name: getLangSmithProjectName(),
  tags: [...BASE_TRACE_TAGS],
}) as RunTradingAgent;
