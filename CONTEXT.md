# Playbook Chat Context

Playbook Chat turns a trader's market observation and chart context into a grounded price-action read. This glossary defines the domain language used when discussing the trading assistant.

## Language

**Chart Image**:
An explicit market chart image provided by the user for the assistant to analyze. It is the primary visual evidence for image-based analysis.
_Avoid_: Market graph image, screenshot, current chart capture

**Chart Overview**:
A structured read of the observable facts and uncertainties derived from the Chart Image and Chart Narrative before specialist interpretation. It records what appears visible without becoming the final trading conclusion.
_Avoid_: Overview, image summary, initial analysis

**Visible Context**:
Market context that is visible or clearly inferable from the Chart Image, such as a drawn moving average, repeated support or resistance behavior, or labeled chart features. Exact levels are used only when shown in the image.
_Avoid_: Assumed context, inferred indicator, hidden level

**Chart Narrative**:
A concise chronological paragraph reading of the Chart Image that preserves the market's visible development before it is converted into a Chart Overview. It may use price-action labels probabilistically, but it is prose only and not a structured extraction payload or final trading conclusion.
_Avoid_: Narrative summary, first pass, visual story, candidate pattern list

**Specialist Review**:
A focused critique from one market-structure perspective using the Chart Image, Chart Narrative, and Chart Overview. It may confirm, challenge, or refine earlier reads, but it does not directly become the final trading read.
_Avoid_: Sub-agent answer, specialist state, review note

**Core Specialist Review**:
A Specialist Review that runs for every Chart Image because its perspective is fundamental to avoiding common market-structure mistakes. The core set is trading range, channel, and breakout/reversal.
_Avoid_: Mandatory sub-agent, default expert

**Bar-by-Bar Review**:
A baseline review of the most recent 5-10 visible bars that runs after every Chart Overview. It interprets those bars in their visible context, such as pattern behavior, moving-average interaction, support or resistance tests, and what the sequence implies for likely next moves.
_Avoid_: Conditional bar report, candle summary, recent moves note

**Market Read**:
The final structured interpretation of the current chart situation after synthesis resolves the Chart Overview, Bar-by-Bar Review, and Specialist Reviews. It is durable context for future turns and is distinct from the user-facing markdown response.
_Avoid_: Final state, final overview, answer data

**Suggested Specialist**:
A specialist perspective recommended from the Chart Overview when the chart shows a specific ambiguity or structure worth deeper review. A Suggested Specialist is not part of the fixed core and is not run unless the user asks for that follow-up.
_Avoid_: Optional agent, extra reviewer

## Example Dialogue

Developer: "Does the assistant need to capture the chart itself?"

Domain Expert: "No. The user provides a Chart Image, and the assistant analyzes that exact visual evidence."

Developer: "Can the first image pass say the best trade?"

Domain Expert: "No. The first image pass produces a Chart Narrative; the Chart Overview, reviews, and synthesis produce the trading read."

Developer: "Can the assistant mention the moving average?"

Domain Expert: "Only when it is part of the Visible Context. If it is not visible, the assistant should not assume it."

Developer: "Should the assistant structure the chart immediately?"

Domain Expert: "No. It first writes a Chart Narrative to preserve the sequence of the session, then turns that narrative into a Chart Overview."

Developer: "Does a Specialist Review read only the Chart Narrative?"

Domain Expert: "No. It reads the Chart Image, Chart Narrative, and Chart Overview, so it can challenge earlier reads when the image supports a better interpretation."

Developer: "Can the range specialist rewrite the final state?"

Domain Expert: "No. It writes a Specialist Review; synthesis decides how much of that review belongs in the final read."

Developer: "Do all specialists run every time?"

Domain Expert: "No. Core Specialist Reviews run every time; Suggested Specialists are proposed when the Chart Overview shows a reason for them."

Developer: "Is bar-by-bar analysis optional?"

Domain Expert: "No. Bar-by-Bar Review runs with every Chart Overview because it explains the most recent moves and likely next moves."

Developer: "Is the final answer just markdown?"

Domain Expert: "No. Synthesis produces a Market Read for future context and a separate markdown response for the user."
