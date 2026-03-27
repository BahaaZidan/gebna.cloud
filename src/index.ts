import type { IncomingMessage, ServerResponse } from "node:http";

import { loadEnv } from "./config/env.js";
import { applyRequestId } from "./http/request-id.js";
import { createHttpServer, startHttpServer } from "./server.js";

function handleHealthCheck(response: ServerResponse): void {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ ok: true }));
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  applyRequestId(request, response);

  if (request.method === "GET" && request.url === "/healthz") {
    handleHealthCheck(response);
    return;
  }

  response.statusCode = 404;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
}

async function main(): Promise<void> {
  const env = loadEnv();
  const server = createHttpServer(handleRequest);
  const port = env.PORT ?? 3000;

  await startHttpServer(server, port);
}

void main();
