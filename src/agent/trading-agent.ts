import "dotenv/config";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { ChatOpenAI } from "@langchain/openai";
import {
  END,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import {
  activeMarketCicleSchema,
  dayTypeSchema,
  directionalBiasSchema,
  latestEventSchema,
  marketStateSchema,
  rangeLocationSchema,
  rangeTypeSchema,
  responseStyleSchema,
  structureStatusSchema,
  tradingAgentResultSchema,
} from "./schemas";
import {
  freeformTradingSystemPrompt,
  questionsSystemPrompt,
  technicalAnalysisSystemPrompt,
} from "./prompts";
import { AVAILABLE_PATTERNS, PATTERN_DOCS } from "../pattern-docs/patterns";
import type {
  MarketState,
  TradingAgentStep,
  TradingAgentStepEvent,
  TradingAgentTextEvent,
  TradingAgentInput,
  TradingAgentResult,
} from "./types";

export type {
  TradingAgentInput,
  TradingAgentResult,
  TradingAgentStep,
  TradingAgentStepEvent,
  TradingAgentTextEvent,
} from "./types";

const DEFAULT_LANGSMITH_PROJECT = "playbook-chat";
const TRADING_MODEL_NAME = "gpt-5.4-mini";
const BASE_TRACE_TAGS = ["trading-agent", "langgraph", "analysis"] as const;
const TRADING_AGENT_STEPS = [
  "detect_patterns",
  "extract_latest_event",
  "retrieve_docs",
  "build_market_state",
  "answer_pattern_questions",
  "generate_report",
] as const satisfies readonly TradingAgentStep[];
const TRADING_AGENT_STEP_LABELS = {
  detect_patterns: "Detecting patterns",
  extract_latest_event: "Extracting latest event",
  retrieve_docs: "Retrieving pattern context",
  build_market_state: "Building market state",
  answer_pattern_questions: "Answering pattern questions",
  generate_report: "Generating report",
} as const satisfies Record<TradingAgentStep, string>;

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
  latestEvent: latestEventSchema.nullable(),
  openQuestions: z.array(z.string().trim().min(1)),
});

const latestEventAnalysisSchema = z.object({
  hasMarketEvent: z.boolean(),
  tags: z.array(z.string().trim().min(1)),
  direction: directionalBiasSchema,
  changesPreviousRead: z.boolean(),
  effect: z.string().trim(),
  invalidates: z.array(z.string().trim().min(1)),
  supports: z.array(z.string().trim().min(1)),
});

const availablePatternSchema = z.enum(
  AVAILABLE_PATTERNS as [string, ...string[]],
);

const selectedPatternDocsSchema = z.object({
  patterns: z.array(availablePatternSchema).max(6),
});

const conversationTranscriptMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const AgentState = new StateSchema({
  userInput: z.array(conversationTranscriptMessageSchema),
  responseStyle: responseStyleSchema.default("report"),
  previousMarketState: marketStateSchema.nullable().optional(),
  detectedPatterns: z.array(z.string()).default([]),
  latestEvent: latestEventSchema.optional(),
  patternDocs: z.array(z.string()).default([]),
  patternAnswers: z.array(z.string()).default([]),
  marketState: marketStateSchema.optional(),
  report: z.string().optional(),
});

type ConversationTranscriptMessage = z.infer<
  typeof conversationTranscriptMessageSchema
>;
type AgentStateType = typeof AgentState.State;
type AgentStateUpdate = typeof AgentState.Update;

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

function getLatestEventModel() {
  return getTradingModel().withStructuredOutput(latestEventAnalysisSchema, {
    name: "latest_event_analysis",
    method: "functionCalling",
    strict: true,
  });
}

