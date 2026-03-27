import * as http from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppHandler } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import { MxLookupError, SmtpTemporaryError } from "../src/services/send.js";
import { createHttpServer, startHttpServer, stopHttpServer, type HttpServer } from "../src/server.js";

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

vi.mock("../src/services/send.js", async () => {
  const actual = await vi.importActual<typeof import("../src/services/send.js")>(
    "../src/services/send.js",
  );

  return {
    ...actual,
    sendMessage: sendMessageMock,
  };
});

const testEnv: AppEnv = {
  DKIM_PRIVATE_KEY: "test-private-key",
  DKIM_SELECTOR: "mail",
  OUTBOUND_API_SECRET: "top-secret",
  OUTBOUND_EHLO_HOSTNAME: "mail.gebna.net",
  OUTBOUND_FROM_DOMAIN: "gebna.net",
  OUTBOUND_RETURN_PATH: "bounce@gebna.net",
  PORT: 0,
  SEND_TIMEOUT_MS: 30000,
};

async function requestJson(
  server: HttpServer,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    method: string;
    path: string;
  },
): Promise<{ body: unknown; headers: http.IncomingHttpHeaders; statusCode: number }> {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Server is not listening on a TCP port.");
  }

  const requestBody =
    options.body === undefined ? undefined : JSON.stringify(options.body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        headers: {
          ...(requestBody === undefined
            ? {}
            : {
                "content-length": Buffer.byteLength(requestBody).toString(),
                "content-type": "application/json",
              }),
          ...options.headers,
        },
        host: "127.0.0.1",
        method: options.method,
        path: options.path,
        port: address.port,
      },
      (response: http.IncomingMessage) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");

          resolve({
            body: text.length === 0 ? null : (JSON.parse(text) as unknown),
            headers: response.headers,
            statusCode: response.statusCode ?? 0,
          });
        });
      },
    );

    request.on("error", reject);

    if (requestBody !== undefined) {
      request.write(requestBody);
    }

    request.end();
  });
}

describe("POST /send", () => {
  let server: HttpServer;

  beforeEach(async () => {
    sendMessageMock.mockReset();
    server = createHttpServer(createAppHandler(testEnv));
    await startHttpServer(server, 0);
  });

  afterEach(async () => {
    await stopHttpServer(server);
  });

  it("rejects requests with a missing secret", async () => {
    const response = await requestJson(server, {
      body: {
        subject: "Hello",
        text: "Body",
        to: "user@example.com",
      },
      method: "POST",
      path: "/send",
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Unauthorized.",
      },
    });
  });

  it("rejects invalid request bodies", async () => {
    const response = await requestJson(server, {
      body: {
        subject: "Hello",
        to: "user@example.com",
      },
      headers: {
        "x-api-secret": "top-secret",
      },
      method: "POST",
      path: "/send",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid request.",
      },
    });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("returns success for a valid request", async () => {
    sendMessageMock.mockResolvedValue({
      deliveries: [],
      success: true,
    });

    const response = await requestJson(server, {
      body: {
        from: "sender@gebna.net",
        subject: "Hello",
        text: "Body",
        to: "user@example.com",
      },
      headers: {
        "x-api-secret": "top-secret",
      },
      method: "POST",
      path: "/send",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      deliveries: [],
      success: true,
    });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("maps MX lookup failures to HTTP 502", async () => {
    sendMessageMock.mockRejectedValue(new MxLookupError("lookup failed"));

    const response = await requestJson(server, {
      body: {
        subject: "Hello",
        text: "Body",
        to: "user@example.com",
      },
      headers: {
        "x-api-secret": "top-secret",
      },
      method: "POST",
      path: "/send",
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "MX_LOOKUP_FAILED",
        message: "MX lookup failed.",
      },
    });
  });

  it("maps temporary SMTP failures to HTTP 502", async () => {
    sendMessageMock.mockRejectedValue(new SmtpTemporaryError("temporary failure"));

    const response = await requestJson(server, {
      body: {
        subject: "Hello",
        text: "Body",
        to: "user@example.com",
      },
      headers: {
        "x-api-secret": "top-secret",
      },
      method: "POST",
      path: "/send",
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "SMTP_TEMPORARY_FAILURE",
        message: "Temporary SMTP failure.",
      },
    });
  });
});
