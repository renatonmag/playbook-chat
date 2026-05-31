import "dotenv/config";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { traceable } from "langsmith/traceable";
import { z } from "zod";

const LEGACY_EXTENDED_PREDICTION =
  "No extended prediction was stored for this earlier response.";

const ImmediateBarAnalysisSchema = z.object({
  mode: z.enum(["initial_analysis", "followup_analysis"]),
  recentMove: z.string(),
  corroborationWithPreviousPrediction: z.string().nullable(),
  alBrooksContext: z.string(),
  prediction: z.string(),
  invalidation: z.string(),
  conciseForecast: z.string(),
});

const ExtendedPredictionSchema = z.object({
  extendedPredictionReview: z.string().trim().min(1).nullable(),
  extendedPrediction: z.string().trim().min(1),
});

const BarAnalysisSchema = ImmediateBarAnalysisSchema.extend({
  extendedPredictionReview: z.string().trim().min(1).nullable(),
  extendedPrediction: z.string().trim().min(1),
});

const LegacyBarAnalysisSchema = ImmediateBarAnalysisSchema.extend({
  extendedPredictionReview: z.string().trim().min(1).nullable().optional(),
  extendedPrediction: z.string().trim().min(1).optional(),
}).passthrough();

const predictionMemorySchema = z
  .object({
    immediatePredictions: z.array(z.string().trim().min(1)).default([]),
    extendedPredictions: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .refine(
    (memory) =>
      memory.immediatePredictions.length === memory.extendedPredictions.length,
    {
      message:
        "immediatePredictions and extendedPredictions must have the same length.",
    },
  );

const legacyPriceActionMemorySchema = z
  .object({
    previousPrediction: z.string().nullable().optional(),
    previousAnalysis: LegacyBarAnalysisSchema.nullable().optional(),
    history: z.array(LegacyBarAnalysisSchema).optional(),
  })
  .strict();

const priceActionMemoryInputSchema = z
  .union([predictionMemorySchema, legacyPriceActionMemorySchema])
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
export type PriceActionAgentMemory = z.infer<typeof predictionMemorySchema>;

const AgentState = Annotation.Root({
  imageDataUrl: Annotation<string>(),
  immediatePredictions: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  extendedPredictions: Annotation<string[]>({
    reducer: (_left, right) => right,
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
const extendedPredictionModel = model.withStructuredOutput(
  ExtendedPredictionSchema,
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
You are analyzing the FIRST chart image.

No prior immediate predictions exist. Set corroborationWithPreviousPrediction to null.

Task:
1. Identify the recent active move.
2. Analyze the most recent bars using Al Brooks Price Action concepts.
3. Make a prediction for the next bars.
4. Be probabilistic, not certain.
`
    : `
You are analyzing a FOLLOW-UP chart image with new bars.

Prior immediate predictions:
${formatPredictionSeries(state.immediatePredictions)}

Latest immediate prediction:
${latestImmediatePrediction}

Task:
1. Analyze what the last 3 bars show.
2. Use the full prior immediate prediction series only as immediate-horizon memory.
3. Notice whether immediate expectations have drifted or repeatedly failed/succeeded.
4. For corroborationWithPreviousPrediction, focus mainly on whether the newest chart evidence corroborates, weakens, contradicts, or leaves unclear the latest immediate prediction.
5. Do not evaluate extended predictions in this node.
6. Update the Al Brooks Price Action context.
7. Make a new immediate prediction for the next bars.
8. Be probabilistic, not certain.
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

function getLegacyStringField(
  value: z.infer<typeof LegacyBarAnalysisSchema>,
  parts: string[],
) {
  const field = (value as Record<string, unknown>)[parts.join("")];

  return typeof field === "string" && field.trim().length > 0 ? field : null;
}

async function createExtendedPrediction(state: typeof AgentState.State) {
  if (!state.currentAnalysis) {
    throw new Error(
      "Cannot create extended prediction without current analysis.",
    );
  }

  const latestExtendedPrediction = getLatestPrediction(
    state.extendedPredictions,
  );
  const memoryTask = latestExtendedPrediction
    ? `
Prior extended predictions:
${formatPredictionSeries(state.extendedPredictions)}

Latest extended prediction:
${latestExtendedPrediction}

Task:
1. Use only the prior extended prediction series as extended-horizon memory.
2. Notice whether the extended-horizon thesis has drifted, improved, weakened, or repeatedly failed.
3. For extendedPredictionReview, focus mainly on whether the newest chart evidence supports, weakens, contradicts, or leaves unclear the latest extended prediction.
4. Do not evaluate immediate predictions in this node.
5. Create a new extended/couple-moves prediction.
6. Keep the new extended prediction to 2 phrases.
`
    : `
No prior extended predictions exist. Set extendedPredictionReview to null.

Task:
1. Create a new extended/couple-moves prediction.
2. Use the last active move and current chart evidence.
3. Keep the new extended prediction to 2 phrases.
`;

  const response = await extendedPredictionModel.invoke([
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
          text: memoryTask,
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
    extendedPredictionReview: response.extendedPredictionReview,
    extendedPrediction: response.extendedPrediction,
  };

  return {
    result: finalAnalysis,
    immediatePredictions: [
      ...state.immediatePredictions,
      finalAnalysis.prediction,
    ],
    extendedPredictions: [
      ...state.extendedPredictions,
      finalAnalysis.extendedPrediction,
    ],
  };
}

const graph = new StateGraph(AgentState)
  .addNode("analyzeChart", analyzeChart)
  .addNode("createExtendedPrediction", createExtendedPrediction)
  .addEdge(START, "analyzeChart")
  .addEdge("analyzeChart", "createExtendedPrediction")
  .addEdge("createExtendedPrediction", END)
  .compile();

function normalizeLegacyAnalysis(
  analysis: z.infer<typeof LegacyBarAnalysisSchema>,
): BarAnalysis {
  const legacyReview = getLegacyStringField(analysis, [
    "long",
    "Prediction",
    "Review",
  ]);
  const legacyPrediction = getLegacyStringField(analysis, [
    "longer",
    "Term",
    "Prediction",
  ]);

  return {
    ...analysis,
    extendedPredictionReview: analysis.extendedPredictionReview ?? legacyReview,
    extendedPrediction:
      analysis.extendedPrediction ?? legacyPrediction ?? LEGACY_EXTENDED_PREDICTION,
  };
}

function normalizePreviousState(
  previousState: unknown,
): PriceActionAgentMemory {
  const parsedState = priceActionMemoryInputSchema.parse(previousState);

  if (!parsedState) {
    return {
      immediatePredictions: [],
      extendedPredictions: [],
    };
  }

  if (
    "immediatePredictions" in parsedState ||
    "extendedPredictions" in parsedState
  ) {
    return predictionMemorySchema.parse(parsedState);
  }

  if (parsedState.history?.length) {
    const history = parsedState.history.map(normalizeLegacyAnalysis);

    return {
      immediatePredictions: history.map((analysis) => analysis.prediction),
      extendedPredictions: history.map(
        (analysis) => analysis.extendedPrediction,
      ),
    };
  }

  if (parsedState.previousAnalysis) {
    const previousAnalysis = normalizeLegacyAnalysis(
      parsedState.previousAnalysis,
    );

    return {
      immediatePredictions: [previousAnalysis.prediction],
      extendedPredictions: [previousAnalysis.extendedPrediction],
    };
  }

  if (parsedState.previousPrediction) {
    return {
      immediatePredictions: [parsedState.previousPrediction],
      extendedPredictions: [LEGACY_EXTENDED_PREDICTION],
    };
  }

  return {
    immediatePredictions: [],
    extendedPredictions: [],
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
    extendedPredictions: normalizedPreviousState.extendedPredictions,
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
