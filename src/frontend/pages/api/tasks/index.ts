/**
 * @fileoverview `/api/tasks` — create and list tasks.
 *
 * POST mirrors the `notebooklm_ask` MCP tool: it returns a UUID immediately
 * rather than waiting out a 3-4 minute NotebookLM query.
 */

import type { APIRoute } from "astro";

import { getDb } from "../../../../backend/db/client";
import { TASK_STATUSES, type TaskStatus } from "../../../../backend/db/schema";
import { createTask, listTasks } from "../../../../backend/tasks/service";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb((locals as any).runtime.env);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const notebookId = String(body?.notebook_id ?? "").trim();
  const question = String(body?.question ?? "").trim();

  if (!notebookId) return json({ error: "notebook_id is required" }, 400);
  if (!question) return json({ error: "question is required" }, 400);

  const task = await createTask(db, {
    notebookId,
    question,
    source: (locals as any).authenticated ? "web" : "api",
  });

  return json(
    {
      task_id: task.id,
      status: task.status,
      message: "Task queued. Poll /api/tasks/{task_id} for the result.",
    },
    201,
  );
};

export const GET: APIRoute = async ({ url, locals }) => {
  const db = getDb((locals as any).runtime.env);

  const statusParam = url.searchParams.get("status") ?? undefined;
  if (statusParam && !TASK_STATUSES.includes(statusParam as TaskStatus)) {
    return json({ error: `status must be one of: ${TASK_STATUSES.join(", ")}` }, 400);
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  if (limitParam && (!Number.isInteger(limit) || limit! < 1)) {
    return json({ error: "limit must be a positive integer" }, 400);
  }

  return json(await listTasks(db, { status: statusParam as TaskStatus | undefined, limit }));
};
