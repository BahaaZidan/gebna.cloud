import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

export const REQUEST_ID_HEADER = "x-request-id";

const MAX_REQUEST_ID_LENGTH = 200;

export function createRequestId(): string {
  return randomUUID();
}

export function readRequestIdHeader(headers: IncomingHttpHeaders): string | null {
  const headerValue = headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (candidate === undefined) {
    return null;
  }

  const normalizedValue = candidate.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue.length > MAX_REQUEST_ID_LENGTH) {
    return null;
  }

  return normalizedValue;
}

export function getOrCreateRequestId(request: IncomingMessage): string {
  return readRequestIdHeader(request.headers) ?? createRequestId();
}

export function applyRequestId(
  request: IncomingMessage,
  response: ServerResponse,
): string {
  const requestId = getOrCreateRequestId(request);
  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}
