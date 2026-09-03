/**
 * @fileoverview Bearer API-key check for the REST API and for MCP's API-key door.
 *
 * Same credential as everything else in this app: `WORKER_API_KEY`, resolved
 * through the Secrets Store binding.
 */

import { getWorkerApiKey } from "../utils/secrets";
import { timingSafeEqual } from "./session";

/**
 * Pull a bearer token out of a request.
 *
 * Accepts `Authorization: Bearer <key>` and, for clients that cannot set an
 * Authorization header, `X-API-Key: <key>`.
 */
export function extractBearer(request: Request): string | undefined {
  const auth = request.headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  return request.headers.get("x-api-key")?.trim() || undefined;
}

/**
 * Whether the request carries the correct API key.
 *
 * A Secrets Store binding is an object, so this compares against the *resolved*
 * string from `getWorkerApiKey`. Comparing against `env.WORKER_API_KEY`
 * directly is always false and 401s forever.
 *
 * @param request - Incoming request
 * @param env - Worker env
 */
export async function hasValidApiKey(request: Request, env: unknown): Promise<boolean> {
  const presented = extractBearer(request);
  if (!presented) return false;
  return timingSafeEqual(presented, await getWorkerApiKey(env));
}

/** 401 with the `WWW-Authenticate` challenge clients expect. */
export function unauthorized(message = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="notebooklm"',
    },
  });
}