function getPatternDocSelectionModel() {
  return getTradingModel().withStructuredOutput(selectedPatternDocsSchema, {
    name: "selected_pattern_docs",
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

function extractReportFromNodeOutput(output: unknown) {
  if (
    output &&
    typeof output === "object" &&
    "report" in output &&
    typeof output.report === "string"
  ) {
    return output.report.trim();
  }

  return "";
}

function extractMarketStateFromNodeOutput(output: unknown) {
  if (output && typeof output === "object" && "marketState" in output) {
    return marketStateSchema.parse(output.marketState);
  }

  return undefined;
}

function buildConversationTranscript(
  history: TradingAgentInput["history"],
  prompt: string,
): ConversationTranscriptMessage[] {
  return [
    ...history.map(({ role, content }) => ({ role, content })),
    { role: "user", content: prompt },
  ];
}

function conversationTranscriptToText(
  messages: ConversationTranscriptMessage[],
) {
  return messages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";

      return `${role}: ${message.content}`;
    })
    .join("\n\n");
}

function getLatestUserMessage(messages: ConversationTranscriptMessage[]) {
  return (
    [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content.trim() ?? ""
  );
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
  config,
): Promise<AgentStateUpdate> => {
  const transcript = conversationTranscriptToText(state.userInput);
  const result = await getTradingModel().invoke(
    `
You are a technical analyst.

Extract the relevant Al Brooks style patterns from this description.

Market description:
${transcript}

Return ONLY a comma separated list.
`,
    config,
  );

  const patterns = contentToText(result.content)
    .split(",")
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);

  return {
    detectedPatterns: patterns,
  };
};

const extractLatestEvent: GraphNode<typeof AgentState> = async (
  state,
  config,
): Promise<AgentStateUpdate> => {
  const latestUserMessage = getLatestUserMessage(state.userInput);

  if (!latestUserMessage) {
    return {};
  }

  const analysis = await getLatestEventModel().invoke(
    `
- You are a trading-pattern assistant using Al Brooks price action methodology. 
- Use Al Brooks priceaction terminology
- You extract the latest market event for a price action trading workflow.

Return an object. Set hasMarketEvent to false when the latest user message does not contain a new market observation.

Latest user message:
${latestUserMessage}

Previous persisted market state:
${state.previousMarketState ? JSON.stringify(state.previousMarketState, null, 2) : "None"}

Detected patterns:
${state.detectedPatterns.join(", ")}

Rules:
- Always return an object.
- Never return null.
- Analyze only the latest user message as the possible new event.
- Use previous persisted market state only to decide whether the new event changes, confirms, weakens, or invalidates the prior read.
- Do not summarize, translate, rewrite, correct, or paraphrase the latest user message.
- Do not include a description field. The application will assign description exactly from the latest user message.
- If the latest user message is not a market observation:
  - set hasMarketEvent to false
  - set tags, invalidates, and supports to []
  - set direction to neutral
  - set changesPreviousRead to false
  - set effect to ""
- If hasMarketEvent is true, effect must be a concise non-empty technical impact statement.
- tags must be short technical labels supported by the latest user message.
- direction is the immediate pressure implied by the latest user message: bullish, bearish, or neutral.
- changesPreviousRead is true only when the latest user message materially confirms, weakens, or invalidates the previous market state.
- effect describes the technical effect of the latest user message compared with the previous market state.
- invalidates lists prior structures or setups weakened by the latest user message.
- supports lists structures or patterns strengthened by the latest user message.
- Do not invent price levels, indicators, timeframes, or patterns not supported by the latest user message and prior context.
`,
    config,
  );

  if (!analysis.hasMarketEvent) {
    return {};
  }

  return {
    latestEvent: latestEventSchema.parse({
      description: latestUserMessage,
      tags: analysis.tags,
      direction: analysis.direction,
      changesPreviousRead: analysis.changesPreviousRead,
      effect: analysis.effect,
      invalidates: analysis.invalidates,
      supports: analysis.supports,
    }),
  };
};

const retrieveDocs: GraphNode<typeof AgentState> = async (
  state,
  config,
): Promise<AgentStateUpdate> => {
  if (state.detectedPatterns.length === 0) {
    return {
      patternDocs: [],
    };
  }

  const selection = await getPatternDocSelectionModel().invoke(
    `
You select local pattern documentation keys for a trading assistant.

Detected pattern labels may be loose, translated, pluralized, abbreviated, or conceptually related.
Map them to the most relevant keys from AVAILABLE_PATTERNS.

<detected_patterns>
${state.detectedPatterns.join(", ")}
</detected_patterns>

<available_patterns>
${AVAILABLE_PATTERNS.join(", ")}
</available_patterns>

Rules:
- Return only keys that exist in AVAILABLE_PATTERNS.
- Do not invent keys.
- Prefer fewer, more relevant docs.
- Return at most 6 keys.
- Return [] when no available pattern is meaningfully relevant.
`,
    config,
  );

  const docs = selection.patterns
    .filter((key) => key in PATTERN_DOCS)
    .map((key) => `${key}: ${PATTERN_DOCS[key]}`);

  return {
    patternDocs: docs,
  };
};

const buildMarketState: GraphNode<typeof AgentState> = async (
  state,
  config,
): Promise<AgentStateUpdate> => {
  // const transcript = conversationTranscriptToText(state.userInput);
  // Conversation transcript:
  // ${transcript}
  const marketStateResponse = await getMarketStateModel().invoke(
    `
You are a market structure extraction assistant for an Al Brooks price action metodology trading workflow.

Build a conservative structured market state from the transcript and detected patterns.

<previous_market_state>
${state.previousMarketState ? JSON.stringify(state.previousMarketState, null, 2) : "None"}
</previous_market_state>

<important_patterns_questions>
${state.patternDocs.join("\n")}
</important_patterns_questions>

<detected_patterns>
${state.detectedPatterns.join(", ")}
</detected_patterns>

<latest_extracted_event>
${state.latestEvent ? JSON.stringify(state.latestEvent, null, 2) : "None"}
<latest_extracted_event>

Rules:
- Extract only what is supported by the transcript.
- Preserve still-valid prior structures only when the new observation does not invalidate them.
- Do not carry forward weak prior assumptions as confirmed facts.
- Use "unclear" enum values when evidence is weak or missing.
- Do not invent price levels, indicators, timeframes, or events.
- Keep activeStructures evidence grounded in quoted or closely paraphrased transcript details.
- Use openQuestions for remaining high-signal unknowns that materially limit confidence.
- openQuestions should be based in important_patterns_questions.
- If no meaningful latest event is described, omit latestEvent.
- When data is missing for nullable fields, return null instead of omitting the key.
- confidenceOfCurrentDirection must be a number from 0 to 100.
`,
    config,
  );
  const marketState = normalizeMarketState(marketStateResponse);

  return {
    marketState: state.latestEvent
      ? marketStateSchema.parse({
          ...marketState,
          latestEvent: state.latestEvent,
        })
      : marketState,
  };
};

const answerPatternQuestions: GraphNode<typeof AgentState> = async (
  state,
  config,
): Promise<AgentStateUpdate> => {
  if (!state.marketState || state.patternDocs.length === 0) {
    return {
      patternAnswers: [],
    };
  }

  const result = await getTradingModel().invoke(
    questionsSystemPrompt({
      previousMarketState: state.previousMarketState ?? null,
      marketState: state.marketState,
      latestEvent: state.latestEvent ?? state.marketState.latestEvent ?? null,
      patternDocs: state.patternDocs,
    }),
    config,
  );
  const answer = contentToText(result.content).trim();

  return {
    patternAnswers: answer ? [answer] : [],
  };
};

function buildReportPrompt(state: AgentStateType) {
  const marketState = state.marketState;

  if (!marketState) {
    throw new Error("Trading agent could not build market state.");
  }

  const transcript = conversationTranscriptToText(state.userInput);

  if (state.responseStyle === "freeform") {
    return freeformTradingSystemPrompt({
      userInput: transcript,
      previousMarketState: state.previousMarketState ?? null,
      marketState: JSON.stringify(marketState, null, 2),
    });
  }

  return technicalAnalysisSystemPrompt({
    previousMarketState: state.previousMarketState ?? null,
    marketState,
    latestEvent: state.latestEvent ?? marketState.latestEvent ?? null,
    patternAnswers: [],
  });
}

const generateReport: GraphNode<typeof AgentState> = async (
  state,
  config,
): Promise<AgentStateUpdate> => {
  const prompt = buildReportPrompt(state);
  const chunks = await getTradingModel().stream(prompt, config);
  let report = "";

  for await (const chunk of chunks) {
    report += contentToText(chunk.content);
  }

  const trimmedReport = report.trim();

  if (!trimmedReport) {
    throw new Error("Trading agent returned an empty report.");
  }

  return {
    report: trimmedReport,
  };
};

const graph = new StateGraph(AgentState)
  .addNode("detect_patterns", detectPatterns)
  .addNode("extract_latest_event", extractLatestEvent)
  .addNode("retrieve_docs", retrieveDocs)
  .addNode("build_market_state", buildMarketState)
  // .addNode("answer_pattern_questions", answerPatternQuestions)
  .addNode("generate_report", generateReport)
  .addEdge(START, "detect_patterns")
  .addEdge("detect_patterns", "extract_latest_event")
  .addEdge("extract_latest_event", "retrieve_docs")
  .addEdge("retrieve_docs", "build_market_state")
  // .addEdge("build_market_state", "answer_pattern_questions")
  // .addEdge("answer_pattern_questions", "generate_report")
  .addEdge("build_market_state", "generate_report")
  .addEdge("generate_report", END)
  .compile();

function validatePrompt(input: TradingAgentInput) {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Trading agent prompt is required.");
  }

  return prompt;
}

