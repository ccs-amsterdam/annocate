import { InferModel } from "drizzle-orm";
import { int, pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
});

export type JobDB = InferModel<typeof jobs>;
