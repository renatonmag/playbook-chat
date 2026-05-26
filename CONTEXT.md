# Playbook Chat Context

Playbook Chat turns a trader's market observation and chart context into a grounded price-action read. This glossary defines the domain language used when discussing the trading assistant.

## Language

**Chart Image**:
An explicit market chart image provided by the user for the assistant to analyze. It is the primary visual evidence for image-based analysis.
_Avoid_: Market graph image, screenshot, current chart capture

**Progressive Chart Image**:
A Chart Image in a Visual Analysis Thread that keeps the same visible origin while adding new right-edge bars over time. Earlier visible patterns and moves are expected to remain historically stable, while their current implication may change as new bars are added.
_Avoid_: New chart, unrelated screenshot, replaced image

**Chart Overview**:
A structured read of the observable facts and uncertainties derived from the Chart Image and Chart Narrative before specialist interpretation. It records what appears visible without becoming the final trading conclusion.
_Avoid_: Overview, image summary, initial analysis

**Market Development History**:
A concise cumulative record of the latest meaningful moves observed across Chart Images in a Visual Analysis Thread. It preserves how the visible market situation has evolved without freezing the current trading hypothesis.
_Avoid_: Overview history, image log, old state

**Visible Context**:
Market context that is visible or clearly inferable from the Chart Image, such as a drawn moving average, repeated support or resistance behavior, or labeled chart features. Exact levels are used only when shown in the image.
_Avoid_: Assumed context, inferred indicator, hidden level

**Gap**:
Open price space between three consecutive bars, measured between the first and third bar. It is a visible price-action relationship, not a generic session gap unless the Chart Image shows that specifically.
_Avoid_: Session gap, empty space, price gap

**Chart Narrative**:
A concise chronological paragraph reading of the Chart Image that preserves the market's visible development before it is converted into a Chart Overview. It may use price-action labels probabilistically, but it is prose only and not a structured extraction payload or final trading conclusion.
_Avoid_: Narrative summary, first pass, visual story, candidate pattern list

**Specialist Review**:
A focused image review from one market-structure perspective using the Chart Image, Chart Narrative, and Chart Overview. It uses a specialized prompt to improve accuracy for that structure and may confirm, challenge, or refine earlier reads, but it does not directly become the final trading read.
_Avoid_: Sub-agent answer, specialist state, review note

**Core Specialist Review**:
A Specialist Review that runs for every Chart Image because its perspective is fundamental to avoiding common market-structure mistakes. The core set is trading range, channel, and breakout/reversal.
_Avoid_: Mandatory sub-agent, default expert

**Breakout/Reversal Specialist Review**:
A Core Specialist Review that assesses breakout strength, follow-through, gap behavior, failure risk, and whether visible evidence supports continuation, failed breakout, reversal, or no meaningful breakout condition. It also watches for the transition from breakout behavior into channel behavior, but synthesis decides the final Market Hypothesis.
_Avoid_: Breakout agent, reversal state, breakout call

**Bar-by-Bar Review**:
A baseline review of the most recent 5-10 visible bars that runs after every Chart Overview. It interprets those bars in their visible context, such as pattern behavior, moving-average interaction, support or resistance tests, and what the sequence implies for likely next moves.
_Avoid_: Conditional bar report, candle summary, recent moves note

**Market Read**:
The final structured interpretation of the current chart situation after synthesis resolves the Chart Overview, Bar-by-Bar Review, and Specialist Reviews. It includes the latest analysis artifacts for auditability, is durable context for future turns, and is distinct from the user-facing markdown response.
_Avoid_: Final state, final overview, answer data

**Market Hypothesis**:
The current buy, sell, or wait interpretation inside the Market Read. It is updated when new Chart Images change the evidence, and the newest visible evidence takes priority over prior hypotheses.
_Avoid_: Latest bias, buy/sell state, final call

**Conversation History**:
The ordered user and assistant messages that provide context for a visual analysis thread. It is persisted alongside the Market Read, but it is not part of the Market Read itself.
_Avoid_: State transcript, embedded chat state, message dump

**Visual Analysis Thread**:
A persisted conversation centered on chart-image analysis. It owns the Conversation History and the latest Market Read for an evolving analysis session.
_Avoid_: Analysis run, ReAct chat, visual state row

**Suggested Specialist**:
A specialist perspective recommended from the Chart Overview when the chart shows a specific ambiguity or structure worth deeper review. A Suggested Specialist is not part of the fixed core and is not run unless the user asks for that follow-up.
_Avoid_: Optional agent, extra reviewer

## Example Dialogue

Developer: "Does the assistant need to capture the chart itself?"

Domain Expert: "No. The user provides a Chart Image, and the assistant analyzes that exact visual evidence."

Developer: "Does a new image replace the old chart context?"

Domain Expert: "No. In a Visual Analysis Thread, images are Progressive Chart Images: the origin stays fixed and new bars extend the right edge."

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

Developer: "What does the breakout/reversal specialist decide?"

Domain Expert: "It does not decide the final trade. It reviews breakout quality, follow-through, and failure risk so synthesis can judge continuation versus failed breakout or reversal."

Developer: "Can it say the breakout became a channel?"

Domain Expert: "Yes. It can identify visible transition from breakout behavior into channel behavior, while the channel specialist still reviews channel quality in detail."

Developer: "Do all specialists run every time?"

Domain Expert: "No. Core Specialist Reviews run every time; Suggested Specialists are proposed when the Chart Overview shows a reason for them."

Developer: "Is bar-by-bar analysis optional?"

Domain Expert: "No. Bar-by-Bar Review runs with every Chart Overview because it explains the most recent moves and likely next moves."

Developer: "Is the final answer just markdown?"

Domain Expert: "No. Synthesis produces a Market Read for future context and a separate markdown response for the user."

Developer: "Should the Market Read contain the full chat?"

Domain Expert: "No. Conversation History is persisted alongside the Market Read, but it is not embedded inside it."

Developer: "Is each chart analysis a separate saved run?"

Domain Expert: "No. A Visual Analysis Thread preserves the conversation and latest Market Read as the analysis evolves."

Developer: "What happens when a new chart image arrives?"

Domain Expert: "The Market Development History records the latest meaningful moves, while the Market Hypothesis is updated from the newest evidence."
