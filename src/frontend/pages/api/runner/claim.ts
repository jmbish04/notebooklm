/**
 * @fileoverview `/api/runner/claim` — hand the oldest queued task to a runner.
 *
 * NotebookLM authenticates through an interactive browser login, so a Worker
 * cannot run a query itself. This Worker is the registry: it queues work and
 * records outcomes. A runner on a machine that holds a NotebookLM session polls
 * here, executes the query, and reports back to `/api/runner/{id}/complete`.
 *
 * Requires the API key (a browser session is not enough — this mutates the
 * queue on behalf of a machine, not a person).
 */

import type { APIRoute } from "astro";

import { hasValidApiKey, unauthorized } from "../../../../backend/auth/api-key";
import { getDb } from "../../../../backend/db/client";
import { claimNextTask } from "../../../../backend/tasks/service";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  if (!(await hasValidApiKey(request, env))) return unauthorized();

  let runnerId = "unknown-runner";
  try {
    const body: any = await request.json();
    if (body?.runner_id) runnerId = String(body.runner_id);
  } catch {
    // Body is optional; an anonymous runner still gets work.
  }

  const task = await claimNextTask(getDb(env), runnerId);

  return new Response(JSON.stringify(task ? { task } : { task: null }, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
