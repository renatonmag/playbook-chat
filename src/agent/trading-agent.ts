import "dotenv/config";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { tradingAgentSystemPrompt } from "./prompts";

export type TradingAgentInput = {
  prompt: string;
};

export type TradingAgentResult = {
  report: string;
};

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

export async function runTradingAgent(
  input: TradingAgentInput,
): Promise<TradingAgentResult> {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Trading agent prompt is required.");
  }

  try {
    const model = createTradingModel();
    const response = await model.invoke([
      new SystemMessage(tradingAgentSystemPrompt),
      new HumanMessage(prompt),
    ]);
    const report = contentToText(response.content).trim();
    if (!report) {
      throw new Error("Trading agent returned an empty report.");
    }

    return { report };
  } catch (error) {
    console.error("Error running trading agent:", error);
    throw error;
  }
}