function buildGraphInput(input: TradingAgentInput) {
  const prompt = validatePrompt(input);
  const transcript = buildConversationTranscript(input.history, prompt);

  return {
    userInput: transcript,
    responseStyle: input.responseStyle,
    previousMarketState: input.previousMarketState ?? null,
  };
}

function createStepEvent(
  step: TradingAgentStep,
  status: TradingAgentStepEvent["status"],
): TradingAgentStepEvent {
  return {
    type: "step",
    step,
    status,
    label: TRADING_AGENT_STEP_LABELS[step],
  };
}

function isTradingAgentStep(value: string): value is TradingAgentStep {
  return TRADING_AGENT_STEPS.includes(value as TradingAgentStep);
}

async function runTradingAgentImpl(
  input: TradingAgentInput,
): Promise<TradingAgentResult> {
  try {
    const graphResult = await graph.invoke(buildGraphInput(input));
    const report = graphResult.report?.trim();

    if (!report) {
      throw new Error("Trading agent returned an empty report.");
    }

    const result = tradingAgentResultSchema.parse({
      state: "analysis_ready",
      report,
      marketState: graphResult.marketState,
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

export async function* streamTradingAgent(
  input: TradingAgentInput,
  signal?: AbortSignal,
): AsyncGenerator<TradingAgentTextEvent, TradingAgentResult> {
  try {
    const graphInput = buildGraphInput(input);
    const events = graph.streamEvents(graphInput, {
      version: "v2",
      ...(signal ? { signal } : {}),
    });
    let streamedReport = "";
    let finalReport = "";
    let marketState: MarketState | undefined;

    for await (const event of events) {
      if (event.event === "on_chain_start") {
        const node = event.metadata?.langgraph_node;

        if (isTradingAgentStep(node) && event.name === node) {
          yield createStepEvent(node, "running");
        }
      }

      if (event.event === "on_chain_end") {
        const node = event.metadata?.langgraph_node;

        if (isTradingAgentStep(node) && event.name === node) {
          yield createStepEvent(node, "completed");

          if (node === "generate_report") {
            const report = extractReportFromNodeOutput(event.data?.output);

            if (report) {
              finalReport = report;
            }
          }

          if (node === "build_market_state") {
            marketState = extractMarketStateFromNodeOutput(event.data?.output);
          }
        }
      }

      if (
        event.event === "on_chat_model_stream" &&
        event.metadata?.langgraph_node === "generate_report"
      ) {
        const delta = contentToText(event.data?.chunk?.content);

        if (delta) {
          streamedReport += delta;

          yield {
            type: "text_delta",
            delta,
          };
        }
      }
    }

    const report = finalReport.trim() || streamedReport.trim();

    if (!report) {
      throw new Error("Trading agent returned an empty report.");
    }

    if (!marketState) {
      throw new Error("Trading agent did not return a market state.");
    }

    return tradingAgentResultSchema.parse({
      state: "analysis_ready",
      report,
      marketState,
    });
  } catch (error) {
    console.error("Error streaming trading agent:", error);
    throw error;
  }
}
