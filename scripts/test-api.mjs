#!/usr/bin/env node
/**
 * @fileoverview End-to-end test against the deployed API and MCP endpoint.
 *
 * Runs against the real Worker, not a mock, and covers the same surface MCP
 * tooling gets — the REST routes and the MCP tools call the same service
 * functions, so proving one proves the contract of both.
 *
 * Usage:
 *   node scripts/test-api.mjs [baseUrl]
 *
 * The API key comes from the tokens CLI via the scaffolded SDK. Nothing here
 * reads a .env or takes a pasted credential.
 */

import { requireSecret } from "./tokens.mjs";

const BASE = (process.argv[2] ?? "https://notebooklm.hacolby.workers.dev").replace(/\/$/, "");
const API_KEY = requireSecret("WORKER_API_KEY");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const authed = (extra = {}) => ({
  authorization: `Bearer ${API_KEY}`,
  "content-type": "application/json",
  ...extra,
});

/** POST a JSON-RPC message to /mcp and return the parsed result. */
async function mcp(method, params, { key = API_KEY } = {}) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

console.log(`Testing ${BASE}\n${"=".repeat(60)}`);

// --- Health -----------------------------------------------------------------
section("Health");
{
  const response = await fetch(`${BASE}/api/health`);
  const body = await response.json();
  check("GET /api/health responds", response.status === 200 || response.status === 503);
  check("D1 reachable", body.checks?.d1 === "ok", body.checks?.d1);
  check("WORKER_API_KEY resolves", body.checks?.secrets === "ok", body.checks?.secrets);
  check("OAuth KV bound", body.checks?.oauth_kv === "ok", body.checks?.oauth_kv);
  check("Code Mode loader bound", body.checks?.code_mode === "ok", body.checks?.code_mode);
}

// --- Auth is actually enforced ----------------------------------------------
section("Authentication");
{
  const anon = await fetch(`${BASE}/api/tasks`);
  check("GET /api/tasks without a key is 401", anon.status === 401, `got ${anon.status}`);

  const wrong = await fetch(`${BASE}/api/tasks`, {
    headers: { authorization: "Bearer definitely-not-the-key" },
  });
  check("GET /api/tasks with a wrong key is 401", wrong.status === 401, `got ${wrong.status}`);

  const ok = await fetch(`${BASE}/api/tasks`, { headers: authed() });
  check("GET /api/tasks with the key is 200", ok.status === 200, `got ${ok.status}`);

  const page = await fetch(`${BASE}/`, { redirect: "manual" });
  check(
    "unauthenticated page redirects to /login",
    page.status === 302 && (page.headers.get("location") ?? "").startsWith("/login"),
    `got ${page.status} ${page.headers.get("location") ?? ""}`,
  );

  const bad = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passcode: "wrong" }),
  });
  check("wrong passcode is rejected", bad.status === 401, `got ${bad.status}`);

  const good = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passcode: API_KEY }),
  });
  const cookie = good.headers.get("set-cookie") ?? "";
  check("correct passcode is accepted", good.status === 200, `got ${good.status}`);
  check("session cookie is set", cookie.includes("nblm_session="));
  check("session cookie lasts 60 days", cookie.includes(`Max-Age=${60 * 24 * 60 * 60}`), cookie);
  check("session cookie is HttpOnly", cookie.includes("HttpOnly"));
  check("session cookie is Secure", cookie.includes("Secure"));
}

// --- Task lifecycle ---------------------------------------------------------
section("Task lifecycle (async check-in)");
let taskId;
{
  const created = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({
      notebook_id: "test-notebook",
      question: "What does the async task flow look like?",
    }),
  });
  const body = await created.json();
  taskId = body.task_id;

  check("POST /api/tasks returns 201", created.status === 201, `got ${created.status}`);
  check("a task UUID comes back immediately", /^[0-9a-f-]{36}$/.test(taskId ?? ""), taskId);
  check("new task starts queued", body.status === "queued", body.status);

  const missingField = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ question: "no notebook id" }),
  });
  check(
    "missing notebook_id is rejected",
    missingField.status === 400,
    `got ${missingField.status}`,
  );
}

{
  const response = await fetch(`${BASE}/api/tasks/${taskId}`, { headers: authed() });
  const body = await response.json();
  check("check-in by UUID works", response.status === 200, `got ${response.status}`);
  check("check-in reports not done yet", body.done === false, String(body.done));
  check("check-in includes progress history", Array.isArray(body.events) && body.events.length > 0);

  const unknown = await fetch(`${BASE}/api/tasks/00000000-0000-0000-0000-000000000000`, {
    headers: authed(),
  });
  check("unknown UUID is 404", unknown.status === 404, `got ${unknown.status}`);
}

