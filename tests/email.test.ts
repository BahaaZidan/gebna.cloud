import { describe, expect, it } from "vitest";

import {
  areAllEmailsValid,
  isEmailInDomain,
  parseEmailAddress,
  parseRecipientList,
} from "../src/lib/email.js";

describe("email utilities", () => {
  it("parses and normalizes valid email addresses", () => {
    expect(parseEmailAddress(" Admin@Gebna.net ")).toEqual({
      domain: "gebna.net",
      normalized: "admin@gebna.net",
    });
  });

  it("rejects invalid email addresses", () => {
    expect(parseEmailAddress("not-an-email")).toBeNull();
  });

  it("enforces a sender domain", () => {
    expect(isEmailInDomain("hello@gebna.net", "gebna.net")).toBe(true);
    expect(isEmailInDomain("hello@example.com", "gebna.net")).toBe(false);
  });

  it("parses recipient inputs from a string or array", () => {
    expect(parseRecipientList("one@example.com")).toEqual(["one@example.com"]);
    expect(
      parseRecipientList(["one@example.com", " Two@Example.com "]),
    ).toEqual(["one@example.com", "two@example.com"]);
  });

  it("rejects invalid recipient lists", () => {
    expect(parseRecipientList(["valid@example.com", "bad-recipient"])).toEqual([
      "valid@example.com",
    ]);
    expect(areAllEmailsValid(["valid@example.com", "bad-recipient"])).toBe(false);
  });
});
