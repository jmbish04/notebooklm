/**
 * @fileoverview `/api/health` — real dependency checks, no credential required.
 */

import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any).runtime?.env;
  const checks: Record<string, string> = {};

  try {
    await env.DB.prepare("SELECT 1").first();
    checks.d1 = "ok";
  } catch (error) {
    checks.d1 = `error: ${(error as Error).message}`;
  }

  try {
    checks.secrets = (await env.WORKER_API_KEY?.get()) ? "ok" : "missing";
  } catch (error) {
    checks.secrets = `error: ${(error as Error).message}`;
  }

  checks.oauth_kv = env.OAUTH_KV ? "ok" : "missing";
  checks.code_mode = env.LOADER ? "ok" : "missing";

  const healthy = Object.values(checks).every((v) => v === "ok");

  return new Response(JSON.stringify({ status: healthy ? "ok" : "degraded", checks }, null, 2), {
    status: healthy ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
};
