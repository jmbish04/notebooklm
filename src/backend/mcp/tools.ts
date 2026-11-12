/**
 * @fileoverview The MCP tool surface, one-for-one with the REST API.
 *
 * Every tool here has a matching `/api/...` route, and both call the same
 * functions in `../tasks/service.ts`, so the two doors cannot drift.
 *
 * The async contract matters: `notebooklm_ask` returns a UUID straight away
 * because a NotebookLM query runs for 3-4 minutes. The client is expected to
 * call `notebooklm_check_task` with that UUID rather than hold a request open.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Db } from "../db/client";

import { TASK_STATUSES } from "../db/schema";
import { createTask, getTaskWithEvents, listTasks } from "../tasks/service";

/** Shape every tool returns: MCP content blocks wrapping JSON. */
function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Build the MCP server exposing the task API.
 *
 * @param db - Drizzle client bound to this request's D1
 */
export function buildMcpServer(db: Db): McpServer {
  const server = new McpServer(
    { name: "notebooklm", version: "1.0.0" },
    {
      instructions:
        "Ask questions of a NotebookLM notebook. Queries are long-running " +
        "(typically 3-4 minutes), so notebooklm_ask returns a task UUID " +
        "immediately instead of an answer. Poll notebooklm_check_task with " +
        "that UUID until `done` is true; the answer is then in `result`.",
    },
  );

  server.registerTool(
    "notebooklm_ask",
    {
      title: "Ask NotebookLM",
      description:
        "Queue a question against a NotebookLM notebook. Returns a task UUID " +
        "immediately — it does NOT return the answer. NotebookLM takes about " +
        "3-4 minutes. Poll notebooklm_check_task with the returned UUID.",
      inputSchema: {
        notebook_id: z.string().min(1).describe("NotebookLM notebook ID to query"),
        question: z.string().min(1).describe("The question to ask the notebook"),
      },
    },
    async ({ notebook_id, question }) => {
      const task = await createTask(db, {
        notebookId: notebook_id,
        question,
        source: "mcp",
      });
      return json({
        task_id: task.id,
        status: task.status,
        message:
          "Task queued. Poll notebooklm_check_task with this task_id; " +
          "expect roughly 3-4 minutes.",
      });
    },
  );

  server.registerTool(
    "notebooklm_check_task",
    {
      title: "Check NotebookLM task",
      description:
        "Check in on a queued NotebookLM task by its UUID. Returns the current " +
        "status, the progress history, and — once `done` is true — the answer " +
        "in `result` (or the reason in `error`).",
      inputSchema: {
        task_id: z.string().uuid().describe("UUID returned by notebooklm_ask"),
      },
    },
    async ({ task_id }) => {
      const task = await getTaskWithEvents(db, task_id);
      if (!task) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `No task with id ${task_id}` }],
        };
      }
      return json(task);
    },
  );

  server.registerTool(
    "notebooklm_list_tasks",
    {
      title: "List NotebookLM tasks",
      description: "List recent NotebookLM tasks, newest first.",
      inputSchema: {
        status: z.enum(TASK_STATUSES).optional().describe("Filter by status"),
        limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)"),
      },
    },
    async ({ status, limit }) => json(await listTasks(db, { status, limit })),
  );

  return server;
}
