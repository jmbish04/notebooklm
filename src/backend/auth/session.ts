/**
 * @fileoverview Browser session cookie: issue, verify, clear.
 *
 * There is one shared passcode for this app and it is never stored in, or
 * derivable from, the cookie. On a correct passcode the browser gets a signed
 * cookie good for 60 days; every later request is authorised by verifying that
 * signature, so the passcode is asked for exactly once per browser per 60 days.
 *
 * The cookie is `<expiry>.<hmac>`. The HMAC is over the expiry using the shared
 * secret as the key, so a client cannot extend its own expiry, and a rotated
 * secret invalidates every outstanding cookie. There is no session table to
 * read, which keeps the auth check off D1 entirely.
 */

import { getWorkerApiKey } from "../utils/secrets";

/** Cookie name. Deliberately generic — it names the app, not the credential. */
export const SESSION_COOKIE = "nblm_session";

/** 60 days, in seconds. */
export const SESSION_MAX_AGE = 60 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-safe, non-short-circuiting string compare. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Check a submitted passcode against the shared secret.
 *
 * @param env - Worker env
 * @param passcode - Value the user typed
 */
export async function isValidPasscode(env: unknown, passcode: string): Promise<boolean> {
  if (!passcode) return false;
  const expected = await getWorkerApiKey(env);
  return timingSafeEqual(passcode, expected);
}

/**
 * Mint a signed session token valid for {@link SESSION_MAX_AGE}.
 *
 * @param env - Worker env
 * @returns Cookie value of the form `<expiryEpochSeconds>.<hmac>`
 */
export async function createSessionToken(env: unknown): Promise<string> {
  const secret = await getWorkerApiKey(env);
  const expiry = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${expiry}.${await hmac(secret, String(expiry))}`;
}

/**
 * Verify a session token's signature and expiry.
 *
 * @param env - Worker env
 * @param token - Raw cookie value, or `undefined` when the cookie is absent
 */
export async function verifySessionToken(
  env: unknown,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const [expiryPart, signature] = token.split(".");
  if (!expiryPart || !signature) return false;

  const expiry = Number(expiryPart);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;

  const secret = await getWorkerApiKey(env);
  return timingSafeEqual(signature, await hmac(secret, expiryPart));
}

/** `Set-Cookie` value that installs a fresh 60-day session. */
export function sessionCookieHeader(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
  ].join("; ");
}

/** `Set-Cookie` value that clears the session. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
