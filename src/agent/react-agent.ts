import "dotenv/config";
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/messages/tool";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

const DEFAULT_LANGSMITH_PROJECT = "playbook-chat";
const REACT_MODEL_NAME = "gpt-5.4-mini";
// Hard stop for model-tool loops that keep requesting more actions.
const MAX_REACT_ITERATIONS = 6;

const reactChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
});

const reactAgentInputSchema = z.object({
  message: z.string().trim().min(1),
  history: z.array(reactChatMessageSchema).default([]),
});

const reactAgentResultSchema = z.object({
  message: z.string().trim().min(1),
});

export type ReactAgentInput = z.infer<typeof reactAgentInputSchema>;
export type ReactAgentResult = z.infer<typeof reactAgentResultSchema>;

// UI-facing tool lifecycle events streamed through tRPC.
export type ReactToolEvent = {
  type: "tool";
  name: string;
  status: "started" | "completed" | "error";
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type ReactAgentStreamEvent =
  | {
      type: "text_delta";
      delta: string;
    }
  | ReactToolEvent;

const REACT_AGENT_SYSTEM_PROMPT = `You are a custom ReAct trading assistant.

Use tools only when they materially improve the answer.
Use market_screenshot when current chart visual context would materially change the answer.
If market_screenshot returns unavailable, do not invent screenshot or chart details.
Do not invent price levels, indicators, timeframes, volume details, or unsupported facts.
Separate observation from interpretation.
Waiting or no-trade is valid.
Keep answers concise, practical, and grounded in the user's text and tool output.`;

// Stub only: the agent must not treat this as real visual market evidence.
const marketScreenshotTool = tool(
  async ({ reason }) =>
    JSON.stringify({
      status: "unavailable",
      message: "Market screenshot capture is not implemented yet.",
      reason,
    }),
  {
    name: "market_screenshot",
    description:
      "Request the current market screenshot. This is currently a stub and returns an unavailable status.",
    schema: z.object({
      reason: z.string().trim().min(1),
    }),
  },
);

// Registry used by runTools for explicit, project-owned tool dispatch.
const REACT_TOOLS = [marketScreenshotTool] as const;
const TOOL_BY_NAME = new Map(REACT_TOOLS.map(item => [item.name, item]));

// Graph channels: messages hold the conversation/tool transcript, iterations
// counts model calls, and toolEvents feeds the browser activity panel.
const ReactAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: (left, right) => {
      // LangGraph nodes may append one message or a batch of messages.
      if (Array.isArray(right)) {
        return left.concat(right);
      }

      return left.concat([right]);
    },
    default: () => [],
  }),
  iterations: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  toolEvents: Annotation<ReactToolEvent[], ReactToolEvent | ReactToolEvent[]>({
    reducer: (left, right) => {
      if (Array.isArray(right)) {
        return left.concat(right);
      }

      return left.concat([right]);
    },
    default: () => [],
  }),
});

type ReactAgentStateType = typeof ReactAgentState.State;
type ReactAgentStateUpdate = typeof ReactAgentState.Update;

let llm: ChatOpenAI | undefined;

function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the ReAct agent.");
  }

  return apiKey;
}

function getReactModel() {
  llm ??= new ChatOpenAI({
    apiKey: getOpenAIApiKey(),
    model: REACT_MODEL_NAME,
  });

  return llm;
}

function getLangSmithProjectName() {
  return process.env.LANGSMITH_PROJECT?.trim() || DEFAULT_LANGSMITH_PROJECT;
}

// Normalize LangChain/OpenAI content blocks into plain text for streaming.
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

function getLastAiMessage(messages: BaseMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message && AIMessage.isInstance(message)) {
      return message;
    }
  }

  return undefined;
}

function getToolCalls(message: BaseMessage | undefined): ToolCall[] {
  if (!message || !AIMessage.isInstance(message)) {
    return [];
  }

  return message.tool_calls ?? [];
}

