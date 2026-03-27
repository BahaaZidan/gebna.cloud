import type { IncomingMessage, ServerResponse } from "node:http";

import { loadEnv } from "./config/env.js";
import { createHttpServer, startHttpServer } from "./server.js";

function handleRequest(
  _request: IncomingMessage,
  response: ServerResponse,
): void {
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
