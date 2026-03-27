import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

const API_SECRET_HEADER = "x-api-secret";

export const UNAUTHORIZED_ERROR = {
  error: {
    code: "UNAUTHORIZED",
    message: "Unauthorized.",
  },
} as const;

function toComparableBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function readApiSecretHeader(headers: IncomingHttpHeaders): string | null {
  const headerValue = headers[API_SECRET_HEADER];
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (candidate === undefined) {
    return null;
  }

  const normalizedValue = candidate.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  return normalizedValue;
}

export function secretsMatch(candidate: string, expected: string): boolean {
  const candidateBuffer = toComparableBuffer(candidate);
  const expectedBuffer = toComparableBuffer(expected);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function isAuthorized(
  headers: IncomingHttpHeaders,
  expectedSecret: string,
): boolean {
  const providedSecret = readApiSecretHeader(headers);

  if (providedSecret === null) {
    return false;
  }

  return secretsMatch(providedSecret, expectedSecret);
}
