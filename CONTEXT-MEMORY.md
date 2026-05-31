# Playbook Chat Memory Context

Playbook Chat memory preserves compact prediction context across progressive chart analyses so later reads can compare new evidence against earlier expectations.

## Language

**Prediction Memory**:
An ordered record of prior Short Predictions and Long Predictions in a Visual Analysis Thread. It is compact context for later introspection, not a full stored analysis.
_Avoid_: Full analysis history, reasoning archive, previous state dump

**Short Prediction Series**:
The consecutive sequence of Short Predictions produced across completed chart analyses in a Visual Analysis Thread.
_Avoid_: Short prediction pairs, latest prediction only, concise forecast list

**Long Prediction Series**:
The consecutive sequence of Long Predictions produced across completed chart analyses in a Visual Analysis Thread.
_Avoid_: Long prediction pairs, longer-term analysis history, thesis archive

**Prediction Index**:
The chronological position shared by the Short Prediction Series and Long Prediction Series. Entries at the same Prediction Index come from the same completed chart analysis even though the series are stored separately.
_Avoid_: Prediction pair object, unrelated array position, memory id

**Short Prediction**:
The compact immediate forecast for the next bars from a completed chart analysis.
_Avoid_: Full prediction analysis, concise forecast, reasoning text

**Long Prediction**:
The compact longer/couple-moves forecast from a completed chart analysis.
_Avoid_: Longer-term analysis, full thesis, swing plan

**Prediction Drift**:
The way the Short Prediction Series and Long Prediction Series change across a Visual Analysis Thread as new chart evidence appears. Prediction Drift is used to introspect how expectations evolved, while direct corroboration or contradiction is judged mainly against the most recent predictions.
_Avoid_: Equal-weight history check, old forecast validation, memory score

**Latest Prediction Check**:
The direct comparison between the newest chart evidence and the latest Short Prediction and Long Prediction. It is the primary source for deciding whether the current chart corroborates, contradicts, or weakens the prior expectation.
_Avoid_: Full memory audit, every prediction check, historical scoring

**Short Prediction Check**:
The immediate-analysis comparison between the newest chart evidence and the Short Prediction Series. It belongs to the short prediction node and does not use the Long Prediction Series.
_Avoid_: Combined prediction check, long-term corroboration, full memory audit

**Long Prediction Check**:
The longer-horizon comparison between the newest chart evidence and the Long Prediction Series. It belongs to the long prediction node and does not use the Short Prediction Series.
_Avoid_: Immediate prediction check, short-term corroboration, mixed horizon review

**Prediction Series Drift Context**:
The use of a full same-horizon prediction series to understand how expectations have evolved over time. The direct support, weakness, or contradiction verdict remains focused on the latest prediction in that same series.
_Avoid_: Latest-only context, equal-weight audit, mixed-horizon context

**Long Prediction Review**:
The explicit output from the long prediction node that states whether the Long Prediction Series remains supported, weakened, contradicted, or unclear based on the newest chart evidence.
_Avoid_: Hidden long-term check, immediate corroboration, new prediction only

**Empty Prediction Check**:
The absence of a same-horizon prior prediction to compare against. It is represented as no review value rather than a prose placeholder.
_Avoid_: No prior prediction sentence, synthetic review, default corroboration

**Prediction Memory Append**:
The act of adding the current Short Prediction and current Long Prediction to their respective series after both prediction nodes have reviewed only prior same-horizon memory. This preserves Prediction Index alignment across completed analyses.
_Avoid_: Early append, self-review, node-local memory update

**Session Prediction Memory**:
Prediction Memory that keeps every Short Prediction and Long Prediction produced during the current Visual Analysis Thread. It is not a rolling window; entries are retained for the full progressive chart sequence.
_Avoid_: Recent predictions, memory window, truncated forecast list

**Transient Prediction Memory**:
Session Prediction Memory held by the active `/react` page flow and passed into each chart analysis request. It is not recovered after page reload or reset.
_Avoid_: Persisted memory, database memory, saved thread state

**Agent Prediction Memory**:
The prediction memory carried inside the price-action agent state as two aligned arrays: the Short Prediction Series and the Long Prediction Series. It excludes full bar analyses, invalidation notes, corroboration text, and UI-only history.
_Avoid_: Full agent history, previous analysis state, single previous prediction