function toolOutputToText(output: unknown) {
  if (ToolMessage.isInstance(output)) {
    return contentToText(output.content);
  }

  if (typeof output === "string") {
    return output;
  }

  return JSON.stringify(output);
}

function buildInitialMessages(input: ReactAgentInput) {
  return [
    ...input.history.map((message) =>
      message.role === "user"
        ? new HumanMessage(message.content)
        : new AIMessage(message.content),
    ),
    new HumanMessage(input.message),
  ];
}

function buildGraphInput(input: ReactAgentInput) {
  const parsedInput = reactAgentInputSchema.parse(input);

  return {
    messages: buildInitialMessages(parsedInput),
    iterations: 0,
    toolEvents: [],
  };
}

// Merge streamed AI chunks so final content and tool calls stay intact.
async function collectAiMessage(
  chunks: AsyncIterable<AIMessageChunk>,
): Promise<AIMessageChunk> {
  let response: AIMessageChunk | undefined;

  for await (const chunk of chunks) {
    response = response ? response.concat(chunk) : chunk;
  }

  if (!response) {
    throw new Error("ReAct agent model returned an empty response.");
  }

  return response;
}

// Model step for the ReAct loop; tools are bound only at this boundary.
const callModel = async (
  state: ReactAgentStateType,
  config: LangGraphRunnableConfig,
): Promise<ReactAgentStateUpdate> => {
  const modelWithTools = getReactModel().bindTools(REACT_TOOLS);
  const chunks = await modelWithTools.stream(
    [new SystemMessage(REACT_AGENT_SYSTEM_PROMPT), ...state.messages],
    config,
  );
  const response = await collectAiMessage(chunks);

  return {
    messages: response,
    iterations: state.iterations + 1,
  };
};

