import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { WorkerEntrypoint } from "cloudflare:workers";

export default class NotebookLMService extends WorkerEntrypoint {
  async fetch(request: Request) {
    const app = new OpenAPIHono();

    app.doc31("/openapi.json", {
      openapi: "3.1.0",
      info: {
        version: "1.0.0",
        title: "NotebookLM Power Client API",
      },
    });

    app.get("/swagger", swaggerUI({ url: "/openapi.json" }));
    app.get("/scaler", apiReference({ spec: { url: "/openapi.json" } }));

    // Define routes here
    const healthRoute = createRoute({
      method: "get",
      path: "/health",
      operationId: "getHealth",
      responses: {
        200: {
          description: "Health check",
          content: {
            "application/json": {
              schema: z.object({
                status: z.string(),
              }),
            },
          },
        },
      },
    });

    app.openapi(healthRoute, (c) => c.json({ status: "ok" }));

    app.post("/chat", async (c) => {
      const id = c.env.HoniAgent.idFromName("default");
      const obj = c.env.HoniAgent.get(id);
      return obj.fetch(c.req.raw);
    });

    return app.fetch(request, this.env, this.ctx);
  }

  // RPC methods
  async createNotebook(_params: unknown) {
    // implementation
    return { success: true };
  }

  async uploadDocument(_notebookId: string, _file: unknown) {
    // implementation
    return { success: true };
  }

  async queryNotebook(_notebookId: string, _query: string) {
    // implementation
    return { success: true };
  }
}

import { honiAgent } from "./agents/honi";

export class HoniWorkspaceAgent {
  state: DurableObjectState;
  env: Env;
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    return honiAgent(request, this.env);
  }
}
