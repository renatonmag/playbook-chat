import {
  analysisRunSchema,
  analysisRunSummarySchema,
  type AnalysisRun,
  type AnalysisRunSummary
} from "~/schemas/analysis-run.schema";

const runs: AnalysisRun[] = [];

function toSummary(run: AnalysisRun): AnalysisRunSummary {
  return analysisRunSummarySchema.parse({
    id: run.id,
    createdAt: run.createdAt,
    instrument: run.request.instrument,
    timeframe: run.request.timeframe,
    strategyName: run.strategy.name,
    bias: run.plannerOutput.bias.direction,
    confidence: run.plannerOutput.confidence,
    setupQuality: run.plannerOutput.setupQuality.grade,
    noTrade: run.plannerOutput.noTradeRationale !== null
  });
}

export function saveAnalysisRun(run: AnalysisRun) {
  const parsed = analysisRunSchema.parse(run);
  runs.unshift(parsed);
  return parsed;
}

export function getAnalysisRun(runId: string) {
  const run = runs.find(entry => entry.id === runId) ?? null;
  return run ? analysisRunSchema.parse(run) : null;
}

export function listRecentAnalysisRuns(limit = 10) {
  return runs.slice(0, limit).map(toSummary);
}