// Manual tool execution keeps validation, telemetry, and future screenshots local.
const runTools = async (
  state: ReactAgentStateType,
): Promise<ReactAgentStateUpdate> => {
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = getToolCalls(lastMessage);

  if (toolCalls.length === 0) {
    return {};
  }

  const toolMessages: ToolMessage[] = [];
  const toolEvents: ReactToolEvent[] = [];

  for (const toolCall of toolCalls) {
    const toolCallId = toolCall.id ?? crypto.randomUUID();
    const selectedTool = TOOL_BY_NAME.get(toolCall.name);

    toolEvents.push({
      type: "tool",
      name: toolCall.name,
      status: "started",
      input: toolCall.args,
    });

    // Unknown tools become ToolMessages so the model can recover in-context.
    if (!selectedTool) {
      const error = `Unknown tool: ${toolCall.name}`;

      toolEvents.push({
        type: "tool",
        name: toolCall.name,
        status: "error",
        input: toolCall.args,
        error,
      });
      toolMessages.push(
        new ToolMessage({
          content: error,
          tool_call_id: toolCallId,
          status: "error",
        }),
      );
      continue;
    }

    try {
      const output = await selectedTool.invoke(toolCall);
      const outputText = toolOutputToText(output);

      toolEvents.push({
        type: "tool",
        name: toolCall.name,
        status: "completed",
        input: toolCall.args,
        output: outputText,
      });
      toolMessages.push(
        new ToolMessage({
          content: outputText,
          tool_call_id: toolCallId,
          status: "success",
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tool execution failed.";

      toolEvents.push({
        type: "tool",
        name: toolCall.name,
        status: "error",
        input: toolCall.args,
        error: message,
      });
      toolMessages.push(
        new ToolMessage({
          content: message,
          tool_call_id: toolCallId,
          status: "error",
        }),
      );
    }
  }

  return {
    messages: toolMessages,
    toolEvents,
  };
};

// Force a final no-more-tools answer after the iteration guard trips.
const finalizeAfterLimit = async (
  state: ReactAgentStateType,
  config: LangGraphRunnableConfig,
): Promise<ReactAgentStateUpdate> => {
  const chunks = await getReactModel().stream(
    [
      new SystemMessage(REACT_AGENT_SYSTEM_PROMPT),
      ...state.messages,
      new HumanMessage(
        "You hit the internal tool-iteration limit. Answer now using only the information already available. State that additional tool use could not continue if that affects confidence.",
      ),
    ],
    config,
  );
  const response = await collectAiMessage(chunks);

  return {
    messages: response,
  };
};

// Branch after each model call: finish, run tools, or stop looping and finalize.
function routeAfterModel(state: ReactAgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1];
  const hasToolCalls = getToolCalls(lastMessage).length > 0;

  if (!hasToolCalls) {
    return END;
  }

  if (state.iterations >= MAX_REACT_ITERATIONS) {
    return "finalize_after_limit";
  }

  return "run_tools";
}

// START -> call_model -> run_tools -> call_model
//                      -> finalize_after_limit
//                      -> END
const graph = new StateGraph(ReactAgentState)
  .addNode("call_model", callModel)
  .addNode("run_tools", runTools)
  .addNode("finalize_after_limit", finalizeAfterLimit)
  .addEdge(START, "call_model")
  .addConditionalEdges("call_model", routeAfterModel, [
    "run_tools",
    "finalize_after_limit",
    END,
  ])
  .addEdge("run_tools", "call_model")
  .addEdge("finalize_after_limit", END)
  .compile();

function extractResult(state: ReactAgentStateType): ReactAgentResult {
  const lastAiMessage = getLastAiMessage(state.messages);
  const message = contentToText(lastAiMessage?.content).trim();

  if (!message) {
    throw new Error("ReAct agent returned an empty response.");
  }

  return reactAgentResultSchema.parse({
    message,
  });
}

export async function runReactAgent(
  input: ReactAgentInput,
): Promise<ReactAgentResult> {
  const result = await graph.invoke(buildGraphInput(input));

  return extractResult(result);
}

// Only model nodes should surface assistant text to the client stream.
function extractMessageDelta(payload: unknown) {
  if (!Array.isArray(payload)) {
    return "";
  }

  const [message, metadata] = payload as [BaseMessage, Record<string, unknown>];

  if (
    metadata?.langgraph_node !== "call_model" &&
    metadata?.langgraph_node !== "finalize_after_limit"
  ) {
    return "";
  }

  return contentToText(message.content);
}

// Tool events arrive as updates from the run_tools node.
function extractToolEvents(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("run_tools" in payload)) {
    return [];
  }

  const runToolsOutput = payload.run_tools;

  if (
    !runToolsOutput ||
    typeof runToolsOutput !== "object" ||
    !("toolEvents" in runToolsOutput) ||
    !Array.isArray(runToolsOutput.toolEvents)
  ) {
    return [];
  }

  return runToolsOutput.toolEvents as ReactToolEvent[];
}

// Map LangGraph stream modes into the tRPC event contract.
export async function* streamReactAgent(
  input: ReactAgentInput,
  signal?: AbortSignal,
): AsyncGenerator<ReactAgentStreamEvent, ReactAgentResult> {
  const stream = await graph.stream(buildGraphInput(input), {
    streamMode: ["messages", "updates", "values"],
    runName: "streamReactAgent",
    tags: ["react-agent"],
    callbacks: [
      new LangChainTracer({
        projectName: getLangSmithProjectName(),
      }),
    ],
    ...(signal ? { signal } : {}),
  });
  let latestState: ReactAgentStateType | undefined;

  for await (const chunk of stream) {
    if (!Array.isArray(chunk)) {
      continue;
    }

    const [mode, payload] = chunk as [string, unknown];

    if (mode === "messages") {
      const delta = extractMessageDelta(payload);

      if (delta) {
        yield {
          type: "text_delta",
          delta,
        };
      }
    }

    if (mode === "updates") {
      for (const event of extractToolEvents(payload)) {
        yield event;
      }
    }

    if (mode === "values") {
      latestState = payload as ReactAgentStateType;
    }
  }

  if (!latestState) {
    throw new Error("ReAct agent did not return a final state.");
  }

  return extractResult(latestState);
}
