import * as http from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAppHandler } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import { createHttpServer, startHttpServer, stopHttpServer, type HttpServer } from "../src/server.js";

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

async function request(
  server: HttpServer,
  options: {
    headers?: Record<string, string>;
    method: string;
    path: string;
  },
): Promise<{ body: unknown; headers: http.IncomingHttpHeaders; statusCode: number }> {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Server is not listening on a TCP port.");
  }

  return new Promise((resolve, reject) => {
    const clientRequest = http.request(
      {
        headers: options.headers,
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

    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

describe("GET /healthz", () => {
  let server: HttpServer;

  beforeEach(async () => {
    server = createHttpServer(createAppHandler(testEnv));
    await startHttpServer(server, 0);
  });

  afterEach(async () => {
    await stopHttpServer(server);
  });

  it("responds successfully without authentication", async () => {
    const response = await request(server, {
      method: "GET",
      path: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });
});
