import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";

export const QuestionTable = pgTable(
  "question",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (question) => {
    return {
      uniqueIdx: uniqueIndex("unique_idx").on(question.slug),
    };
  }
);

export type Question = InferSelectModel<typeof QuestionTable>;
export type NewQuestion = InferInsertModel<typeof QuestionTable>;

// Connect to Vercel Postgres
export const db = drizzle(sql);
