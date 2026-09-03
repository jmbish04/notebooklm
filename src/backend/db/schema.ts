/**
 * @fileoverview Drizzle schema for the NotebookLM task registry (Cloudflare D1).
 *
 * NotebookLM queries run for minutes, so the API never blocks on one. A caller
 * creates a task, gets a UUID back immediately, and checks in on that UUID
 * later. Everything a check-in needs to answer lives in these tables.
 *
 * ## Indexing and the D1 bill
 *
 * D1 bills by rows *scanned*, not rows returned, so every recurring query here
 * gets an index that lets SQLite SEARCH instead of SCAN. The three hot paths:
 *
 * | Query                                             | Index used                    |
 * | ------------------------------------------------- | ----------------------------- |
 * | check in on one task (`WHERE id = ?`)             | primary key                   |
 * | runner claims work (`status='queued' ORDER BY …`) | `idx_tasks_status_created_at` |
 * | list recent tasks (`ORDER BY created_at DESC`)    | `idx_tasks_created_at`        |
 *
 * The composite index is deliberately ordered (status, created_at): the
 * equality column must come first for the range/ORDER BY column to be usable.
 * Verify with `EXPLAIN QUERY PLAN` — it must report `SEARCH ... USING INDEX`.
 *
 * Indexes cost an extra written row per indexed write. Task rows are written a
 * handful of times each and read on every poll, so that trade is heavily
 * favourable here.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Lifecycle of a NotebookLM task.
 *
 * `queued` -> `running` -> (`succeeded` | `failed` | `cancelled`).
 */
export const TASK_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses that mean the task will not change again. */
export const TERMINAL_STATUSES: readonly TaskStatus[] = ["succeeded", "failed", "cancelled"];

/** Where a task came from — useful for attributing load. */
export const TASK_SOURCES = ["mcp", "api", "web"] as const;

export type TaskSource = (typeof TASK_SOURCES)[number];

/**
 * One NotebookLM request and its outcome.
 *
 * The row is created up-front with `status = 'queued'` so the caller can be
 * handed `id` synchronously; a runner fills in the rest.
 */
export const tasks = sqliteTable(
  "tasks",
  {
    /** UUID handed back to the caller. This is the check-in handle. */
    id: text("id").primaryKey(),

    /** NotebookLM notebook this task runs against. */
    notebookId: text("notebook_id").notNull(),

    /** The question put to the notebook. */
    question: text("question").notNull(),

    /** Lifecycle state. See {@link TASK_STATUSES}. */
    status: text("status", { enum: TASK_STATUSES }).notNull().default("queued"),

    /** Which door created this task. See {@link TASK_SOURCES}. */
    source: text("source", { enum: TASK_SOURCES }).notNull().default("api"),

    /** NotebookLM's answer. Set when `status = 'succeeded'`. */
    result: text("result"),

    /** Failure reason. Set when `status = 'failed'`. */
    error: text("error"),

    /**
     * Opaque identifier for the runner that claimed this task, so a claim can
     * be traced and a stale claim can be told apart from a fresh one.
     */
    claimedBy: text("claimed_by"),

    /** How many times a runner has picked this task up. */
    attempts: integer("attempts").notNull().default(0),

    /** Unix epoch seconds. */
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),

    /** Unix epoch seconds; set when a runner claims the task. */
    startedAt: integer("started_at"),

    /** Unix epoch seconds; set when the task reaches a terminal status. */
    completedAt: integer("completed_at"),

    /** Unix epoch seconds; bumped on every status change. */
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    /**
     * Runner poll: `WHERE status = ? ORDER BY created_at`. Equality column
     * first so created_at stays usable for the ordering.
     */
    statusCreatedAtIdx: index("idx_tasks_status_created_at").on(t.status, t.createdAt),

    /** Dashboard/list: `ORDER BY created_at DESC`. */
    createdAtIdx: index("idx_tasks_created_at").on(t.createdAt),
  }),
);

/**
 * Append-only status history for a task.
 *
 * Lets a check-in show *how* a long-running task progressed, not just where it
 * landed, without widening the `tasks` row on every update.
 */
export const taskEvents = sqliteTable(
  "task_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** The task this event belongs to. */
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),

    /** Status the task moved into. */
    status: text("status", { enum: TASK_STATUSES }).notNull(),

    /** Human-readable note about the transition. */
    message: text("message"),

    /** Unix epoch seconds. */
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    /**
     * Every read of this table is "the events for one task, oldest first".
     * Without this index that is a full scan of all history for every check-in.
     */
    taskIdCreatedAtIdx: index("idx_task_events_task_id_created_at").on(t.taskId, t.createdAt),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskEvent = typeof taskEvents.$inferSelect;
