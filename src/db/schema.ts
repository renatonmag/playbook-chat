import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AgentState, MarketState, ResponseStyle } from "~/agent/types";

export type ChatMessageMetadata = {
  agentState?: AgentState;
  responseStyle?: ResponseStyle;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: ChatMessageMetadata;
};

export const usersTable = sqliteTable("users", {
  id: int().primaryKey({ autoIncrement: true }),
  username: text().notNull(),
  email: text().notNull().unique(),
  password: text().notNull(),
  createdAt: int()
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: int()
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  deletedAt: int(),
});

export const chatThreadsTable = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  messages: text("messages", { mode: "json" })
    .$type<ChatMessage[]>()
    .notNull()
    .default(sql`'[]'`),
  marketState: text("market_state", { mode: "json" })
    .$type<MarketState | null>()
    .default(sql`NULL`),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: int("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
