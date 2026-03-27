import type { IncomingMessage, ServerResponse } from "node:http";

import type { AppEnv } from "./config/env.js";
import { applyRequestId } from "./http/request-id.js";
import { INVALID_REQUEST_ERROR, mapErrorToHttpResponse } from "./http/errors.js";
import { isAuthorized, UNAUTHORIZED_ERROR } from "./http/auth.js";
import { readJsonBody, sendJson } from "./http/json.js";
import { parseSendRequestBody } from "./http/send-schema.js";
import { createLogger } from "./lib/logger.js";
import { sendMessage } from "./services/send.js";
import { createOutboundTransportConfig } from "./services/transport-config.js";

const logger = createLogger();

function handleHealthCheck(response: ServerResponse): void {
  sendJson(response, 200, { ok: true });
}

async function handleSendRequest(
  env: AppEnv,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
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

export function createAppHandler(env: AppEnv) {
  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const requestId = applyRequestId(request, response);
    const startedAt = process.hrtime.bigint();

    try {
      if (request.method === "GET" && request.url === "/healthz") {
        handleHealthCheck(response);
        return;
      }

      if (request.method === "POST" && request.url === "/send") {
        try {
          await handleSendRequest(env, request, response);
        } catch (error) {
          const mappedError = mapErrorToHttpResponse(error);
          sendJson(response, mappedError.statusCode, mappedError.body);
        }

        return;
      }

      sendJson(response, 404, { error: { code: "NOT_FOUND" } });
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.info("request.completed", {
        durationMs,
        method: request.method ?? "UNKNOWN",
        path: request.url ?? "",
        requestId,
        statusCode: response.statusCode,
      });
    }
  };
}
