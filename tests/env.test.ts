import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadEnv } from "../src/config/env.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 1024,
});

const pemPrivateKey = privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString("utf8");
const normalizedPemPrivateKey = pemPrivateKey.trim();

function createBaseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    DKIM_PRIVATE_KEY: pemPrivateKey,
    DKIM_SELECTOR: "s1",
    OUTBOUND_API_SECRET: "top-secret",
    OUTBOUND_EHLO_HOSTNAME: "mail.gebna.net",
    OUTBOUND_FROM_DOMAIN: "gebna.net",
    OUTBOUND_RETURN_PATH: "bounces@gebna.net",
    PORT: "3000",
    SEND_TIMEOUT_MS: "30000",
    ...overrides,
  };
}

describe("loadEnv", () => {
  it("accepts a real multiline DKIM private key", () => {
    const env = loadEnv(createBaseEnv());

    expect(env.DKIM_PRIVATE_KEY).toBe(normalizedPemPrivateKey);
  });

  it("normalizes escaped newline DKIM private keys", () => {
    const escapedPemPrivateKey = pemPrivateKey.replace(/\n/g, "\\n");

    const env = loadEnv(
      createBaseEnv({
        DKIM_PRIVATE_KEY: escapedPemPrivateKey,
      }),
    );

    expect(env.DKIM_PRIVATE_KEY).toBe(normalizedPemPrivateKey);
  });

  it("normalizes quoted escaped newline DKIM private keys", () => {
    const escapedPemPrivateKey = pemPrivateKey.replace(/\n/g, "\\n");

    const env = loadEnv(
      createBaseEnv({
        DKIM_PRIVATE_KEY: `"${escapedPemPrivateKey}"`,
      }),
    );

    expect(env.DKIM_PRIVATE_KEY).toBe(normalizedPemPrivateKey);
  });

  it("normalizes single-quoted escaped newline DKIM private keys", () => {
    const escapedPemPrivateKey = pemPrivateKey.replace(/\n/g, "\\n");

    const env = loadEnv(
      createBaseEnv({
        DKIM_PRIVATE_KEY: `'${escapedPemPrivateKey}'`,
      }),
    );

    expect(env.DKIM_PRIVATE_KEY).toBe(normalizedPemPrivateKey);
  });

  it("normalizes CRLF DKIM private keys", () => {
    const crlfPemPrivateKey = pemPrivateKey.trim().replace(/\n/g, "\r\n");

    const env = loadEnv(
      createBaseEnv({
        DKIM_PRIVATE_KEY: crlfPemPrivateKey,
      }),
    );

    expect(env.DKIM_PRIVATE_KEY).toBe(normalizedPemPrivateKey);
  });

  it("rejects invalid DKIM private keys at startup", () => {
    expect(() =>
      loadEnv(
        createBaseEnv({
          DKIM_PRIVATE_KEY:
            '"-----BEGIN PRIVATE KEY-----\\nnot-a-real-key\\n-----END PRIVATE KEY-----"',
        }),
      ),
    ).toThrowError("Invalid DKIM_PRIVATE_KEY: expected a valid PEM private key.");
  });
});
