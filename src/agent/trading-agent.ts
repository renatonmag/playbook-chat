import "dotenv/config";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  contextSufficiencySystemPrompt,
  technicalAnalysisSystemPrompt,
} from "./prompts";
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

function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the trading agent.");
  }

  return apiKey;
}

function createTradingModel() {
  return new ChatOpenAI({
    apiKey: getOpenAIApiKey(),
    model: "gpt-5.4", // "gpt-5.5-2026-04-23"
    temperature: 0.2,
  });
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

function createSufficientContextResult(): ContextSufficiencyResult {
  return {
    context_sufficiency: "sufficient",
    context_request_header:
      "Before I give the read, I need a bit more context:",
    missing_context: [],
    questions: [],
  };
}

function normalizeContextResult(
  result: ContextSufficiencyResult,
): ContextSufficiencyResult {
  if (result.context_sufficiency === "sufficient") {
    return {
      ...createSufficientContextResult(),
      context_request_header: result.context_request_header,
    };
  }

  if (result.questions.length === 0) {
    return {
      ...createSufficientContextResult(),
      context_request_header: result.context_request_header,
    };
  }

  return {
    context_sufficiency: "insufficient",
    context_request_header: result.context_request_header,
    missing_context: result.missing_context.slice(0, 8),
    questions: result.questions.slice(0, 3),
  };
}

function formatContextQuestions(result: ContextSufficiencyResult) {
  const intro = result.context_request_header;
  const formattedQuestions = result.questions
    .slice(0, 3)
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n");

  return `${intro}\n\n${formattedQuestions}`;
}

async function checkContextSufficiency(
  model: ChatOpenAI,
  transcript: string,
  latestPrompt: string,
) {
  try {
    const checker = model.withStructuredOutput(contextSufficiencyResultSchema, {
      name: "context_sufficiency_checker",
    });
    const result = await checker.invoke([
      new SystemMessage(contextSufficiencySystemPrompt),
      new HumanMessage(
        `Full conversation:\n\n${transcript}\n\nLatest user message:\n\n${latestPrompt}`,
      ),
    ]);

    return normalizeContextResult(contextSufficiencyResultSchema.parse(result));
  } catch (error) {
    console.error("Error checking trading context sufficiency:", error);
    return createSufficientContextResult();
  }
}

async function runTechnicalAnalysis(model: ChatOpenAI, transcript: string) {
  const response = await model.invoke([
    new SystemMessage(technicalAnalysisSystemPrompt),
    new HumanMessage(transcript),
  ]);

  console.log("response", response);

  const report = contentToText(response.content).trim();

  if (!report) {
    throw new Error("Trading agent returned an empty report.");
  }

  return report;
}

export async function runTradingAgent(
  input: TradingAgentInput,
): Promise<TradingAgentResult> {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Trading agent prompt is required.");
  }

  try {
    const model = createTradingModel();
    const transcript = buildConversationTranscript(input.history, prompt);
    const contextSufficiency = await checkContextSufficiency(
      model,
      transcript,
      prompt,
    );

    console.log("contextSufficiency", contextSufficiency);

    if (contextSufficiency.context_sufficiency === "insufficient") {
      return tradingAgentResultSchema.parse({
        state: "needs_context",
        report: formatContextQuestions(contextSufficiency),
        contextSufficiency,
      });
    }

    console.log("running technical analysis");

    return tradingAgentResultSchema.parse({
      state: "analysis_ready",
      report: await runTechnicalAnalysis(model, transcript),
      contextSufficiency,
    });
  } catch (error) {
    console.error("Error running trading agent:", error);
    throw error;
  }
}
