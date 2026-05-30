import "dotenv/config";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { traceable } from "langsmith/traceable";
import { z } from "zod";

const LEGACY_LONGER_TERM_PREDICTION =
  "No longer-term prediction was stored for this earlier response.";

const ImmediateBarAnalysisSchema = z.object({
  mode: z.enum(["initial_analysis", "followup_analysis"]),
  recentMove: z.string(),
  corroborationWithPreviousPrediction: z.string().nullable(),
  alBrooksContext: z.string(),
  prediction: z.string(),
  invalidation: z.string(),
  conciseForecast: z.string(),
});

const LongerTermPredictionSchema = z.object({
  longerTermPrediction: z.string().trim().min(1),
});

const BarAnalysisSchema = ImmediateBarAnalysisSchema.extend({
  longerTermPrediction: z.string().trim().min(1),
});

const LegacyBarAnalysisSchema = ImmediateBarAnalysisSchema.extend({
  longerTermPrediction: z.string().trim().min(1).optional(),
});

const priceActionMemoryInputSchema = z
  .object({
    previousPrediction: z.string().nullable().optional(),
    previousAnalysis: LegacyBarAnalysisSchema.nullable().optional(),
    history: z.array(LegacyBarAnalysisSchema).optional(),
  })
  .optional();

export const barAnalysisSchema = BarAnalysisSchema;

export const chartRenderRequestSchema = z.object({
  lastCandleTime: z.string().trim().min(1),
  candleCount: z.number().int().positive(),
  symbol: z.string().trim().default("WIN@N"),
  timeframe: z.string().trim().default("M5"),
});

export type BarAnalysis = z.infer<typeof BarAnalysisSchema>;
type ImmediateBarAnalysis = z.infer<typeof ImmediateBarAnalysisSchema>;
export type ChartRenderRequest = z.infer<typeof chartRenderRequestSchema>;

