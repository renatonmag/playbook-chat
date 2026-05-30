import "dotenv/config";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const BarAnalysisSchema = z.object({
  mode: z.enum(["initial_analysis", "followup_analysis"]),
  recentMove: z.string(),
  corroborationWithPreviousPrediction: z.string().nullable(),
  alBrooksContext: z.string(),
  prediction: z.string(),
  invalidation: z.string(),
  conciseForecast: z.string(),
});

export const barAnalysisSchema = BarAnalysisSchema;

export const chartRenderRequestSchema = z.object({
  lastCandleTime: z.string().trim().min(1),
  candleCount: z.number().int().positive(),
  symbol: z.string().trim().default("WIN@N"),
  timeframe: z.string().trim().default("M5"),
});

export type BarAnalysis = z.infer<typeof BarAnalysisSchema>;
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
}).withStructuredOutput(BarAnalysisSchema);

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

  const response = await model.invoke([
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
    result: response,
    previousPrediction: response.prediction,
    previousAnalysis: response,
    history: [response],
  };
}

const graph = new StateGraph(AgentState)
  .addNode("analyzeChart", analyzeChart)
  .addEdge(START, "analyzeChart")
  .addEdge("analyzeChart", END)
  .compile();

export async function runPriceActionAgent(
  renderRequest: ChartRenderRequest,
  previousState?: Partial<PriceActionAgentMemory>,
) {
  const parsedRequest = chartRenderRequestSchema.parse(renderRequest);
  const imageDataUrl = await renderChartToDataUrl(parsedRequest);

  const result = await graph.invoke({
    imageDataUrl,
    previousPrediction: previousState?.previousPrediction ?? null,
    previousAnalysis: previousState?.previousAnalysis ?? null,
    history: previousState?.history ?? [],
    result: null,
  });

  return result;
}
