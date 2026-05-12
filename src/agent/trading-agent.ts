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
import {
  contextSufficiencyResultSchema,
  tradingAgentResultSchema,
} from "./schemas";
import type {
  ContextSufficiencyResult,
  TradingAgentInput,
  TradingAgentResult,
} from "./types";

export type { TradingAgentInput, TradingAgentResult } from "./types";

const CONTEXT_REQUEST_HEADER =
  "Before I give the read, I need a bit more context:";

const FALLBACK_CONTEXT_QUESTION =
  "What is the current market location, trend/range state, and recent follow-through?";

const DEFAULT_LANGSMITH_PROJECT = "playbook-chat";
const TRADING_MODEL_NAME = "gpt-5.4-mini";
const BASE_TRACE_TAGS = ["trading-agent", "langgraph", "analysis"] as const;

const TradingState = new StateSchema({
  userInput: z.string(),
  detectedPatterns: z.array(z.string()).default([]),
  patternDocs: z.array(z.string()).default([]),
  contextSufficient: z.boolean().optional(),
  missingContext: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  report: z.string().optional(),
});

type TradingStateType = typeof TradingState.State;
type TradingStateUpdate = typeof TradingState.Update;

const contextCheckerResponseSchema = z.object({
  sufficient: z.boolean(),
  missing_context: z.array(z.string().trim().min(1)).default([]),
  questions: z.array(z.string().trim().min(1)).default([]),
});

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

function extractJson(text: string) {
  const trimmed = text.trim();
  const fencedJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedJson?.[1]) {
    return fencedJson[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function parseContextCheckerResponse(text: string) {
  try {
    const parsed = JSON.parse(extractJson(text));

    return contextCheckerResponseSchema.parse(parsed);
  } catch (error) {
    console.error("Error parsing context checker response:", error);

    return {
      sufficient: true,
      missing_context: [],
      questions: [],
    };
  }
}

function createContextSufficiencyResult(
  graphResult: TradingStateType,
): ContextSufficiencyResult {
  if (graphResult.contextSufficient === false) {
    const questions =
      graphResult.questions.length > 0
        ? graphResult.questions.slice(0, 3)
        : [FALLBACK_CONTEXT_QUESTION];

    return contextSufficiencyResultSchema.parse({
      context_sufficiency: "insufficient",
      context_request_header: CONTEXT_REQUEST_HEADER,
      missing_context: graphResult.missingContext.slice(0, 8),
      questions,
    });
  }

  return contextSufficiencyResultSchema.parse({
    context_sufficiency: "sufficient",
    context_request_header: CONTEXT_REQUEST_HEADER,
    missing_context: [],
    questions: [],
  });
}

const detectPatterns: GraphNode<typeof TradingState> = async (
  state,
): Promise<TradingStateUpdate> => {
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

const retrieveDocs: GraphNode<typeof TradingState> = (
  state,
): TradingStateUpdate => {
  const docs = state.detectedPatterns.flatMap((pattern) => {
    return Object.entries(PATTERN_DOCS)
      .filter(([key]) => pattern.includes(key))
      .map(([, value]) => value);
  });

  return {
    patternDocs: [...new Set(docs)],
  };
};

const checkContext: GraphNode<typeof TradingState> = async (
  state,
): Promise<TradingStateUpdate> => {
  const result = await getTradingModel().invoke(`
You are a market context evaluator.

Determine if there is enough context
to produce a reliable trading analysis.

User description:
${state.userInput}

Detected patterns:
${state.detectedPatterns.join(", ")}

Rules:
- Mark context sufficient when the description gives enough price-action context
  for a useful Al Brooks style read, even if exact prices are missing.
- Do not require instrument, exact numeric prices, volume, account details,
  or higher-timeframe context unless the user's described setup specifically
  depends on those details.
- Prefer asking about missing market structure: trend vs range, location in
  the day range, signal bar quality, follow-through, overlap, tails, and moving
  average relationship when relevant.
- Ask at most 3 concise questions.

Return JSON:

{
  "sufficient": boolean,
  "missing_context": string[],
  "questions": string[]
}
`);

  const json = parseContextCheckerResponse(contentToText(result.content));

  return {
    contextSufficient: json.sufficient,
    missingContext: json.missing_context.slice(0, 8),
    questions: json.questions.slice(0, 3),
  };
};

const askQuestions: GraphNode<typeof TradingState> = (
  state,
): TradingStateUpdate => {
  const questions =
    state.questions.length > 0
      ? state.questions.slice(0, 3)
      : [FALLBACK_CONTEXT_QUESTION];

  return {
    questions,
    report: `I need more context before analysis:

${questions.map((question) => `- ${question}`).join("\n")}
`,
  };
};

const generateReport: GraphNode<typeof TradingState> = async (
  state,
): Promise<TradingStateUpdate> => {
  const result = await getTradingModel().invoke(`
You are an Al Brooks style technical analyst.

User description:
${state.userInput}

Detected patterns:
${state.detectedPatterns.join(", ")}

Pattern knowledge:
${state.patternDocs.join("\n")}

Create a structured report with:

1. Context
2. What traders expect
3. What could go wrong
4. Trade opportunities
5. Invalidation
6. Probability assessment
`);

  const report = contentToText(result.content).trim();

  if (!report) {
    throw new Error("Trading agent returned an empty report.");
  }

  return {
    report,
  };
};

const graph = new StateGraph(TradingState)
  .addNode("detect_patterns", detectPatterns)
  .addNode("retrieve_docs", retrieveDocs)
  .addNode("check_context", checkContext)
  .addNode("ask_questions", askQuestions)
  .addNode("generate_report", generateReport)
  .addEdge(START, "detect_patterns")
  .addEdge("detect_patterns", "retrieve_docs")
  .addEdge("retrieve_docs", "check_context")
  .addConditionalEdges("check_context", (state) =>
    state.contextSufficient ? "generate_report" : "ask_questions",
  )
  .addEdge("ask_questions", END)
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
    });
    const report = graphResult.report?.trim();

    if (!report) {
      throw new Error("Trading agent returned an empty report.");
    }

    const contextSufficiency = createContextSufficiencyResult(graphResult);

    const result = tradingAgentResultSchema.parse({
      state:
        contextSufficiency.context_sufficiency === "insufficient"
          ? "needs_context"
          : "analysis_ready",
      report,
      contextSufficiency,
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
