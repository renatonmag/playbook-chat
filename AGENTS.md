# AGENTS.md

## Project Overview

Playbook Chat is a trading chat assistant that turns user market observations and conversation history into a structured market-state read and a practical markdown response.

The current implementation uses one LangGraph-based trading agent, not separate Technical Analyst and Planner agents. The agent detects relevant price-action patterns, retrieves concise local pattern context, builds a structured market state, and produces either a fixed report-style markdown response or a freeform trading answer.

The main application code lives in this repository under `src/`.

---

## Tech Stack

- TypeScript
- SolidStart v2 alpha
- SolidJS
- Tailwind CSS v4 through `@tailwindcss/vite`
- tRPC v11
- TanStack Solid Query
- Drizzle ORM
- SQLite/libSQL
- LangChain for TypeScript
- LangGraph
- LangSmith
- Zod
- marked
- DOMPurify
- Vite/Nitro

---

## Current Application Flow

1. User opens `/chat`.
2. Chat threads are loaded through `threads.list`.
3. User submits a market observation with a `responseStyle`.
4. The UI optimistically appends the user message.
5. The client calls `chat.stream`.
6. The server resolves or creates a chat thread.
7. The server persists the user message.
8. The server calls `streamTradingAgent`.
9. The agent emits step events:
   - `detect_patterns`
   - `retrieve_docs`
   - `build_market_state`
   - `generate_report`
10. The server forwards step and text-delta events to the client.
11. The agent returns a final `report` and structured `marketState`.
12. The server persists the assistant message and latest `marketState`.
13. The UI replaces local messages with the saved thread messages.

---

## Agent Architecture

The main agent orchestration file is `src/agent/trading-agent.ts`.

The agent is implemented as a LangGraph `StateGraph` with these nodes:

- `detect_patterns`
  - Uses the chat model to extract comma-separated Al Brooks-style pattern labels from the conversation transcript.
- `retrieve_docs`
  - Performs simple deterministic lookup against the local `PATTERN_DOCS` record.
- `build_market_state`
  - Uses structured model output with `marketStateResponseSchema`.
  - Normalizes nullable response fields into the persisted `marketStateSchema`.
  - Uses previous persisted market state only as prior context.
- `generate_report`
  - Builds either the report prompt or freeform prompt.
  - Streams the final markdown response.

The current trading model constant is:

- `TRADING_MODEL_NAME = "gpt-5.4-mini"`

Tracing and observability:

- `runTradingAgent` is wrapped in LangSmith `traceable`.
- The default LangSmith project is `playbook-chat`.
- Tracing behavior is controlled by environment variables.

---

## Agent Responsibilities

The trading agent must:

- Parse the user's market description and conversation history.
- Extract only supported technical context.
- Detect relevant pattern labels conservatively.
- Retrieve concise pattern context.
- Build a structured market state.
- Preserve valid prior market state when the new observation does not contradict it.
- Update state when new observations invalidate previous reads.
- Produce a concise markdown report or freeform answer.
- Avoid invented price levels, indicators, timeframes, volume details, or facts.
- Treat uncertainty, waiting, and no-trade conditions as valid outcomes.

---

## Agent State And Schemas

Schema ownership:

- `src/agent/schemas.ts` owns runtime validation schemas.
- `src/agent/types.ts` owns inferred TypeScript types.
- `src/db/schema.ts` owns persisted chat/thread types.

Key schemas and values:

- `agentStateSchema`
  - `needs_context`
  - `analysis_ready`
  - `trade_plan_ready`
- `responseStyleSchema`
  - `report`
  - `freeform`
- `tradingAgentStepSchema`
  - `detect_patterns`
  - `retrieve_docs`
  - `build_market_state`
  - `generate_report`
- `marketStateSchema`
  - `cicle`
  - `rangeType`
  - `locationInRange`
  - `sessionContext`
  - `activeStructures`
  - `currentBias`
  - `latestEvent`
  - `openQuestions`

Agent I/O must be validated with Zod schemas before being persisted or returned through the API.

---

## Prompting

Prompt ownership lives in `src/agent/prompts.ts`.

Current prompt builders:

- `technicalAnalysisSystemPrompt`
- `freeformTradingSystemPrompt`

Report mode must emit the fixed markdown structure required by `technicalAnalysisSystemPrompt`.

Freeform mode answers the user's actual question directly and should not use the report template.

Both prompt modes must stay grounded in the structured market state and conversation context. Do not invent unsupported levels, indicators, timeframes, volume details, or facts.

---

## Retrieval

Retrieval is currently intentionally small and local:

- Pattern knowledge is stored in an in-memory `PATTERN_DOCS` record inside `src/agent/trading-agent.ts`.
- Matching is deterministic substring matching from detected pattern labels.
- No external vector database, tag filtering, or reranking is currently implemented.

If retrieval grows, move it out of `trading-agent.ts` into separate retrieval modules before adding complexity. Keep retrieval logic separate from UI code.

---

## Server And API

The main tRPC router is `src/server/trpc/router.ts`.

