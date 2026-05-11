import { analysisRequestSchema, type AnalysisRequest } from "~/schemas/analysis-request.schema";
import { analysisRunSchema, type AnalysisRun } from "~/schemas/analysis-run.schema";
import { getStrategyById } from "./strategies";
import { runTechnicalAnalyst } from "./technical-analyst";
import { retrievePatterns } from "~/domain/patterns/retrieve-patterns";
import { runPlanner } from "./planner";
import { saveAnalysisRun } from "~/server/analysis-run-store";

const promptVersions = {
  system: "system.v1",
  technicalAnalyst: "technical-analyst.v1",
  planner: "planner.v1"
} as const;

const modelIds = {
  technicalAnalyst: "deterministic-rules.v1",
  planner: "deterministic-rules.v1"
} as const;

function createRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function runAgentPipeline(rawRequest: AnalysisRequest): AnalysisRun {
  const request = analysisRequestSchema.parse(rawRequest);
  const strategy = getStrategyById(request.strategyId);

  if (!strategy) {
    throw new Error(`Unknown strategy: ${request.strategyId}`);
  }

  const analystOutput = runTechnicalAnalyst({ request, strategy });
  const retrievedPatterns = retrievePatterns({
    analysis: analystOutput,
    strategyId: strategy.id,
    timeframe: request.timeframe
  });
  const plannerOutput = runPlanner({
    request,
    strategy,
    analysis: analystOutput,
    patterns: retrievedPatterns
  });

  return saveAnalysisRun(
    analysisRunSchema.parse({
      id: createRunId(),
      createdAt: new Date().toISOString(),
      request,
      strategy,
      analystOutput,
      retrievedPatterns,
      plannerOutput,
      promptVersions,
      modelIds,
      validationIssues: []
    })
  );
}
