import { describe, expect, it } from "vitest";

import { parseSendRequestBody } from "../src/http/send-schema.js";

describe("parseSendRequestBody", () => {
  it("parses a valid minimal text request", () => {
    const result = parseSendRequestBody(
      {
        headers: { "Message-ID": "<test-1@gebna.net>" },
        subject: "Hello",
        text: "Body",
        to: "user@example.com",
      },
      "gebna.net",
    );

    expect(result).toEqual({
      headers: { "Message-ID": "<test-1@gebna.net>" },
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
        headers: { "Message-ID": "<test-2@gebna.net>", "x-trace-id": "123" },
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
      headers: { "Message-ID": "<test-2@gebna.net>", "x-trace-id": "123" },
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
        headers: { "Message-ID": "<test-3@gebna.net>" },
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
        headers: { "Message-ID": "<test-4@gebna.net>" },
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
        headers: { "Message-ID": "<test-5@gebna.net>" },
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
          headers: { "Message-ID": "<test-6@gebna.net>" },
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
          headers: { "Message-ID": "<test-7@gebna.net>", "x-count": 123 },
          subject: "Hello",
          text: "Body",
          to: "user@example.com",
        },
        "gebna.net",
      ),
    ).toBeNull();
  });

  it("rejects missing or invalid Message-ID headers", () => {
    expect(
      parseSendRequestBody(
        {
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
          headers: { "x-trace-id": "123" },
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
          headers: { "Message-ID": "not-an-rfc822-id" },
          subject: "Hello",
          text: "Body",
          to: "user@example.com",
        },
        "gebna.net",
      ),
    ).toBeNull();
  });

  it("rejects header injection in subject and custom headers", () => {
    expect(
      parseSendRequestBody(
        {
          headers: { "Message-ID": "<test-8@gebna.net>" },
          subject: "Hello\r\nBcc: victim@example.com",
          text: "Body",
          to: "user@example.com",
        },
        "gebna.net",
      ),
    ).toBeNull();

    expect(
      parseSendRequestBody(
        {
          headers: {
            "Message-ID": "<test-9@gebna.net>",
            "X-Test": "safe\r\nInjected: no",
          },
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
          headers: {
            Date: "Thu, 27 Mar 2026 00:00:00 GMT",
            "Message-ID": "<test-10@gebna.net>",
          },
          subject: "Hello",
          text: "Body",
          to: "user@example.com",
        },
        "gebna.net",
      ),
    ).toBeNull();
  });

  it("allows multiline text and html bodies", () => {
    const result = parseSendRequestBody(
      {
        headers: { "Message-ID": "<test-11@gebna.net>" },
        html: "<p>Hello</p>\n<p>World</p>",
        subject: "Hello",
        text: "Hello\nWorld",
        to: "user@example.com",
      },
      "gebna.net",
    );

    expect(result).toEqual({
      headers: { "Message-ID": "<test-11@gebna.net>" },
      html: "<p>Hello</p>\n<p>World</p>",
      subject: "Hello",
      text: "Hello\nWorld",
      to: ["user@example.com"],
    });
  });
});
