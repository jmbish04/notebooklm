/**
 * @fileoverview `/api/runner/{id}/progress` — append a progress note.
 *
 * Lets a runner say "still working, here is where I am" during the minutes a
 * NotebookLM query takes, so a check-in shows movement rather than a flat
 * `running`. Does not change the task's status.
 */

import type { APIRoute } from "astro";

import { hasValidApiKey, unauthorized } from "../../../../../backend/auth/api-key";
import { getDb } from "../../../../../backend/db/client";
import { addTaskEvent } from "../../../../../backend/tasks/service";

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  const env = (locals as any).runtime.env;
  if (!(await hasValidApiKey(request, env))) return unauthorized();

  let message = "";
  try {
    message = String(((await request.json()) as any)?.message ?? "").trim();
  } catch {
    return new Response(JSON.stringify({ error: "Body must be JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const ok = await addTaskEvent(getDb(env), String(params.id), message);

  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 404,
    headers: { "content-type": "application/json" },
  });
};
