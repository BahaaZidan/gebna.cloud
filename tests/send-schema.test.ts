import { describe, expect, it } from "vitest";

import { parseSendRequestBody } from "../src/http/send-schema.js";

describe("parseSendRequestBody", () => {
  it("parses a valid minimal text request", () => {
    const result = parseSendRequestBody(
      {
        subject: "Hello",
        text: "Body",
        to: "user@example.com",
      },
      "gebna.net",
    );

    expect(result).toEqual({
      subject: "Hello",
      text: "Body",
      to: ["user@example.com"],
    });
  });

  it("parses optional fields and normalizes addresses", () => {
    const result = parseSendRequestBody(
      {
        bcc: ["blind@example.com"],
        cc: "copy@example.com",
        from: "Sender@Gebna.net",
        headers: { "x-trace-id": "123" },
        html: "<p>Hello</p>",
        replyTo: "Reply@Example.com",
        subject: "Hello",
        text: "Body",
        to: ["User@One.com", "user@two.com"],
      },
      "gebna.net",
    );

    expect(result).toEqual({
      bcc: ["blind@example.com"],
      cc: ["copy@example.com"],
      from: "Sender@Gebna.net",
      headers: { "x-trace-id": "123" },
      html: "<p>Hello</p>",
      replyTo: "Reply@Example.com",
      subject: "Hello",
      text: "Body",
      to: ["user@one.com", "user@two.com"],
    });
  });

  it("rejects a request without body content", () => {
    const result = parseSendRequestBody(
      {
        subject: "Hello",
        to: "user@example.com",
      },
      "gebna.net",
    );

    expect(result).toBeNull();
  });

  it("rejects invalid recipients", () => {
    const result = parseSendRequestBody(
      {
        subject: "Hello",
        text: "Body",
        to: "not-an-email",
      },
      "gebna.net",
    );

    expect(result).toBeNull();
  });

  it("rejects a sender outside the configured domain", () => {
    const result = parseSendRequestBody(
      {
        from: "sender@example.com",
        subject: "Hello",
        text: "Body",
        to: "user@example.com",
      },
      "gebna.net",
    );

    expect(result).toBeNull();
  });

  it("rejects invalid reply-to and header maps", () => {
    expect(
      parseSendRequestBody(
        {
          replyTo: "bad-reply-to",
          subject: "Hello",
          text: "Body",
          to: "user@example.com",
        },
        "gebna.net",
      ),
    ).toBeNull();

    expect(
      parseSendRequestBody(
        {
          headers: { "x-count": 123 },
          subject: "Hello",
          text: "Body",
          to: "user@example.com",
        },
        "gebna.net",
      ),
    ).toBeNull();
  });
});