Current endpoints:

- `health`
- `greeting`
- `threads.list`
- `threads.latest`
- `threads.save`
- `threads.update`
- `threads.delete`
- `chat.send`
- `chat.stream`

Chat persistence helpers live in `src/server/chat-store.ts`:

- `createMessage`
- `getLatestThread`
- `getThreadById`
- `createThread`
- `updateThread`
- `deleteThread`

The tRPC route handler lives at `src/routes/api/trpc/[...trpc].ts`.

Streaming chat responses are exposed through `chat.stream` and consumed by the browser client through `httpBatchStreamLink`.

---

## UI And Routes

Current routes:

- `/`
  - Basic home page with a health query example.
- `/about`
  - Starter about/counter page.
- `/chat`
  - Main chat UI.
- `[...]404`
  - Not found route.
- `/api/trpc`
  - tRPC API route.

`src/routes/chat.tsx`:

- Maintains local thread, message, draft, loading, streaming, and error state.
- Loads saved threads on mount.
- Supports selecting, creating, and deleting chat threads.
- Sends messages through `chat.stream`.
- Shows streaming step status before assistant text arrives.
- Renders assistant markdown with `renderMarkdown`.
- Supports `report` and `freeform` response style selection.

Application shell:

- `src/app.tsx` wraps routes in `QueryProvider`, router, nav, and suspense.
- `src/components/Nav.tsx` links Home, About, and Chat.

Markdown rendering:

- `src/lib/render-markdown.ts` uses `marked`.
- Browser rendering is sanitized with `DOMPurify`.

---

## Database

Drizzle schema lives in `src/db/schema.ts`.

Current tables:

- `usersTable`
  - Present in the schema.
  - Not currently wired into authentication.
- `chatThreadsTable`
  - `id`
  - `messages`
  - `marketState`
  - `createdAt`
  - `updatedAt`

Migrations:

- `drizzle/0000_warm_white_queen.sql`
- `drizzle/0001_add_market_state.sql`

Database config:

- `drizzle.config.ts`
- `src/db/index.ts`
- `DB_FILE_NAME` is required.

---

## Environment Variables

Required:

- `OPENAI_API_KEY`
- `DB_FILE_NAME`

Optional LangSmith variables:

- `LANGSMITH_TRACING`
- `LANGSMITH_API_KEY`
- `LANGSMITH_PROJECT`
- `LANGCHAIN_CALLBACKS_BACKGROUND`
- `LANGSMITH_WORKSPACE_ID`

---

## Coding Standards

- Use TypeScript strict patterns.
- Prefer pure functions and small modules.
- Validate agent I/O with Zod schemas.
- Keep prompts, schemas, and agent orchestration separate where practical.
- Do not mix UI code with retrieval or agent logic.
- Avoid inventing domain facts in prompts.
- Keep chat persistence changes in server/database modules.
- Keep route components focused on UI state and tRPC calls.
- Avoid classes unless they are required by a library boundary.
- Keep files under 300 lines when practical.
- Prefer small composable modules over large orchestration files.

---

## Domain Rules

- Avoid overconfident language.
- Waiting or no-trade is valid.
- Distinguish trend, trading range, breakout mode, reversal, and pullback carefully.
- Use probabilistic reasoning.
- Separate observation from interpretation.
- Do not confuse local pullbacks with full reversals without evidence.
- Reduce confidence when input is incomplete or contradictory.
- Do not invent price levels, indicators, timeframes, volume details, or unsupported events.
- Preserve prior state only when it is still supported by the latest observation.
- Treat previous persisted market state as context, not as stronger evidence than the newest user observation.

---

## Testing And Verification

Expected verification commands:

```bash
pnpm build
pnpm dev
pnpm db:generate
pnpm db:migrate
```

There is currently no dedicated test script in `package.json`.

For documentation-only changes, a targeted content review is usually sufficient. For behavior changes, run `pnpm build` at minimum.

---

## Current Project Structure

```txt
src/
├── agent/
│   ├── index.ts
│   ├── prompts.ts
│   ├── schemas.ts
│   ├── stub_types.ts
│   ├── trading-agent.ts
│   └── types.ts
├── app.css
├── app.tsx
├── components/
│   ├── Counter.tsx
│   └── Nav.tsx
├── db/
│   ├── index.ts
│   └── schema.ts
├── entry-client.tsx
├── entry-server.tsx
├── global.d.ts
├── lib/
│   ├── query/
│   │   ├── client.ts
│   │   └── provider.tsx
│   ├── render-markdown.ts
│   └── trpc/
│       ├── client.ts
│       ├── query.ts
│       └── server-caller.ts
├── routes/
│   ├── [...404].tsx
│   ├── about.tsx
│   ├── api/
│   │   └── trpc/
│   │       └── [...trpc].ts
│   ├── chat.tsx
│   └── index.tsx
└── server/
    ├── chat-store.ts
    └── trpc/
        ├── context.ts
        ├── init.ts
        └── router.ts
```
