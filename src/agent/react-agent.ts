import "dotenv/config";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { traceable } from "langsmith/traceable";
import { z } from "zod";

const ImmediateBarAnalysisSchema = z.object({
  mode: z.enum(["initial_analysis", "followup_analysis"]),
  corroborationWithPreviousPrediction: z.string().nullable(),
  alBrooksContext: z.string(),
  prediction: z.string(),
  invalidation: z.string(),
});

const LegacyBarAnalysisSchema = ImmediateBarAnalysisSchema.extend({
  extendedPredictionReview: z.string().trim().min(1).nullable().optional(),
  extendedPrediction: z.string().trim().min(1).optional(),
}).passthrough();

export const predictionMemorySchema = z
  .object({
    immediatePredictions: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

const legacyPredictionMemorySchema = z
  .object({
    immediatePredictions: z.array(z.string().trim().min(1)).default([]),
    extendedPredictions: z.array(z.string().trim().min(1)).optional(),
  })
  .passthrough();

const legacyPriceActionMemorySchema = z
  .object({
    previousPrediction: z.string().nullable().optional(),
    previousAnalysis: LegacyBarAnalysisSchema.nullable().optional(),
    history: z.array(LegacyBarAnalysisSchema).optional(),
  })
  .strict();

export const priceActionMemoryInputSchema = z
  .union([
    predictionMemorySchema,
    legacyPriceActionMemorySchema,
    legacyPredictionMemorySchema,
  ])
  .optional();

export const barAnalysisSchema = ImmediateBarAnalysisSchema;

export const chartRenderRequestSchema = z.object({
  lastCandleTime: z.string().trim().min(1),
  candleCount: z.number().int().positive(),
  symbol: z.string().trim().default("WIN@N"),
  timeframe: z.string().trim().default("M5"),
});

export type BarAnalysis = z.infer<typeof ImmediateBarAnalysisSchema>;
export type ChartRenderRequest = z.infer<typeof chartRenderRequestSchema>;
export type PriceActionAgentMemory = z.infer<typeof predictionMemorySchema>;

const AgentState = Annotation.Root({
  imageDataUrl: Annotation<string>(),
  immediatePredictions: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  currentAnalysis: Annotation<BarAnalysis | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  result: Annotation<BarAnalysis | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

export type PriceActionAgentState = typeof AgentState.State;

const model = new ChatOpenAI({
  model: "gpt-5.4",
  temperature: 0,
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
  const latestImmediatePrediction = getLatestPrediction(
    state.immediatePredictions,
  );
  const isFirstImage = !latestImmediatePrediction;

  const task = isFirstImage
    ? `
You are a professional techinical analyst, specialist in price action.
You are analyzing the FIRST chart image.

No prior immediate predictions exist. Set corroborationWithPreviousPrediction to null.

Task:
1. Identify the recent active move.
2. Analyze the most recent bars using Al Brooks Price Action concepts.
3. Make a prediction for the next bars.
4. Be probabilistic, not certain.
`
    : `
You are a professional techinical analyst, specialist in price action.
You are analyzing a FOLLOW-UP chart image with new bars.

Prior immediate predictions:
${formatPredictionSeries(state.immediatePredictions)}

Latest immediate prediction:
${latestImmediatePrediction}

Task:
1. Analyze what the new bars show.
2. Use the full prior immediate prediction series only as immediate-horizon memory.
3. Notice whether immediate expectations have drifted or repeatedly failed/succeeded.
4. For corroborationWithPreviousPrediction, focus mainly on whether the newest chart evidence corroborates, weakens, contradicts, or leaves unclear the latest immediate prediction, but make sure to detect if theres a bulish or bearish trend in corroborations.
5. Update the Al Brooks Price Action context.
6. Make a new immediate prediction for the next bars.
`;

  const response = await immediateAnalysisModel.invoke([
    {
      role: "system",
      content: `
You are an Al Brooks Price Action trading analyst.

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
    result: response,
    immediatePredictions: [...state.immediatePredictions, response.prediction],
  };
}

function formatPredictionSeries(predictions: string[]) {
  if (predictions.length === 0) {
    return "None.";
  }

  return predictions
    .map((prediction, index) => `${index + 1}. ${prediction}`)
    .join("\n");
}

function getLatestPrediction(predictions: string[]) {
  return predictions.at(-1) ?? null;
}

const graph = new StateGraph(AgentState)
  .addNode("analyzeChart", analyzeChart)
  .addEdge(START, "analyzeChart")
  .addEdge("analyzeChart", END)
  .compile();

function normalizeLegacyAnalysis(
  analysis: z.infer<typeof LegacyBarAnalysisSchema>,
): BarAnalysis {
  return barAnalysisSchema.parse(analysis);
}

function normalizePreviousState(
  previousState: unknown,
): PriceActionAgentMemory {
  const parsedState = priceActionMemoryInputSchema.parse(previousState);

  if (!parsedState) {
    return {
      immediatePredictions: [],
    };
  }

  if ("immediatePredictions" in parsedState) {
    return {
      immediatePredictions: parsedState.immediatePredictions,
    };
  }

  if (parsedState.history?.length) {
    const history = parsedState.history.map(normalizeLegacyAnalysis);

    return {
      immediatePredictions: history.map((analysis) => analysis.prediction),
    };
  }

  if (parsedState.previousAnalysis) {
    const previousAnalysis = normalizeLegacyAnalysis(
      parsedState.previousAnalysis,
    );

    return {
      immediatePredictions: [previousAnalysis.prediction],
    };
  }

  if (parsedState.previousPrediction) {
    return {
      immediatePredictions: [parsedState.previousPrediction],
    };
  }

  return {
    immediatePredictions: [],
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
    immediatePredictions: normalizedPreviousState.immediatePredictions,
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
