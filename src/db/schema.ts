import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

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