const AgentState = Annotation.Root({
  imageDataUrl: Annotation<string>(),
  previousPrediction: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  previousAnalysis: Annotation<BarAnalysis | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  history: Annotation<BarAnalysis[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  currentAnalysis: Annotation<ImmediateBarAnalysis | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  result: Annotation<BarAnalysis | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

export type PriceActionAgentState = typeof AgentState.State;
export type PriceActionAgentMemory = Pick<
  PriceActionAgentState,
  "previousPrediction" | "previousAnalysis" | "history"
>;

const model = new ChatOpenAI({
  model: "gpt-5.4-mini",
  temperature: 0.2,
});
const DEFAULT_LANGSMITH_PROJECT = "playbook-chat";
const BASE_TRACE_TAGS = [
  "price-action-agent",
  "langgraph",
  "chart-analysis",
] as const;

const immediateAnalysisModel = model.withStructuredOutput(
  ImmediateBarAnalysisSchema,
);
const longerTermPredictionModel = model.withStructuredOutput(
  LongerTermPredictionSchema,
);

function getLangSmithProjectName() {
  return process.env.LANGSMITH_PROJECT?.trim() || DEFAULT_LANGSMITH_PROJECT;
}

function getChartRendererUrl() {
  return (
    process.env.CHART_RENDERER_URL?.trim() || "http://localhost:3001/render"
  );
}

async function renderChartToDataUrl(input: ChartRenderRequest) {
  const response = await fetch(getChartRendererUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Chart renderer failed with ${response.status}: ${message}`,
    );
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("image/png")) {
    throw new Error(
      `Chart renderer returned unsupported content type: ${contentType || "unknown"}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function analyzeChart(state: typeof AgentState.State) {
  const isFirstImage = !state.previousPrediction;

  const task = isFirstImage
    ? `
You are analyzing the FIRST chart image.

Task:
1. Identify the recent active move.
2. Analyze the most recent bars using Al Brooks Price Action concepts.
3. Make a prediction for the next bars.
4. Be probabilistic, not certain.
`
    : `
You are analyzing a FOLLOW-UP chart image with new bars.

Previous prediction:
${state.previousPrediction}

Task:
1. Analyze what the newest bars show.
2. Explain what in the current image corroborates or contradicts the previous prediction.
3. Update the Al Brooks Price Action context.
4. Make a new prediction for the next bars.
5. Be probabilistic, not certain.
`;

  const response = await immediateAnalysisModel.invoke([
    {
      role: "system",
      content: `
You are an Al Brooks Price Action trading assistant.

Focus on:
- last active move
- follow-through or lack of follow-through
- trading range vs trend
- higher low / lower high attempts
- breakout mode
- failed breakout
- moving average interaction
- signal bars and context
- double top / double bottom 
- canal estreito 
- canal amplo 
- giveup bar, surprise bar, reversal bar, trend bar 
- spike and channel 
- pullback 
- segunda entrada 
- falha de rompimento 
- sell climax / buy climax 
- always in long / always in short 
- barras de tendência fortes/fracas 
- microchannel 
- wedge

Do not give financial advice or trade instructions.
Return structured analysis only.
`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: task,
        },
        {
          type: "image_url",
          image_url: {
            url: state.imageDataUrl,
          },
        },
      ],
    },
  ]);

  return {
    currentAnalysis: response,
  };
}

function formatPreviousResponses(history: BarAnalysis[]) {
  if (history.length === 0) {
    return "None.";
  }

  return history
    .map(
      (item, index) => `
Response ${index + 1}:
- mode: ${item.mode}
- recent move: ${item.recentMove}
- immediate prediction: ${item.prediction}
- longer-term prediction: ${item.longerTermPrediction}
- invalidation: ${item.invalidation}
- concise forecast: ${item.conciseForecast}`,
    )
    .join("\n");
}

async function createLongerTermPrediction(state: typeof AgentState.State) {
  if (!state.currentAnalysis) {
    throw new Error(
      "Cannot create longer-term prediction without current analysis.",
    );
  }

  const response = await longerTermPredictionModel.invoke([
    {
      role: "system",
      content: `
You are an Al Brooks Price Action trading assistant.

Focus on:
- last active move
- follow-through or lack of follow-through
- trading range vs trend
- higher low / lower high attempts
- breakout mode
- failed breakout
- moving average interaction
- signal bars and context
- double top / double bottom 
- canal estreito 
- canal amplo 
- giveup bar, surprise bar, reversal bar, trend bar 
- spike and channel 
- pullback 
- segunda entrada 
- falha de rompimento 
- sell climax / buy climax 
- always in long / always in short 
- barras de tendência fortes/fracas 
- microchannel 
- wedge

Do not give financial advice or trade instructions.
Return structured analysis only.
`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `
          If you have to make a prediction, not for the imidiate next bar, but for longer, couple moves.
          Use the last active move, be smart about it.
          Keep in 2 phrases.
          `,
        },
        {
          type: "image_url",
          image_url: {
            url: state.imageDataUrl,
          },
        },
      ],
    },
  ]);

  const finalAnalysis = {
    ...state.currentAnalysis,
    longerTermPrediction: response.longerTermPrediction,
  };

  return {
    result: finalAnalysis,
    previousPrediction: finalAnalysis.prediction,
    previousAnalysis: finalAnalysis,
    history: [finalAnalysis],
  };
}

const graph = new StateGraph(AgentState)
  .addNode("analyzeChart", analyzeChart)
  .addNode("createLongerTermPrediction", createLongerTermPrediction)
  .addEdge(START, "analyzeChart")
  .addEdge("analyzeChart", "createLongerTermPrediction")
  .addEdge("createLongerTermPrediction", END)
  .compile();

function normalizeLegacyAnalysis(
  analysis: z.infer<typeof LegacyBarAnalysisSchema>,
): BarAnalysis {
  return {
    ...analysis,
    longerTermPrediction:
      analysis.longerTermPrediction ?? LEGACY_LONGER_TERM_PREDICTION,
  };
}

function normalizePreviousState(
  previousState: unknown,
): PriceActionAgentMemory {
  const parsedState = priceActionMemoryInputSchema.parse(previousState);

  return {
    previousPrediction: parsedState?.previousPrediction ?? null,
    previousAnalysis: parsedState?.previousAnalysis
      ? normalizeLegacyAnalysis(parsedState.previousAnalysis)
      : null,
    history: (parsedState?.history ?? []).map(normalizeLegacyAnalysis),
  };
}

async function runPriceActionAgentImpl(
  renderRequest: ChartRenderRequest,
  previousState?: unknown,
) {
  const parsedRequest = chartRenderRequestSchema.parse(renderRequest);
  const normalizedPreviousState = normalizePreviousState(previousState);
  const imageDataUrl = await renderChartToDataUrl(parsedRequest);

  const result = await graph.invoke({
    imageDataUrl,
    previousPrediction: normalizedPreviousState.previousPrediction,
    previousAnalysis: normalizedPreviousState.previousAnalysis,
    history: normalizedPreviousState.history,
    currentAnalysis: null,
    result: null,
  });

  return result;
}

type RunPriceActionAgent = (
  renderRequest: ChartRenderRequest,
  previousState?: unknown,
) => Promise<PriceActionAgentState>;

export const runPriceActionAgent: RunPriceActionAgent = traceable(
  runPriceActionAgentImpl,
  {
    name: "runPriceActionAgent",
    run_type: "chain",
    project_name: getLangSmithProjectName(),
    tags: [...BASE_TRACE_TAGS],
  },
) as RunPriceActionAgent;
