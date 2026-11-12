/**
 * @fileoverview `/api/runner/{id}/complete` — a runner reports an outcome.
 *
 * Body: `{ "status": "succeeded" | "failed" | "cancelled", "result"?, "error"? }`.
 * Completing an already-terminal task is refused with 409 rather than silently
 * overwriting an answer.
 */

import type { APIRoute } from "astro";

import { hasValidApiKey, unauthorized } from "../../../../../backend/auth/api-key";
import { getDb } from "../../../../../backend/db/client";
import { completeTask } from "../../../../../backend/tasks/service";

export const prerender = false;

const ALLOWED = ["succeeded", "failed", "cancelled"] as const;
type Allowed = (typeof ALLOWED)[number];

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const env = (locals as any).runtime.env;
  if (!(await hasValidApiKey(request, env))) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const status = String(body?.status ?? "");
  if (!ALLOWED.includes(status as Allowed)) {
    return json({ error: `status must be one of: ${ALLOWED.join(", ")}` }, 400);
  }

  const updated = await completeTask(getDb(env), String(params.id), {
    status: status as Allowed,
    result: body?.result ? String(body.result) : undefined,
    error: body?.error ? String(body.error) : undefined,
  });

  if (!updated) {
    return json({ error: "Task not found, or already in a terminal status" }, 409);
  }

  return json({ task: updated }, 200);
};
