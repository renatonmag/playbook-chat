# AGENTS.md

<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `pnpm dlx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Project Overview

This project is a trading AI assistant focused on turning discretionary market observations into structured trade decisions.

The system currently has two agents:

1. Technical Analyst
2. Planner

The Technical Analyst reads the user's market description, extracts the important technical context, and interprets it through the user's stated strategy.

The Planner takes that structured context plus retrieved trading-pattern knowledge and produces a clear trade plan, including the possibility of no trade.

The current application code lives in `playbook-chat/`.

---

## Tech Stack

- TypeScript
- SolidStart v2
- Drizzle ORM
- tRPC
- solid-ui
- Tailwind CSS
- LangChain for TypeScript

---

## Agent Responsibilities

### Technical Analyst

Responsibilities:

- Parse the user's prompt as a live market description.
- Extract the relevant chart structure, price behavior, and market state.
- Identify only the technically important points for the user's strategy.
- Separate observation from interpretation.
- Return structured JSON for downstream planning.

The Technical Analyst must always:

- Anchor its reasoning to the user's strategy rules.
- Distinguish confirmed structure from weak or ambiguous signals.
- Prefer precise market context over broad commentary.
- Avoid inventing price levels, indicators, or patterns not supported by the prompt.

### Planner

Responsibilities:

- Use the Technical Analyst output as the primary market-state input.
- Use retrieved pattern knowledge to evaluate possible setups.
- Produce a trade plan with summary, relevant market points (points that the plan is based on), what to expect, and invalidation logic.
- Reject low-quality setups when conditions are unclear or misaligned.

The Planner must always:

- Treat "no trade" as a valid and often correct outcome.
- Express setups in probabilistic terms.
- Explain risk conditions and failure modes.
- Respect the user's strategy constraints before proposing a trade.

---

## Architecture Rules

- Keep agent logic modular.
- Keep Technical Analyst and Planner prompts separate.
- Never mix retrieval logic with UI code.
- Store pattern knowledge separately from prompts and business logic.
- Use JSON outputs between agents.
- Keep domain schemas explicit and versioned when possible.
- Prefer small composable modules over large agent orchestration files.

---

## Coding Standards

- Use TypeScript strict mode.
- Avoid classes unless necessary.
- Prefer pure functions.
- Keep files under 300 lines when possible.
- Validate agent I/O with schemas.
- Keep prompt templates, output schemas, and retrieval utilities in separate modules.

---

## Retrieval Rules

Pattern retrieval pipeline:

1. Keyword search
2. Tag filtering
3. Reranking

Rules:

- Do not directly dump all pattern files into prompts.
- Retrieve only the most relevant pattern context for the current setup.
- Prefer concise, high-signal pattern summaries over large raw documents.
- Keep retrieval deterministic where possible so agent behavior is easier to debug.

---

## Output Rules

### Technical Analyst Output

The Technical Analyst must output JSON containing:

- `marketContext`
- `candidatePatterns`
- `trendState`
- `volatility`
- `supportResistance`
- `likelyControlSide`
- `strategyAlignment`
- `keySignals`
- `ambiguities`

### Planner Output

The Planner must output JSON containing:

- `bias`
- `setupQuality`
- `entry`
- `stop`
- `target`
- `invalidation`
- `riskNotes`
- `confidence`
- `reasoningSummary`
- `noTradeRationale`

If there is no valid trade, the Planner should still return the full output shape and clearly populate `noTradeRationale`.

---

## Important Domain Rules

- Avoid overconfident language.
- "No trade" is a valid output.
- Distinguish trend from trading range carefully.
- Prefer probabilistic reasoning.
- Separate pattern recognition from trade recommendation.
- Do not confuse local pullbacks with full trend reversals without evidence.
- When the prompt is incomplete or contradictory, reduce confidence and say so explicitly.

---

## Data Flow

1. User submits a market description and strategy context.
2. Technical Analyst converts the description into structured market context.
3. Retrieval pipeline fetches relevant pattern knowledge.
4. Planner evaluates the setup against context, retrieved knowledge, and strategy rules.
5. System returns a trade plan or a no-trade decision.

---

## Implementation Notes

- Define shared TypeScript types for inter-agent JSON contracts.
- Keep prompt text versioned and easy to test.
- Design retrieval so pattern documents can evolve without changing agent code.
- Log intermediate agent outputs for debugging and evaluation.
- Make it easy to replay a user prompt through both agents during development.

## Initial project structure

```
src/
├── app.tsx
├── routes/
│   ├── index.tsx
│   ├── analyze.tsx
│   └── api/
│       └── trpc/[...trpc].ts
│
├── components/
│   ├── market-input/
│   ├── trade-plan/
│   └── layout/
│
├── lib/
│   ├── trpc/
│   │   ├── client.ts
│   │   └── provider.tsx
│   └── utils.ts
│
├── server/
│   ├── trpc.ts
│   ├── context.ts
│   └── routers/
│       ├── _app.ts
│       ├── agent.router.ts
│       ├── pattern.router.ts
│       └── strategy.router.ts
│
├── domain/
│   ├── agent/
│   │   ├── technical-analyst.ts
│   │   ├── planner.ts
│   │   ├── run-agent.ts
│   │   └── types.ts
│   │
│   ├── patterns/
│   │   ├── retrieve-patterns.ts
│   │   ├── rank-patterns.ts
│   │   └── types.ts
│   │
│   └── trade/
│       ├── build-trade-plan.ts
│       └── types.ts
│
├── db/
│   ├── client.ts
│   ├── schema.ts
│   └── queries/
│       ├── patterns.ts
│       ├── strategies.ts
│       └── trade-plans.ts
│
├── prompts/
│   ├── technical-analyst.md
│   ├── planner.md
│   └── system.md
│
├── schemas/
│   ├── market-state.schema.ts
│   ├── trade-plan.schema.ts
│   └── pattern.schema.ts
│
└── data/
    └── seed-patterns/
        ├── tight-channel.md
        ├── triangle.md
        └── final-flag.md
```
