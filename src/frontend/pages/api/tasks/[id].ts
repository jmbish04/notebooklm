/**
 * @fileoverview `/api/tasks/{uuid}` — check in on one task.
 *
 * The counterpart to the `notebooklm_check_task` MCP tool. Returns the task,
 * its progress history, and a `done` flag so a poller does not have to know
 * which statuses are terminal.
 */

import type { APIRoute } from "astro";

import { getDb } from "../../../../backend/db/client";
import { getTaskWithEvents } from "../../../../backend/tasks/service";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const db = getDb((locals as any).runtime.env);
  const task = await getTaskWithEvents(db, String(params.id));

  if (!task) {
    return new Response(JSON.stringify({ error: "Task not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(task, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
