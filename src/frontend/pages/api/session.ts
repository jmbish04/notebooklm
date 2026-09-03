/**
 * @fileoverview `/api/session` — exchange the passcode for a 60-day cookie.
 *
 * POST with `{ "passcode": "..." }` (or the equivalent form field). On success
 * the browser gets a signed session cookie and is not asked again for 60 days.
 * DELETE signs out.
 */

import type { APIRoute } from "astro";

import {
  clearSessionCookieHeader,
  createSessionToken,
  isValidPasscode,
  sessionCookieHeader,
} from "../../../backend/auth/session";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env;

  const contentType = request.headers.get("content-type") ?? "";
  let passcode = "";

  if (contentType.includes("application/json")) {
    passcode = String(((await request.json()) as any)?.passcode ?? "");
  } else {
    passcode = String((await request.formData()).get("passcode") ?? "");
  }

  if (!(await isValidPasscode(env, passcode))) {
    return new Response(JSON.stringify({ error: "Invalid passcode" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionCookieHeader(await createSessionToken(env)),
    },
  });
};

export const DELETE: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": clearSessionCookieHeader(),
    },
  });
