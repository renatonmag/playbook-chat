# React Agent Market Read Clarity

This note captures the current session context for improving the visual price-action agent in `src/agent/react-agent.ts`. It is a working context note, not the domain glossary.

## User Problem

The agent gives market readings, but the output is not improving enough. The main complaint is that it remains ambiguous, with language like "it might do this, but also do that", instead of producing a useful directional read with clear evidence, invalidation, and next confirmation.

## Current Code Observations

- `src/agent/react-agent.ts` is a single-node LangGraph workflow named `analyzeChart`.
- The node sends one chart image and optional prior immediate predictions to one structured-output model call.
- The structured output is limited to:
  - `mode`
  - `corroborationWithPreviousPrediction`
  - `alBrooksContext`
  - `prediction`
  - `invalidation`
- Prior memory stores only previous prediction strings through `immediatePredictions`.
- The prompt asks the model to be probabilistic and to make a prediction, but it does not force a ranked primary scenario, evidence gates, or a decision between tradeable and no-trade conditions.
- The existing root `CONTEXT.md` describes a richer visual-analysis domain model: Chart Narrative, Chart Overview, Bar-by-Bar Review, Specialist Reviews, Market Read, and Market Hypothesis.
- The current `react-agent.ts` implementation does not yet match that richer pipeline.

## Initial Diagnosis

The ambiguity is probably not just a wording problem. The current schema gives the model room to hedge because it asks for a broad prediction in one pass, but does not require:

- an explicit dominant hypothesis;
- a ranked alternate scenario;
- what evidence chooses between the scenarios;
- whether the setup is currently actionable or should be treated as wait/no-trade;
- a confidence classification tied to visible evidence;
- a review of the latest 5-10 bars separate from the final conclusion;
- a synthesis step that resolves conflicting observations.

## Candidate Direction

Improve the agent by separating observation from interpretation and forcing synthesis:

1. Produce a Chart Narrative from the image.
2. Convert that into a Chart Overview with observable facts and uncertainty.
3. Run a Bar-by-Bar Review on the most recent bars.
4. Run core Specialist Reviews for range, channel, and breakout/reversal behavior.
5. Synthesize a Market Read with one primary Market Hypothesis, one alternate path, explicit invalidation, and confirmation triggers.
6. Generate the user-facing answer from that Market Read, not directly from raw model impressions.

The key design question is whether the final output should force a single primary hypothesis even when evidence is weak, or explicitly classify the situation as wait/no-trade when the evidence does not support a directional edge.

## Open Grill Question

Should the Market Hypothesis always choose a primary side (`buy` or `sell`) when probabilities are close, or should `wait/no-trade` be a first-class hypothesis whenever the chart lacks a clear edge?

Recommended answer: make `wait/no-trade` first-class. The agent can still state the most likely next pressure, but it should not manufacture a trade direction when the evidence is insufficient.

Resolved: `wait/no-trade` should be a first-class Market Hypothesis when the chart lacks a clear edge.
