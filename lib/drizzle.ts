import { config } from "dotenv";
import { InferModel } from "drizzle-orm";
import {
  int,
  jsonb,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

config({ path: ".env.local" });

export const JobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  created: timestamp("created").notNull().defaultNow(),
});

export type JobsTableI = InferModel<typeof JobsTable>;

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql);
