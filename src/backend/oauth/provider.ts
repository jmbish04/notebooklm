/**
 * @fileoverview OAuth 2.1 authorization server for the MCP endpoint.
 *
 * Built on `@cloudflare/workers-oauth-provider`, which implements discovery,
 * dynamic client registration, PKCE, and token issuance. What this file adds is
 * the consent step: a passcode screen checked against `WORKER_API_KEY`.
 *
 * ## Why the lifetimes are what they are
 *
 * The requirement is that an authorization lasts a full year — connect once,
 * do not be asked again for twelve months. Three separate TTLs all have to
 * clear a year or the grant dies early at whichever expires first:
 *
 * | Option                  | Library default | Here    | Why                                          |
 * | ----------------------- | --------------- | ------- | -------------------------------------------- |
 * | `refreshTokenTTL`       | 30 days         | 1 year  | This is the grant lifetime — the real answer. |
 * | `clientRegistrationTTL` | 90 days         | 1 year  | A DCR client expiring kills a live grant.     |
 * | `accessTokenTTL`        | 1 hour          | 1 hour  | Short by design; refreshed silently.          |
 *
 * `clientRegistrationTTL` is the trap: leaving it at its 90-day default caps a
 * "1 year" grant at 90 days, because the client the grant belongs to is gone.
 *
 * The access token stays short deliberately — that is Cloudflare's own guidance
 * for agent and CLI clients. The client refreshes without user interaction, so
 * a short access token costs the user nothing while limiting the blast radius
 * of a leaked one. "Valid for a year" is a property of the grant, not of any
 * single access token.
 */

import { OAuthProvider, type AuthRequest } from "@cloudflare/workers-oauth-provider";

import { isValidPasscode } from "../auth/session";
import { handleMcpRequest } from "../mcp/handler";
import { renderPasscodePage } from "./passcode-page";

/** One year in seconds. */
export const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** One hour in seconds. */
const ONE_HOUR_SECONDS = 60 * 60;

/**
 * Handles `/authorize` — the consent screen — and anything else the provider
 * does not claim.
 *
 * GET renders the passcode form. POST checks the passcode and, when it is
 * right, completes the authorization and redirects back to the client.
 */
const authorizeHandler = {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/authorize") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "GET") {
      const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);

      return html(
        renderPasscodePage({
          state: btoa(JSON.stringify(oauthRequest)),
          clientName: client?.clientName,
        }),
      );
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const rawState = String(form.get("state") ?? "");
      const passcode = String(form.get("passcode") ?? "");

      let oauthRequest: AuthRequest;
      try {
        oauthRequest = JSON.parse(atob(rawState));
      } catch {
        return new Response("Invalid authorization request", { status: 400 });
      }

      if (!(await isValidPasscode(env, passcode))) {
        return html(
          renderPasscodePage({
            state: rawState,
            error: "That passcode is not correct.",
          }),
          401,
        );
      }

      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthRequest,
        userId: "owner",
        metadata: {},
        scope: oauthRequest.scope ?? [],
        // Available to the MCP handler as ctx.props. Deliberately carries no
        // secret — the passcode is verified here and never travels onward.
        props: { authorizedAt: Date.now() },
      });

      return Response.redirect(redirectTo, 302);
    }

    return new Response("Method not allowed", { status: 405 });
  },
};

/** The MCP endpoint, reached only after the provider has validated a token. */
const mcpApiHandler = {
  fetch(request: Request, env: any): Promise<Response> {
    return handleMcpRequest(request, env);
  },
};

/**
 * Build the OAuth provider.
 *
 * Constructed per request rather than at module scope so it never closes over
 * one request's `env`.
 */
export function createOAuthProvider(): OAuthProvider {
  return new OAuthProvider({
    apiHandlers: { "/mcp": mcpApiHandler },
    defaultHandler: authorizeHandler as any,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    scopesSupported: ["notebooklm:read", "notebooklm:write"],
    accessTokenTTL: ONE_HOUR_SECONDS,
    refreshTokenTTL: ONE_YEAR_SECONDS,
    clientRegistrationTTL: ONE_YEAR_SECONDS,
  });
}

/** Paths the OAuth provider owns. Everything else belongs to Astro. */
export function isOAuthPath(pathname: string): boolean {
  return (
    pathname === "/mcp" ||
    pathname === "/authorize" ||
    pathname === "/token" ||
    pathname === "/register" ||
    pathname.startsWith("/.well-known/oauth-")
  );
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
