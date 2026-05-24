import { For, Show, createSignal, onMount } from "solid-js";
import { Send, Wrench } from "lucide-solid";
import { renderMarkdown } from "~/lib/render-markdown";
import { getTRPCClient } from "~/lib/trpc/client";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ToolEvent = {
  type: "tool";
  name: string;
  status: "started" | "completed" | "error";
  input?: unknown;
  output?: unknown;
  error?: string;
};

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return "";
  }

  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function getToolEventText(event: ToolEvent) {
  if (event.status === "started") {
    return formatPayload(event.input) || "Tool call started.";
  }

  if (event.status === "completed") {
    return formatPayload(event.output) || "Tool call completed.";
  }

  return event.error || "Tool call failed.";
}

export default function ReactChat() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [toolEvents, setToolEvents] = createSignal<ToolEvent[]>([]);
  const [draft, setDraft] = createSignal("");
  const [isSending, setIsSending] = createSignal(false);
  const [streamingAssistantId, setStreamingAssistantId] = createSignal<string>();
  const [error, setError] = createSignal("");
  const [hasMounted, setHasMounted] = createSignal(false);
  let messagesContainerRef: HTMLDivElement | undefined;

  const canSubmit = () => draft().trim().length > 0 && !isSending();

  onMount(() => {
    setHasMounted(true);
  });

  function scrollMessagesToBottom() {
    requestAnimationFrame(() => {
      if (!messagesContainerRef) {
        return;
      }

      messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
    });
  }

  function startAssistantMessage(messageId: string) {
    setStreamingAssistantId(messageId);
    setMessages(current => {
      if (current.some(message => message.id === messageId)) {
        return current;
      }

      return [
        ...current,
        {
          id: messageId,
          role: "assistant",
          content: "",
        },
      ];
    });
    scrollMessagesToBottom();
  }

  function appendAssistantDelta(messageId: string, delta: string) {
    setMessages(current =>
      current.map(message =>
        message.id === messageId
          ? {
              ...message,
              content: message.content + delta,
            }
          : message,
      ),
    );
    scrollMessagesToBottom();
  }

  function completeAssistantMessage(messageId: string, content: string) {
    setMessages(current =>
      current.map(message =>
        message.id === messageId
          ? {
              ...message,
              content,
            }
          : message,
      ),
    );
    scrollMessagesToBottom();
  }

  async function sendMessage() {
    const message = draft().trim();

    if (!message || isSending()) {
      return;
    }

    const previousMessages = messages();
    const optimisticUserMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: message,
    };

    setError("");
    setDraft("");
    setIsSending(true);
    setStreamingAssistantId(undefined);
    setMessages(current => [...current, optimisticUserMessage]);
    scrollMessagesToBottom();

    try {
      const stream = await getTRPCClient().react.stream.mutate({
        message,
        history: previousMessages.map(({ role, content }) => ({
          role,
          content,
        })),
      });

      for await (const event of stream) {
        switch (event.type) {
          case "assistant_start":
            startAssistantMessage(event.messageId);
            break;
          case "assistant_delta":
            appendAssistantDelta(event.messageId, event.delta);
            break;
          case "tool":
            setToolEvents(current => [...current, event]);
            break;
          case "complete":
            completeAssistantMessage(event.messageId, event.message);
            break;
        }
      }
    } catch (sendError) {
      if (import.meta.env.DEV) {
        console.error("Could not send ReAct message.", sendError);
      }

      setMessages(previousMessages);
      setError("Could not send message. Try again.");
    } finally {
      setStreamingAssistantId(undefined);
      setIsSending(false);
    }
  }

  return (
    <main class="h-[calc(100vh-48px)] overflow-hidden bg-slate-100 text-slate-950">
      <div class="mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row">
        <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <header class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h1 class="text-sm font-semibold text-slate-900">ReAct Chat</h1>
              <p class="mt-1 text-xs text-slate-500">Custom LangGraph agent</p>
            </div>
          </header>

          <div
            ref={element => {
              messagesContainerRef = element;
            }}
            class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
          >
            <Show
              when={messages().length > 0}
              fallback={
                <div class="flex justify-start">
                  <p class="max-w-[80%] rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                    Ask the ReAct agent about the market.
                  </p>
                </div>
              }
            >
              <For each={messages()}>
                {message => (
                  <div
                    class={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      class={
                        message.role === "user"
                          ? "max-w-[80%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-sky-700 px-4 py-3 text-sm leading-6 text-white"
                          : "prose prose-slate max-w-[80%] rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800"
                      }
                    >
                      <Show
                        when={hasMounted() && message.role === "assistant"}
                        fallback={<div class="whitespace-pre-wrap">{message.content}</div>}
                      >
                        <div
                          class="report-markdown"
                          innerHTML={renderMarkdown(message.content)}
                        />
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </Show>

            <Show when={isSending() && !streamingAssistantId()}>
              <div class="flex justify-start">
                <div class="rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
                  Starting ReAct agent...
                </div>
              </div>
            </Show>
          </div>

          <div class="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
            <div class="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={draft()}
                onInput={event => setDraft(event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={isSending()}
                rows={4}
                placeholder="Ask the ReAct agent about the market..."
                class="min-h-24 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!canSubmit()}
                title="Send"
                aria-label="Send message"
                class="flex items-center justify-center gap-2 self-end rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Send class="size-4" aria-hidden="true" />
                Send
              </button>
            </div>
            <Show when={error()}>
              <p class="mt-2 text-sm text-red-700">{error()}</p>
            </Show>
          </div>
        </section>

        <aside class="flex h-72 min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:h-full lg:w-80">
          <div class="flex items-center gap-2 border-b border-slate-200 p-4">
            <Wrench class="size-4 text-slate-500" aria-hidden="true" />
            <h2 class="text-sm font-semibold text-slate-900">Tool Activity</h2>
            <span class="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {toolEvents().length}
            </span>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-3">
            <Show
              when={toolEvents().length > 0}
              fallback={
                <p class="text-sm leading-5 text-slate-500">
                  No tool calls yet.
                </p>
              }
            >
              <div class="space-y-2">
                <For each={toolEvents()}>
                  {event => (
                    <section class="rounded-md border border-slate-200 bg-white p-3">
                      <div class="flex items-center justify-between gap-2">
                        <h3 class="truncate text-sm font-medium text-slate-900">
                          {event.name}
                        </h3>
                        <span
                          class={
                            event.status === "error"
                              ? "shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                              : event.status === "completed"
                                ? "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                                : "shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                          }
                        >
                          {event.status}
                        </span>
                      </div>
                      <p class="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">
                        {getToolEventText(event)}
                      </p>
                    </section>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </aside>
      </div>
    </main>
  );
}
