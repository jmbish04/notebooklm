/**
 * @fileoverview Task registry: create, check in, claim, complete.
 *
 * A NotebookLM query takes minutes, so nothing here waits on one. `createTask`
 * writes a `queued` row and returns its UUID immediately; the caller polls
 * `getTask` with that UUID. A runner (which holds the NotebookLM browser
 * session — a Worker cannot) claims queued work and reports back.
 *
 * Every query in this file is either by primary key or covered by one of the
 * indexes declared in `../db/schema.ts`.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Db } from "../db/client";

import {
  TERMINAL_STATUSES,
  type Task,
  type TaskSource,
  type TaskStatus,
  taskEvents,
  tasks,
} from "../db/schema";

/** Default page size for listings, and the ceiling a caller can ask for. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export interface CreateTaskInput {
  notebookId: string;
  question: string;
  source?: TaskSource;
}

/**
 * Queue a NotebookLM task and return it.
 *
 * The returned `id` is the handle the caller checks in with later.
 *
 * @param db - Drizzle client
 * @param input - Notebook and question
 */
export async function createTask(db: Db, input: CreateTaskInput): Promise<Task> {
  const id = crypto.randomUUID();
  const ts = now();

  const [task] = await db
    .insert(tasks)
    .values({
      id,
      notebookId: input.notebookId,
      question: input.question,
      source: input.source ?? "api",
      status: "queued",
      createdAt: ts,
      updatedAt: ts,
    })
    .returning();

  await db.insert(taskEvents).values({
    taskId: id,
    status: "queued",
    message: "Task queued",
    createdAt: ts,
  });

  return task;
}

/**
 * Fetch one task by UUID. Primary-key lookup — one row read.
 *
 * @returns The task, or `undefined` when no such UUID exists
 */
export async function getTask(db: Db, id: string): Promise<Task | undefined> {
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return rows[0];
}

/**
 * Fetch a task together with its status history.
 *
 * This is what a check-in reads: where the task is now, and how it got there.
 */
export async function getTaskWithEvents(db: Db, id: string) {
  const task = await getTask(db, id);
  if (!task) return undefined;

  const events = await db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, id))
    .orderBy(taskEvents.createdAt);

  return { ...task, events, done: TERMINAL_STATUSES.includes(task.status) };
}

/**
 * List recent tasks, newest first, optionally filtered by status.
 *
 * Uses `idx_tasks_status_created_at` when filtering and
 * `idx_tasks_created_at` when not, so neither path scans the table.
 */
export async function listTasks(
  db: Db,
  options: { status?: TaskStatus; limit?: number } = {},
): Promise<Task[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const query = db.select().from(tasks);
  const filtered = options.status ? query.where(eq(tasks.status, options.status)) : query;

  return filtered.orderBy(desc(tasks.createdAt)).limit(limit);
}

/**
 * Claim the oldest queued task for a runner.
 *
 * The `UPDATE ... WHERE status = 'queued'` is the guard: two runners racing on
 * the same row means the second one updates zero rows and gets `undefined`,
 * so a task is never handed out twice.
 *
 * @param db - Drizzle client
 * @param claimedBy - Identifier for the claiming runner
 * @returns The claimed task, or `undefined` when the queue is empty
 */
export async function claimNextTask(db: Db, claimedBy: string): Promise<Task | undefined> {
  const ts = now();

  const candidates = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.status, "queued"))
    .orderBy(tasks.createdAt)
    .limit(1);

  const candidate = candidates[0];
  if (!candidate) return undefined;

  const [claimed] = await db
    .update(tasks)
    .set({
      status: "running",
      claimedBy,
      startedAt: ts,
      updatedAt: ts,
      attempts: sql`${tasks.attempts} + 1`,
    })
    .where(and(eq(tasks.id, candidate.id), eq(tasks.status, "queued")))
    .returning();

  // Lost the race to another runner; leave it to them.
  if (!claimed) return undefined;

  await db.insert(taskEvents).values({
    taskId: claimed.id,
    status: "running",
    message: `Claimed by ${claimedBy}`,
    createdAt: ts,
  });

  return claimed;
}

export interface CompleteTaskInput {
  status: Extract<TaskStatus, "succeeded" | "failed" | "cancelled">;
  result?: string;
  error?: string;
}

/**
 * Move a task to a terminal status and record the outcome.
 *
 * Refuses to reopen or re-finish a task that is already terminal.
 *
 * @returns The updated task, or `undefined` when the task is missing or done
 */
export async function completeTask(
  db: Db,
  id: string,
  input: CompleteTaskInput,
): Promise<Task | undefined> {
  const ts = now();

  const [updated] = await db
    .update(tasks)
    .set({
      status: input.status,
      result: input.result ?? null,
      error: input.error ?? null,
      completedAt: ts,
      updatedAt: ts,
    })
    .where(and(eq(tasks.id, id), inArray(tasks.status, ["queued", "running"])))
    .returning();

  if (!updated) return undefined;

  await db.insert(taskEvents).values({
    taskId: id,
    status: input.status,
    message: input.error ?? `Task ${input.status}`,
    createdAt: ts,
  });

  return updated;
}

/** Append a progress note to a running task without changing its status. */
export async function addTaskEvent(db: Db, id: string, message: string): Promise<boolean> {
  const task = await getTask(db, id);
  if (!task) return false;

  await db.insert(taskEvents).values({
    taskId: id,
    status: task.status,
    message,
    createdAt: now(),
  });
  return true;
}
