import { patternDocumentSchema, type PatternDocument } from "~/schemas/pattern.schema";

const seedPatterns = [
  {
    id: "tight-channel",
    title: "Tight Trend Channel Pullback",
    tags: ["trend", "pullback", "channel", "continuation", "compression"],
    timeframes: ["1m", "5m", "15m", "1h"],
    marketConditions: ["bullish trend", "bearish trend", "orderly pullback", "shallow retracement"],
    setupSummary:
      "A strong trend pauses in a tight channel or drift before attempting continuation in the original direction.",
    confirmationSignals: [
      "Pullback overlaps but does not aggressively reverse the trend leg.",
      "Trend side regains control with a strong close out of the pullback.",
      "Volume or bar spread expands on continuation attempt."
    ],
    failureModes: [
      "Pullback becomes too deep and starts breaking prior structure.",
      "Continuation break fails immediately and returns into the channel.",
      "Market drifts into broad balance instead of re-accelerating."
    ],
    invalidationLogic: [
      "Below the pullback low for long setups.",
      "Above the pullback high for short setups."
    ],
    examples: [
      "Bull trend, shallow three-leg pullback, buyers defend prior breakout area, continuation trigger above pullback trendline."
    ],
    strategyIds: ["trend-pullback-continuation"],
    body:
      "Use this when the market already proved trend control. The pullback should look corrective rather than like a full reversal. The best versions reclaim trend direction quickly after the pause."
  },
  {
    id: "final-flag",
    title: "Final Flag Near Exhaustion",
    tags: ["trend", "flag", "late trend", "exhaustion", "climax"],
    timeframes: ["1m", "5m", "15m"],
    marketConditions: ["climactic trend", "late breakout", "trend exhaustion"],
    setupSummary:
      "A final flag forms late in trend after multiple pushes and often produces poor continuation odds relative to reversal risk.",
    confirmationSignals: [
      "Trend has already extended through several legs.",
      "Breakout is weak or immediately stalls.",
      "Follow-through shrinks relative to earlier legs."
    ],
    failureModes: [
      "Treating it as fresh continuation and buying or selling too late.",
      "Ignoring reduced reward relative to obvious invalidation."
    ],
    invalidationLogic: [
      "If taking continuation anyway, invalidation must be very tight and target expectations reduced.",
      "Often better treated as no-trade under a continuation playbook."
    ],
    examples: [
      "Third or fourth push up into resistance with a small flag but no real expansion on breakout."
    ],
    strategyIds: ["trend-pullback-continuation"],
    body:
      "This is mainly a caution pattern. Under a continuation playbook it should reduce quality unless there is unusual fresh strength."
  },
  {
    id: "triangle",
    title: "Triangle Compression Break",
    tags: ["triangle", "compression", "breakout", "continuation", "balance"],
    timeframes: ["5m", "15m", "1h", "4h"],
    marketConditions: ["compression", "coiling", "reduced volatility", "pre-breakout"],
    setupSummary:
      "The market compresses into a tighter structure and resolves with expansion. In trend context, the break can act as continuation.",
    confirmationSignals: [
      "Range narrows progressively.",
      "Break occurs with stronger bar spread and acceptance outside the triangle.",
      "Break aligns with higher timeframe bias or prior impulse direction."
    ],
    failureModes: [
      "Breakout lacks acceptance and snaps back into the triangle.",
      "Triangle sits in the middle of a larger range with no real edge."
    ],
    invalidationLogic: [
      "Back inside the triangle after breakout acceptance fails.",
      "Opposite side of the triangle for wider invalidation."
    ],
    examples: [
      "Bull trend pauses in a symmetrical triangle under highs, then breaks with expansion above the upper boundary."
    ],
    strategyIds: ["trend-pullback-continuation"],
    body:
      "This pattern can support a continuation plan when compression happens after a directional move rather than inside a random range."
  }
] satisfies PatternDocument[];

export const patternLibrary = seedPatterns.map(pattern => patternDocumentSchema.parse(pattern));
