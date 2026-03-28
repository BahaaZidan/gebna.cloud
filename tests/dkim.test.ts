import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { applyDkimSignature } from "../src/services/dkim.js";
import type { BuiltMessage } from "../src/services/message-builder.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 1024,
});

describe("applyDkimSignature", () => {
  it("prepends a valid-looking DKIM-Signature header", () => {
    const message: BuiltMessage = {
      envelope: {
        from: "bounce@gebna.net",
        to: ["user@example.com"],
      },
      message: [
        "Date: Thu, 27 Mar 2026 00:00:00 GMT",
        "From: sender@gebna.net",
        "To: user@example.com",
        "Message-ID: <dkim-test@gebna.net>",
        "Subject: Hello",
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="utf-8"',
        "",
        "Body",
      ].join("\r\n"),
    };

    const signed = applyDkimSignature(
      message,
      {
        privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        selector: "mail",
      },
      "gebna.net",
    );

    expect(signed.message.startsWith("DKIM-Signature: v=1;")).toBe(true);
    expect(signed.message.startsWith("DKIM-Signature:;")).toBe(false);
    expect(signed.message).toContain(" c=relaxed/simple;");
    expect(signed.message).toContain(" h=date:from:to:message-id:subject:mime-version:content-type;");
  });
});
