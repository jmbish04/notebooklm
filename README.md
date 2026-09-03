# NotebookLM task registry

A Cloudflare Worker that queues NotebookLM queries and lets callers check in on
them by UUID — over a REST API, or over MCP.

NotebookLM queries take three to four minutes, so nothing here makes a caller
wait. You submit a question, get a UUID back immediately, and poll that UUID
until the answer is ready.

**Live:** https://notebooklm.hacolby.workers.dev

---

## How a query flows

```
client ──POST /api/tasks (or MCP notebooklm_ask)──► Worker ──► D1 (status: queued)
                                                    │
                                     returns a UUID immediately
                                                    │
runner ──POST /api/runner/claim───────────────────► Worker ──► D1 (status: running)
       ──runs the NotebookLM query locally
       ──POST /api/runner/{id}/complete──────────► Worker ──► D1 (status: succeeded)
                                                    │
client ──GET /api/tasks/{uuid} (or notebooklm_check_task)──► answer
```

### Why there is a runner

NotebookLM authenticates through an interactive browser login — there is no
headless or API-key path. A Worker therefore cannot run a query itself. This
Worker is the registry and the front door: it queues work, records outcomes, and
serves both API and MCP clients. A runner process on a machine that holds a
NotebookLM session claims queued work and reports back.

The runner is not in this repository. The three endpoints it needs are, and they
are covered by the test suite.

---

## Authentication

One credential for everything: `WORKER_API_KEY`, read from a Cloudflare Secrets
Store binding via `src/backend/utils/secrets.ts`.

| Surface  | Accepted credential                                          |
| -------- | ------------------------------------------------------------ |
| Web UI   | Passcode once, then a signed cookie good for **60 days**      |
| REST API | `Authorization: Bearer <key>` (or `X-API-Key`), or the cookie |
| MCP      | The same bearer key, **or** OAuth                             |
| Runner   | Bearer key only                                               |

The browser cookie is `<expiry>.<hmac>`, signed with the shared secret. Nothing
is stored server-side, so the auth check never touches D1, and rotating the
secret invalidates every outstanding session.

### OAuth lasts a full year

Built on [`@cloudflare/workers-oauth-provider`][oap], with a passcode screen as
the consent step. Three TTLs all have to clear a year or the grant dies at
whichever expires first:

| Option                  | Library default | Here   | Why                                          |
| ----------------------- | --------------- | ------ | -------------------------------------------- |
| `refreshTokenTTL`       | 30 days         | 1 year | The grant lifetime — the actual answer.       |
| `clientRegistrationTTL` | 90 days         | 1 year | A registered client expiring kills the grant. |
| `accessTokenTTL`        | 1 hour          | 1 hour | Short by design; refreshed silently.          |

`clientRegistrationTTL` is the trap: left at its 90-day default, a "1 year"
grant quietly caps at 90 days because the client it belongs to is gone.

Access tokens stay short deliberately — Cloudflare's own guidance for agent and
CLI clients. The client refreshes without user interaction, so this costs the
user nothing and limits the damage from a leaked token. "Valid for a year" is a
property of the grant, not of any single access token.

[oap]: https://github.com/cloudflare/workers-oauth-provider

---

## MCP

Endpoint: `https://notebooklm.hacolby.workers.dev/mcp`

It runs in **Code Mode**. Instead of advertising every tool, the server exposes
a single `code` tool; the client writes JavaScript calling typed `codemode.*`
methods, and that code runs inside an isolated Dynamic Worker via the `LOADER`
binding. Tool schemas stop consuming the model's context window, and generated
code never sees the Worker's bindings or secrets — connector calls cross the
sandbox boundary over RPC.

The methods available inside that sandbox:

| Method                    | Does                                                 |
| ------------------------- | ---------------------------------------------------- |
| `notebooklm_ask`          | Queue a question. Returns a UUID, **not** an answer.  |
| `notebooklm_check_task`   | Check in on a UUID: status, history, and the answer.  |
| `notebooklm_list_tasks`   | List recent tasks, newest first.                      |

Transport is `WebStandardStreamableHTTPServerTransport`, stateless — plain
Request/Response, so no Durable Object and no Node shim.

---

## API

| Route                              | Method | Purpose                          |
| ---------------------------------- | ------ | -------------------------------- |
| `/api/health`                      | GET    | Dependency checks (public)       |
| `/api/session`                     | POST   | Passcode → 60-day cookie         |
| `/api/session`                     | DELETE | Sign out                         |
| `/api/tasks`                       | POST   | Queue a task, returns a UUID     |
| `/api/tasks`                       | GET    | List tasks (`?status=`, `?limit=`) |
| `/api/tasks/{uuid}`                | GET    | Check in on one task             |
| `/api/runner/claim`                | POST   | Runner claims the oldest queued  |
| `/api/runner/{uuid}/progress`      | POST   | Runner appends a progress note   |
| `/api/runner/{uuid}/complete`      | POST   | Runner reports the outcome       |

The MCP tools and these routes call the same functions in
`src/backend/tasks/service.ts`, so the two doors cannot drift.

---

## Database

D1 via Drizzle. Two tables: `tasks` and an append-only `task_events` history.

D1 bills by rows *scanned*, not rows returned, so every recurring query has an
index that lets SQLite `SEARCH` instead of `SCAN`:

| Query                                          | Index                         |
| ---------------------------------------------- | ----------------------------- |
| check in on one task (`WHERE id = ?`)          | primary key                   |
| runner poll (`status = ? ORDER BY created_at`) | `idx_tasks_status_created_at` |
| list recent (`ORDER BY created_at DESC`)       | `idx_tasks_created_at`        |
| a task's history                               | `idx_task_events_task_id_created_at` |

The composite index is ordered `(status, created_at)` deliberately: the equality
column must come first for the ordering column to be usable. Verify with
`EXPLAIN QUERY PLAN` — it must report `SEARCH ... USING INDEX`.

Indexes cost one extra written row per indexed write. A task row is written a
handful of times and read on every poll, so the trade is heavily favourable.

---

## Development

```bash
pnpm install
pnpm run dev
```

```bash
pnpm run db:generate      # generate a migration from the schema
pnpm run migrate:remote   # apply migrations to the deployed D1
pnpm run deploy           # build, migrate, deploy
pnpm test                 # run the suite against the deployed Worker
```

`pnpm test` reads `WORKER_API_KEY` from the `tokens` CLI — no `.env`, no pasted
credentials. Pass a base URL to test somewhere else:

```bash
node scripts/test-api.mjs http://localhost:4321
```

## Bindings

| Binding          | Type                | Purpose                          |
| ---------------- | ------------------- | -------------------------------- |
| `DB`             | D1                  | Task registry                    |
| `OAUTH_KV`       | KV                  | OAuth grants, clients, tokens    |
| `LOADER`         | Worker Loader       | Code Mode sandbox                |
| `WORKER_API_KEY` | Secrets Store       | The one credential               |
| `ASSETS`         | Assets              | Static files                     |