// --- Runner flow ------------------------------------------------------------
section("Runner flow");
{
  const claim = await fetch(`${BASE}/api/runner/claim`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ runner_id: "test-runner" }),
  });
  const body = await claim.json();
  check("a runner can claim queued work", claim.status === 200, `got ${claim.status}`);
  check("claimed task is now running", body.task?.status === "running", body.task?.status);

  const progress = await fetch(`${BASE}/api/runner/${body.task?.id}/progress`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ message: "Querying the notebook…" }),
  });
  check("a runner can post progress", progress.status === 200, `got ${progress.status}`);

  const complete = await fetch(`${BASE}/api/runner/${body.task?.id}/complete`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ status: "succeeded", result: "The answer." }),
  });
  check("a runner can complete a task", complete.status === 200, `got ${complete.status}`);

  const again = await fetch(`${BASE}/api/runner/${body.task?.id}/complete`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ status: "failed", error: "should not overwrite" }),
  });
  check("completing a finished task is refused", again.status === 409, `got ${again.status}`);

  const finished = await fetch(`${BASE}/api/tasks/${body.task?.id}`, { headers: authed() });
  const finishedBody = await finished.json();
  check("finished task reports done", finishedBody.done === true, String(finishedBody.done));
  check("the answer is readable", finishedBody.result === "The answer.", finishedBody.result);

  const anonClaim = await fetch(`${BASE}/api/runner/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  check(
    "runner endpoints reject anonymous callers",
    anonClaim.status === 401,
    `got ${anonClaim.status}`,
  );
}

// --- CSRF handling ----------------------------------------------------------
section("CSRF");
{
  // Regression: Astro's built-in origin check used to 403 an authenticated API
  // client that did not send `content-type: application/json`.
  const noContentType = await fetch(`${BASE}/api/runner/claim`, {
    method: "POST",
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  check(
    "an API-key POST without a content-type is allowed",
    noContentType.status === 200,
    `got ${noContentType.status}`,
  );

  const formEncoded = await fetch(`${BASE}/api/runner/claim`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  check(
    "an API-key POST with a form content-type is allowed",
    formEncoded.status === 200,
    `got ${formEncoded.status}`,
  );

  const crossSite = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ passcode: API_KEY }),
  });
  check(
    "a cross-origin cookie-auth POST is rejected",
    crossSite.status === 403,
    `got ${crossSite.status}`,
  );
}

// --- MCP --------------------------------------------------------------------
section("MCP endpoint");
{
  const anon = await mcp(
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
    { key: "not-the-key" },
  );
  check("MCP rejects a bad credential", anon.status === 401, `got ${anon.status}`);

  const init = await mcp("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  check("MCP accepts the API key", init.status === 200, `got ${init.status}`);
  check(
    "MCP initialize returns server info",
    init.body?.result?.serverInfo?.name !== undefined,
    JSON.stringify(init.body).slice(0, 200),
  );

  const tools = await mcp("tools/list", {});
  const names = (tools.body?.result?.tools ?? []).map((t) => t.name);
  check("tools/list responds", tools.status === 200, `got ${tools.status}`);
  check(
    "Code Mode exposes a single `code` tool",
    names.length === 1 && names[0] === "code",
    `tools: ${names.join(", ")}`,
  );
  check(
    "the code tool documents the underlying methods",
    JSON.stringify(tools.body).includes("notebooklm_ask"),
    "notebooklm_ask not mentioned in the code tool description",
  );
}

// --- OAuth ------------------------------------------------------------------
section("OAuth (1-year authorization)");
{
  const meta = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
  const body = await meta.json();
  check("authorization server metadata is published", meta.status === 200, `got ${meta.status}`);
  check("authorize endpoint advertised", typeof body.authorization_endpoint === "string");
  check("token endpoint advertised", typeof body.token_endpoint === "string");
  check("dynamic client registration advertised", typeof body.registration_endpoint === "string");

  const resource = await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`);
  check(
    "protected resource metadata is published",
    resource.status === 200,
    `got ${resource.status}`,
  );

  const registered = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "test client",
      redirect_uris: ["http://localhost:9999/callback"],
      token_endpoint_auth_method: "none",
    }),
  });
  const client = await registered.json();
  check("a client can register", registered.status === 201, `got ${registered.status}`);

  const authorize = await fetch(
    `${BASE}/authorize?response_type=code&client_id=${encodeURIComponent(
      client.client_id ?? "",
    )}&redirect_uri=${encodeURIComponent(
      "http://localhost:9999/callback",
    )}&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`,
  );
  const page = await authorize.text();
  check("authorize serves a passcode page", authorize.status === 200, `got ${authorize.status}`);
  check("the page asks for a passcode", page.includes("Access passcode"));
  check(
    "the page does not name the backing secret",
    !page.includes("WORKER_API_KEY"),
    "the passcode page leaked the binding name",
  );
  check("the page states the one-year validity", page.includes("one year"));
}

