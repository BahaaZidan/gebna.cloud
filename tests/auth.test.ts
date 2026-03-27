import { describe, expect, it } from "vitest";

import {
  isAuthorized,
  readApiSecretHeader,
  secretsMatch,
  UNAUTHORIZED_ERROR,
} from "../src/http/auth.js";

describe("auth utilities", () => {
  it("returns the stable unauthorized payload", () => {
    expect(UNAUTHORIZED_ERROR).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Unauthorized.",
      },
    });
  });

  it("reads and trims the secret header", () => {
    expect(readApiSecretHeader({ "x-api-secret": "  secret-value  " })).toBe(
      "secret-value",
    );
  });

  it("treats missing and blank secrets as absent", () => {
    expect(readApiSecretHeader({})).toBeNull();
    expect(readApiSecretHeader({ "x-api-secret": "   " })).toBeNull();
  });

  it("matches equal secrets and rejects different secrets", () => {
    expect(secretsMatch("shared-secret", "shared-secret")).toBe(true);
    expect(secretsMatch("shared-secret", "wrong-secret")).toBe(false);
    expect(secretsMatch("short", "longer")).toBe(false);
  });

  it("authorizes only when the provided secret matches", () => {
    expect(
      isAuthorized({ "x-api-secret": "shared-secret" }, "shared-secret"),
    ).toBe(true);
    expect(isAuthorized({}, "shared-secret")).toBe(false);
    expect(
      isAuthorized({ "x-api-secret": "wrong-secret" }, "shared-secret"),
    ).toBe(false);
  });
});
