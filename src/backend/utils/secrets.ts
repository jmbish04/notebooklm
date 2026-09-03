/**
 * secrets.ts — Canonical Cloudflare Worker secret accessor for the Colby ecosystem.
 *
 * Scaffold into a worker with:
 *   tokens agent-onboarding --scaffold-worker src/backend/utils/secrets.ts
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * A Worker "secret" is not one thing. There are three shapes, and they do not
 * share an API:
 *
 *   1. Secrets Store binding  → `await env.NAME.get()`   (async, an object)
 *   2. `wrangler secret put`  → `env.NAME`               (sync, a plain string)
 *   3. `.dev.vars` local dev  → `env.NAME`               (sync, a plain string)
 *
 * Every accessor here is `secretStore ?? plainEnv`: the Secrets Store wins,
 * plain strings are the local-dev / legacy fallback. That means the same call
 * site works in `wrangler dev` and in production without a branch.
 *
 * ── Naming contract ───────────────────────────────────────────────────────────
 * The binding name here is the SAME name the secret has in the local `tokens`
 * CLI. Verify it exists before you write the call site:
 *
 *   tokens find anthropic        # names only, no values
 *
 * Declare it in `wrangler.jsonc`:
 *
 *   "secrets_store_secrets": [
 *     {
 *       "binding": "ANTHROPIC_API_KEY",
 *       "store_id": "8c42fa70938644e0a8a109744467375f",
 *       "secret_name": "ANTHROPIC_API_KEY"
 *     }
 *   ]
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { requireSecret, getSecret } from "@/backend/utils/secrets";
 *
 *   const key = await requireSecret(env, "ANTHROPIC_API_KEY"); // throws if absent
 *   const opt = await getSecret(env, "SENTRY_DSN");            // undefined if absent
 */

// ponytail: per-isolate cache. A rotated secret is pinned until the isolate
// recycles — call clearSecretCache() from a rotation webhook if that matters.
const _cache = new Map<string, string>();

/**
 * Reads a Secrets Store binding (`await env.NAME.get()`).
 *
 * @param env - Worker env carrying the Secrets Store bindings
 * @param binding - Binding name as declared in `wrangler.jsonc`
 * @returns The secret value, or `undefined` when the binding is absent or is
 *   not a Secrets Store binding (e.g. a plain string in local dev)
 */
export async function getSecretStoreBinding(
  env: unknown,
  binding: string,
): Promise<string | undefined> {
  const value = (env as Record<string, any>)?.[binding];
  if (value && typeof value.get === "function") {
    const resolved = await value.get();
    return typeof resolved === "string" && resolved.length > 0 ? resolved : undefined;
  }
  return undefined;
}

/**
 * Reads a plain env var / `vars` entry / `wrangler secret put` value (sync).
 *
 * @param env - Worker env
 * @param binding - Env var name
 * @returns The string value, or `undefined` when unset or not a string
 */
export function getPlainEnv(env: unknown, binding: string): string | undefined {
  const value = (env as Record<string, any>)?.[binding];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Resolve a secret by name: Secrets Store first, plain env var as fallback.
 * Does not throw when absent.
 *
 * @param env - Worker env
 * @param name - Binding name (same name the secret has in the `tokens` CLI)
 * @returns The secret value, or `undefined`
 */
export async function getSecret(env: unknown, name: string): Promise<string | undefined> {
  const cached = _cache.get(name);
  if (cached !== undefined) return cached;

  const value = (await getSecretStoreBinding(env, name)) ?? getPlainEnv(env, name);
  if (value !== undefined) _cache.set(name, value);
  return value;
}

/**
 * Resolve a secret by name, throwing an actionable error when it is missing.
 *
 * @param env - Worker env
 * @param name - Binding name
 * @throws When neither a Secrets Store binding nor a plain env var resolves
 */
export async function requireSecret(env: unknown, name: string): Promise<string> {
  const value = await getSecret(env, name);
  if (!value) {
    throw new Error(
      `[secrets] '${name}' did not resolve.\n` +
        `  1. Confirm the local token exists:  tokens find ${name}\n` +
        `  2. Add the binding to wrangler.jsonc under "secrets_store_secrets" ` +
        `({ binding: "${name}", store_id: "...", secret_name: "${name}" })\n` +
        `  3. Regenerate types:  wrangler types`,
    );
  }
  return value;
}

/**
 * Resolve several secrets at once (missing ones come back `undefined`).
 */
export async function getSecrets(
  env: unknown,
  names: string[],
): Promise<Record<string, string | undefined>> {
  const values = await Promise.all(names.map((n) => getSecret(env, n)));
  return Object.fromEntries(names.map((n, i) => [n, values[i]]));
}

/**
 * Resolve several required secrets at once, throwing on the first one missing.
 */
export async function requireSecrets(
  env: unknown,
  names: string[],
): Promise<Record<string, string>> {
  const values = await Promise.all(names.map((n) => requireSecret(env, n)));
  return Object.fromEntries(names.map((n, i) => [n, values[i]]));
}

/** Clear the per-isolate secret cache (use after a rotation). */
export function clearSecretCache(): void {
  _cache.clear();
}

/**
 * Resolve the shared service credential, `WORKER_API_KEY`.
 *
 * This is the single credential this Worker authenticates against, for every
 * door: the browser passcode, MCP API-key auth, and the MCP OAuth passcode
 * screen. Backed by the `WORKER_API_KEY` Secrets Store binding declared in
 * `wrangler.jsonc`.
 *
 * @param env - Worker env
 * @throws When the binding does not resolve
 */
export async function getWorkerApiKey(env: unknown): Promise<string> {
  return requireSecret(env, "WORKER_API_KEY");
}