// --- Code Mode actually executes -------------------------------------------
section("Code Mode execution");
{
  // The whole point of Code Mode: the model writes one script that chains
  // several tool calls, and it runs in an isolated Dynamic Worker.
  const code = `
    const created = await codemode.notebooklm_ask({
      notebook_id: "codemode-test",
      question: "Does Code Mode chain calls?",
    });
    const id = (typeof created === "string" ? JSON.parse(created) : created).task_id;
    const checked = await codemode.notebooklm_check_task({ task_id: id });
    const parsed = typeof checked === "string" ? JSON.parse(checked) : checked;
    return { id, status: parsed.status, events: parsed.events.length };
  `;

  const response = await mcp("tools/call", {
    name: "code",
    arguments: { code },
  });

  const text = response.body?.result?.content?.[0]?.text ?? "";
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }

  check("the code tool runs generated code", response.status === 200, `got ${response.status}`);
  check(
    "generated code is not reported as an error",
    response.body?.result?.isError !== true,
    text.slice(0, 200),
  );
  check(
    "sandboxed code created a real task",
    /^[0-9a-f-]{36}$/.test(payload.id ?? ""),
    text.slice(0, 200),
  );
  check(
    "sandboxed code chained a second call",
    payload.status === "queued",
    String(payload.status),
  );
  check("the chained call saw persisted history", payload.events >= 1, String(payload.events));
}

// --- Full OAuth flow --------------------------------------------------------
section("OAuth end-to-end");
{
  const base64url = (bytes) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  const redirectUri = "http://localhost:9999/callback";

  const registered = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "e2e client",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    }),
  });
  const client = await registered.json();

  const authorizeUrl =
    `${BASE}/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(client.client_id)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;

  const page = await (await fetch(authorizeUrl)).text();
  const state = /name="state" value="([^"]+)"/.exec(page)?.[1];
  check("the passcode form carries the request state", Boolean(state));

  // Wrong passcode must not mint a code.
  const refused = await fetch(`${BASE}/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ state, passcode: "wrong-passcode" }),
    redirect: "manual",
  });
  check("a wrong passcode does not authorize", refused.status === 401, `got ${refused.status}`);

  const approved = await fetch(`${BASE}/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ state, passcode: API_KEY }),
    redirect: "manual",
  });
  const location = approved.headers.get("location") ?? "";
  const authCode = new URL(location, BASE).searchParams.get("code");
  check(
    "the correct passcode redirects back to the client",
    approved.status === 302,
    `got ${approved.status}`,
  );
  check("an authorization code is issued", Boolean(authCode), location);

  const tokenResponse = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode ?? "",
      redirect_uri: redirectUri,
      client_id: client.client_id,
      code_verifier: verifier,
    }),
  });
  const token = await tokenResponse.json();

  check(
    "the code exchanges for a token",
    tokenResponse.status === 200,
    JSON.stringify(token).slice(0, 200),
  );
  check("an access token is returned", typeof token.access_token === "string");
  check("a refresh token is returned", typeof token.refresh_token === "string");

  // The grant — not the access token — is what lasts a year.
  const oauthInit = await mcp(
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "oauth", version: "1.0.0" },
    },
    { key: token.access_token },
  );
  check(
    "the OAuth token authenticates against /mcp",
    oauthInit.status === 200,
    `got ${oauthInit.status}`,
  );

  const refreshed = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: client.client_id,
    }),
  });
  const refreshedToken = await refreshed.json();
  check(
    "the refresh token mints a new access token",
    refreshed.status === 200 && Boolean(refreshedToken.access_token),
    JSON.stringify(refreshedToken).slice(0, 200),
  );

  const refreshedUse = await mcp(
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "oauth", version: "1.0.0" },
    },
    { key: refreshedToken.access_token },
  );
  check(
    "the refreshed token also works",
    refreshedUse.status === 200,
    `got ${refreshedUse.status}`,
  );
}

console.log(`\n${"=".repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
