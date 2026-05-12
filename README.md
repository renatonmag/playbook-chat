# Playbook Chat

Trading assistant application built with SolidStart, tRPC, Drizzle, and LangChain.

## Development

Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

Build for production:

```bash
pnpm build
pnpm start
```

## LangSmith Observability

`src/agent/trading-agent.ts` is instrumented with LangSmith tracing.

Tracing stays off unless `LANGSMITH_TRACING=true`.

Required environment variables:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-api-key
```

Recommended environment variables:

```bash
LANGSMITH_PROJECT=playbook-chat
LANGCHAIN_CALLBACKS_BACKGROUND=true
```

Set `LANGSMITH_WORKSPACE_ID` only when the API key belongs to multiple LangSmith workspaces.

With tracing enabled, each `runTradingAgent` call logs:

- a top-level `runTradingAgent` trace
- nested LangGraph and LangChain runs for pattern detection, context checking, and report generation
- structured tags and metadata, including prompt length, history count, model, result state, and context sufficiency

Current tracing policy:

- raw trading prompts and chat history are sent to LangSmith
- tracing config is driven entirely by environment variables
