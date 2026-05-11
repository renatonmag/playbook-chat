import { For, Show, createSignal } from "solid-js";
import { getTRPCClient } from "~/lib/trpc/client";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Chat() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [draft, setDraft] = createSignal("");
  const [isSending, setIsSending] = createSignal(false);
  const [error, setError] = createSignal("");

  const canSubmit = () => draft().trim().length > 0 && !isSending();

  async function sendMessage() {
    const message = draft().trim();

    if (!message || isSending()) {
      return;
    }

    setError("");
    setDraft("");
    setIsSending(true);
    setMessages(current => [
      ...current,
      {
        id: createMessageId(),
        role: "user",
        content: message
      }
    ]);

    try {
      const response = await getTRPCClient().chat.mutate({ message });

      setMessages(current => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: response.message
        }
      ]);
    } catch {
      setError("Could not send message. Try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main class="min-h-[calc(100vh-48px)] bg-slate-100 px-4 py-6 text-slate-950">
      <section class="mx-auto flex min-h-[calc(100vh-96px)] max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <Show
            when={messages().length > 0}
            fallback={
              <div class="flex justify-start">
                <p class="max-w-[80%] rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                  Send a market observation and I will echo it back for now.
                </p>
              </div>
            }
          >
            <For each={messages()}>
              {message => (
                <div class={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <p
                    class={
                      message.role === "user"
                        ? "max-w-[80%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-sky-700 px-4 py-3 text-sm leading-6 text-white"
                        : "max-w-[80%] whitespace-pre-wrap rounded-lg rounded-bl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800"
                    }
                  >
                    {message.content}
                  </p>
                </div>
              )}
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
    </main>
  );
}
