/**
 * @fileoverview Request gate for the whole app.
 *
 * Three doors, one credential (`WORKER_API_KEY`):
 *
 * | Path        | Accepted credential                                  |
 * | ----------- | ---------------------------------------------------- |
 * | `/mcp`      | `Authorization: Bearer <api key>` **or** an OAuth token |
 * | `/api/*`    | API key, or a browser session cookie                 |
 * | pages       | Session cookie; otherwise redirected to `/login`     |
 *
 * `/mcp` tries the API key first and only falls through to the OAuth provider
 * when there isn't one. That ordering is what lets a single endpoint serve both
 * a scripted client holding a key and an interactive client doing OAuth.
 */

import { defineMiddleware } from "astro:middleware";

import { hasValidApiKey } from "../backend/auth/api-key";
import { SESSION_COOKIE, verifySessionToken } from "../backend/auth/session";
import { handleMcpRequest } from "../backend/mcp/handler";
import { createOAuthProvider, isOAuthPath } from "../backend/oauth/provider";

/** Pages reachable without a session. */
const PUBLIC_PAGES = new Set(["/login"]);

/** API routes reachable without any credential. */
const PUBLIC_API = new Set(["/api/health", "/api/session"]);

/** Methods that change state and therefore need CSRF protection. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Reject a cross-site state-changing request that is riding on the session
 * cookie.
 *
 * Only cookie-authenticated requests need this. A bearer token is never
 * attached automatically by a browser, so an API-key request cannot be forged
 * from another origin — which is why this check deliberately does not apply to
 * them. (Astro's built-in `checkOrigin` makes no such distinction, and 403s
 * legitimate API clients; it is turned off in `astro.config.ts`.)
 *
 * `SameSite=Lax` on the cookie is the primary defence. This is the second layer.
 */
function isCrossSite(request: Request, url: URL): boolean {
  if (!UNSAFE_METHODS.has(request.method)) return false;

  const origin = request.headers.get("origin");
  // No Origin header means it is not a browser fetch/form post.
  if (!origin) return false;

  return origin !== url.origin;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals, url } = context;
  const env = (locals as any).runtime?.env;
  const ctx = (locals as any).runtime?.ctx;
  const path = url.pathname;

  // Without bindings nothing below can authenticate. Fail closed.
  if (!env) {
    return new Response("Worker bindings unavailable", { status: 500 });
  }

  // --- MCP: API key, else OAuth -------------------------------------------
  if (path === "/mcp") {
    if (await hasValidApiKey(request, env)) {
      return handleMcpRequest(request, env);
    }
    return createOAuthProvider().fetch(request, env, ctx);
  }

  // --- OAuth discovery, authorize, token, register ------------------------
  if (isOAuthPath(path)) {
    return createOAuthProvider().fetch(request, env, ctx);
  }

  const hasSession = await verifySessionToken(env, context.cookies.get(SESSION_COOKIE)?.value);
  (locals as any).authenticated = hasSession;

  // --- REST API -----------------------------------------------------------
  if (path.startsWith("/api/")) {
    // A valid API key is enough on its own, and needs no CSRF check.
    if (await hasValidApiKey(request, env)) return next();

    if (isCrossSite(request, url)) {
      return json({ error: "Cross-origin request rejected" }, 403);
    }

    if (PUBLIC_API.has(path) || hasSession) return next();

    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="notebooklm"',
      },
    });
  }

  // --- Pages --------------------------------------------------------------
  if (!hasSession && !PUBLIC_PAGES.has(path)) {
    const redirectTo = encodeURIComponent(path + url.search);
    return context.redirect(`/login?next=${redirectTo}`, 302);
  }

  // Already signed in — no reason to show the passcode form again.
  if (hasSession && path === "/login") {
    return context.redirect("/", 302);
  }

  return next();
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
