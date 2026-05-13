import { For, Show, createSignal, onMount } from "solid-js";
import { renderMarkdown } from "~/lib/render-markdown";
import { getTRPCClient } from "~/lib/trpc/client";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: ChatMessageMetadata;
};

type ChatMessageMetadata = {
  agentState?: "needs_context" | "analysis_ready" | "trade_plan_ready";
  contextSufficiency?: {
    context_sufficiency: "insufficient" | "sufficient";
    context_request_header: string;
    missing_context: string[];
    questions: string[];
  };
};

type ChatThread = {
  id: string;
  messages: ChatMessage[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRenderableReport(message: ChatMessage) {
  return (
    message.role === "assistant" &&
    (message.metadata?.agentState === "analysis_ready" ||
      message.metadata?.agentState === "trade_plan_ready")
  );
}

export default function Chat() {
  const [threads, setThreads] = createSignal<ChatThread[]>([]);
  const [threadId, setThreadId] = createSignal<string>();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [draft, setDraft] = createSignal("");
  const [isLoadingThread, setIsLoadingThread] = createSignal(true);
  const [isLoadingThreads, setIsLoadingThreads] = createSignal(true);
  const [isCreatingThread, setIsCreatingThread] = createSignal(false);
  const [deletingThreadId, setDeletingThreadId] = createSignal<string>();
  const [isSending, setIsSending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [hasMounted, setHasMounted] = createSignal(false);

  const canSubmit = () => draft().trim().length > 0 && !isSending() && !isLoadingThread();

  onMount(() => {
    setHasMounted(true);
    void loadThreads();
  });

  function getThreadTitle(thread: ChatThread) {
    const firstUserMessage = thread.messages.find(message => message.role === "user");

    return firstUserMessage?.content.trim() || "New chat";
  }

  function getThreadSubtitle(thread: ChatThread) {
    const count = thread.messages.length;

    if (count === 0) {
      return "No messages yet";
    }

    if (count === 1) {
      return "1 message";
    }

    return `${count} messages`;
  }

  async function loadThreads() {
    setIsLoadingThread(true);
    setIsLoadingThreads(true);
    setError("");

    try {
      const nextThreads = await getTRPCClient().threads.list.query();
      const selectedThread = nextThreads[0];

      setThreads(nextThreads);

      if (selectedThread) {
        setThreadId(selectedThread.id);
        setMessages(selectedThread.messages);
      } else {
        setThreadId(undefined);
        setMessages([]);
      }
    } catch {
      setError("Could not load the saved conversation.");
    } finally {
      setIsLoadingThread(false);
      setIsLoadingThreads(false);
    }
  }

  function selectThread(thread: ChatThread) {
    if (isSending() || deletingThreadId()) {
      return;
    }

    setError("");
    setThreadId(thread.id);
    setMessages(thread.messages);
    setDraft("");
  }

  async function createNewChat() {
    if (isCreatingThread() || isSending()) {
      return;
    }

    setIsCreatingThread(true);
    setError("");

    try {
      const thread = await getTRPCClient().threads.save.mutate({
        messages: [],
      });

      setThreads(current => [thread, ...current]);
      setThreadId(thread.id);
      setMessages([]);
      setDraft("");
    } catch {
      setError("Could not create a new chat.");
    } finally {
      setIsCreatingThread(false);
    }
  }

  async function deleteChatThread(thread: ChatThread) {
    if (isSending() || deletingThreadId()) {
      return;
    }

    const confirmed = confirm("Delete this chat? This cannot be undone.");

    if (!confirmed) {
      return;
    }

    setDeletingThreadId(thread.id);
    setError("");

    try {
      await getTRPCClient().threads.delete.mutate({
        id: thread.id,
      });

      const remainingThreads = threads().filter(current => current.id !== thread.id);
      setThreads(remainingThreads);

      if (thread.id === threadId()) {
        const nextThread = remainingThreads[0];

        if (nextThread) {
          setThreadId(nextThread.id);
          setMessages(nextThread.messages);
        } else {
          setThreadId(undefined);
          setMessages([]);
        }

        setDraft("");
      }
    } catch {
      setError("Could not delete the chat.");
    } finally {
      setDeletingThreadId(undefined);
    }
  }

  async function refreshThreadList(activeThreadId: string, nextMessages: ChatMessage[]) {
    let foundThread = false;

    setThreads(current => {
      const existingThread = current.find(thread => thread.id === activeThreadId);

      if (!existingThread) {
        return current;
      }

      foundThread = true;

      const updatedThread = {
        ...existingThread,
        messages: nextMessages,
        updatedAt: new Date(),
      };

      return [updatedThread, ...current.filter(thread => thread.id !== activeThreadId)];
    });

    if (!foundThread) {
      const nextThreads = await getTRPCClient().threads.list.query();
      setThreads(nextThreads);
    }
  }

  async function sendMessage() {
    const message = draft().trim();

    if (!message || isSending() || isLoadingThread()) {
      return;
    }

    const previousMessages = messages();
    const optimisticUserMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: message
    };

    setError("");
    setDraft("");
    setIsSending(true);
    setMessages(current => [...current, optimisticUserMessage]);

    try {
      const response = await getTRPCClient().chat.mutate({
        threadId: threadId(),
        message
      });

      setThreadId(response.threadId);
      setMessages(response.messages);
      await refreshThreadList(response.threadId, response.messages);
    } catch {
      setMessages(previousMessages);
      setError("Could not send message. Try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main class="min-h-[calc(100vh-48px)] bg-slate-100 text-slate-950">
      <div class="mx-auto flex min-h-[calc(100vh-48px)] max-w-6xl flex-col gap-4 px-4 py-6 md:flex-row">
        <aside class="flex h-72 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-96px)] md:w-72">
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
            <h1 class="text-sm font-semibold text-slate-900">Chats</h1>
            <button
              type="button"
              onClick={() => void createNewChat()}
              disabled={isCreatingThread() || isSending()}
              class="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              New chat
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-2">
            <Show
              when={!isLoadingThreads() && threads().length > 0}
              fallback={
                <p class="px-3 py-4 text-sm leading-5 text-slate-500">
                  <Show when={!isLoadingThreads()} fallback="Loading chats...">
                    No chats yet.
                  </Show>
                </p>
              }
            >
              <div class="space-y-1">
                <For each={threads()}>
                  {thread => {
                    const isSelected = () => thread.id === threadId();

                    return (
                      <div class="group relative">
                        <button
                          type="button"
                          onClick={() => selectThread(thread)}
                          disabled={isSending() || !!deletingThreadId()}
                          class={
                            isSelected()
                              ? "block w-full rounded-md bg-sky-50 px-3 py-2 pr-10 text-left ring-1 ring-sky-200 disabled:cursor-not-allowed"
                              : "block w-full rounded-md px-3 py-2 pr-10 text-left transition hover:bg-slate-100 disabled:cursor-not-allowed"
                          }
                        >
                          <span
                            class={
                              isSelected()
                                ? "block truncate text-sm font-medium text-sky-950"
                                : "block truncate text-sm font-medium text-slate-900"
                            }
                          >
                            {getThreadTitle(thread)}
                          </span>
                          <span
                            class={
                              isSelected()
                                ? "mt-1 block text-xs text-sky-700"
                                : "mt-1 block text-xs text-slate-500"
                            }
                          >
                            {getThreadSubtitle(thread)}
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Delete ${getThreadTitle(thread)}`}
                          title="Delete chat"
                          onClick={event => {
                            event.stopPropagation();
                            void deleteChatThread(thread);
                          }}
                          disabled={isSending() || deletingThreadId() === thread.id}
                          class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-700 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 16 16"
                            class="size-4"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                          >
                            <path d="M2.75 4.25h10.5" />
                            <path d="M6.25 2.75h3.5" />
                            <path d="M5 4.25v8.5" />
                            <path d="M11 4.25v8.5" />
                            <path d="M6.5 6.75v3.5" />
                            <path d="M9.5 6.75v3.5" />
                            <path d="M4.25 4.25l.5 9h6.5l.5-9" />
                          </svg>
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </aside>

        <section class="flex min-h-[calc(100vh-96px)] flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <Show
            when={!isLoadingThread() && messages().length > 0}
            fallback={
              <div class="flex justify-start">
                <p class="max-w-[80%] rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                  <Show
                    when={!isLoadingThread()}
                    fallback="Loading the saved conversation..."
                  >
                    Send a market observation and I will report what to expect, what could go
                    wrong, and whether it looks like a good place to enter.
                  </Show>
                </p>
              </div>
            }
          >
            <For each={messages()}>
              {message => {
                const shouldRenderMarkdown = () =>
                  hasMounted() && isRenderableReport(message);

                return (
                <div class={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    class={
                      message.role === "user"
                        ? "max-w-[80%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-sky-700 px-4 py-3 text-sm leading-6 text-white"
                        : "max-w-[80%] rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800"
                    }
                  >
                    <Show when={message.metadata?.agentState === "needs_context"}>
                      <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Needs context
                      </span>
                    </Show>

                    <Show
                      when={shouldRenderMarkdown()}
                      fallback={<div class="whitespace-pre-wrap">{message.content}</div>}
                    >
                      <div
                        class="report-markdown"
                        innerHTML={renderMarkdown(message.content)}
                      />
                    </Show>
                  </div>
                </div>
                );
              }}
            </For>
          </Show>

          <Show when={isSending()}>
            <div class="flex justify-start">
              <p class="rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-500">
                Thinking...
              </p>
            </div>
            </Show>
        </div>

        <div class="border-t border-slate-200 bg-white p-3 sm:p-4">
          <div class="flex gap-3">
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
              rows={2}
              placeholder="Describe the market setup..."
              class="min-h-12 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!canSubmit()}
              class="self-end rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Send
            </button>
          </div>
          <Show when={error()}>
            <p class="mt-2 text-sm text-red-700">{error()}</p>
          </Show>
        </div>
        </section>
      </div>
    </main>
  );
}
