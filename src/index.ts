import type { IncomingMessage, ServerResponse } from "node:http";

import { loadEnv } from "./config/env.js";
import { applyRequestId } from "./http/request-id.js";
import { INVALID_REQUEST_ERROR, INTERNAL_ERROR } from "./http/errors.js";
import { isAuthorized, UNAUTHORIZED_ERROR } from "./http/auth.js";
import { readJsonBody, sendJson } from "./http/json.js";
import { parseSendRequestBody } from "./http/send-schema.js";
import { createHttpServer, startHttpServer } from "./server.js";
import { sendMessage } from "./services/send.js";
import { createOutboundTransportConfig } from "./services/transport-config.js";

function handleHealthCheck(response: ServerResponse): void {
  sendJson(response, 200, { ok: true });
}

async function handleSendRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const env = loadEnv();

  if (!isAuthorized(request.headers, env.OUTBOUND_API_SECRET)) {
    sendJson(response, 401, UNAUTHORIZED_ERROR);
    return;
  }

  let requestBody: unknown;

  try {
    requestBody = await readJsonBody(request);
  } catch {
    sendJson(response, 400, INVALID_REQUEST_ERROR);
    return;
  }

  const parsedRequest = parseSendRequestBody(requestBody, env.OUTBOUND_FROM_DOMAIN);

  if (parsedRequest === null) {
    sendJson(response, 400, INVALID_REQUEST_ERROR);
    return;
  }

  const transportConfig = createOutboundTransportConfig(env);
  const result = await sendMessage(parsedRequest, transportConfig);

  sendJson(response, 200, result);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  applyRequestId(request, response);

  if (request.method === "GET" && request.url === "/healthz") {
    handleHealthCheck(response);
    return;
  }

  if (request.method === "POST" && request.url === "/send") {
    try {
      await handleSendRequest(request, response);
    } catch {
      sendJson(response, 500, INTERNAL_ERROR);
    }

    return;
  }

  sendJson(response, 404, { error: { code: "NOT_FOUND" } });
}

async function main(): Promise<void> {
  const server = createHttpServer(handleRequest);
  const env = loadEnv();
  const port = env.PORT ?? 3000;

  await startHttpServer(server, port);
}

void main();
