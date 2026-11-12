/**
 * @fileoverview Serves the MCP endpoint over Streamable HTTP, in Code Mode.
 *
 * ## Code Mode
 *
 * Rather than advertising every tool, the server is wrapped by
 * `codeMcpServer` from `@cloudflare/codemode`, which collapses them into a
 * single `code` tool. The client writes JavaScript calling typed `codemode.*`
 * methods; that code runs inside an isolated Dynamic Worker via the `LOADER`
 * binding. Two things fall out of this: tool definitions stop consuming the
 * model's context window, and the generated code never sees our bindings or
 * secrets — connector calls cross the sandbox boundary over RPC.
 *
 * ## Transport
 *
 * `WebStandardStreamableHTTPServerTransport` speaks Request/Response, so it
 * runs directly on Workers with no Node shim and no Durable Object. It is used
 * in stateless mode (`sessionIdGenerator: undefined`): each request builds a
 * server, answers, and tears down. Our tools are all short request/response
 * calls — the long work is deliberately pushed onto the task queue — so there
 * is no session state worth keeping warm.
 */

import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { codeMcpServer } from "@cloudflare/codemode/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { getDb } from "../db/client";
import { buildMcpServer } from "./tools";

/**
 * Handle one MCP request.
 *
 * Authentication has already happened upstream — see `../oauth/provider.ts`
 * for the OAuth door and `../auth/api-key.ts` for the API-key door.
 *
 * @param request - The MCP request (POST for JSON-RPC, GET/DELETE for stream control)
 * @param env - Worker env carrying `DB` and `LOADER`
 */
export async function handleMcpRequest(
  request: Request,
  env: { DB: D1Database; LOADER?: unknown },
): Promise<Response> {
  const base = buildMcpServer(getDb(env));

  // Code Mode needs the Dynamic Worker loader to sandbox generated code. If the
  // binding is missing, serve the plain tool list rather than failing the
  // request — a degraded MCP server still works, a 500 does not.
  const server = env.LOADER
    ? await codeMcpServer({
        server: base,
        executor: new DynamicWorkerExecutor({ loader: env.LOADER as never }),
      })
    : base;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    // Stateless: nothing survives the request.
    await transport.close().catch(() => {});
  }
}
