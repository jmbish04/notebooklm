import { createAgent, tool } from "honidev";
import { z } from "zod";

export const honiAgent = createAgent({
  name: "HoniWorkspaceAgent",
  model: "claude-3-5-sonnet", // Will be dynamic via ModelSelector
  systemPrompt: `You are Honi, an autonomous research assistant integrated with Google Workspace and NotebookLM.
Your goal is to help the user source documents, emails, and drive files, and seamlessly import them into NotebookLM for advanced querying.
When asked to find an email or document, use your Google Workspace tools. Present the findings to the user.
If the user asks to summarize or draft a reply, ask if they want to import the context into NotebookLM first for deeper analysis.
Always confirm before uploading large batches to NotebookLM.`,
  memory: {
    // We will bind D1 in the actual DO class instance via Env
    episodic: true,
  },
  tools: {
    search_workspace: tool({
      description: "Searches user's linked Google Workspace account (emails or drive).",
      parameters: z.object({
        query: z.string().describe("Search query"),
        type: z.enum(["email", "drive", "docs"]).describe("Type of document to search for"),
      }),
      execute: async ({ query, type }) => {
        // Mock implementation for now
        return { success: true, results: [`Found ${type} matching '${query}'`] };
      },
    }),
    batch_upload_notebooklm: tool({
      description: "Pipes fetched Workspace docs into the notebooklm-sdk backend.",
      parameters: z.object({
        notebook_id: z.string().describe("NotebookLM ID"),
        files: z.array(z.string()).describe("Array of file contents or references"),
      }),
      execute: async ({ notebook_id: _notebook_id, files }) => {
        return { success: true, uploaded: files.length };
      },
    }),
    draft_revision: tool({
      description:
        "Proposes edits to emails/docs using markdown diff syntax to trigger the frontend Diff Viewer.",
      parameters: z.object({
        original_text: z.string(),
        revised_text: z.string(),
      }),
      execute: async ({ original_text, revised_text }) => {
        // Return diff format
        return "```diff\n- " + original_text + "\n+ " + revised_text + "\n```";
      },
    }),
  },
});
