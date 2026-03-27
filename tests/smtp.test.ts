import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BuiltMessage } from "../src/services/message-builder.js";
import type { MxTarget } from "../src/services/mx.js";
import type { OutboundTransportConfig } from "../src/services/transport-config.js";

class FakeSocket extends EventEmitter {
  private pendingResponses: string[] = ["220 mx.example.com ready\r\n"];

  destroy(): void {}

  flushNextResponse(): void {
    const response = this.pendingResponses.shift();

    if (response === undefined) {
      return;
    }

    setTimeout(() => {
      this.emit("data", Buffer.from(response, "utf8"));
    }, 0);
  }

  setTimeout(_timeoutMs: number, _callback?: () => void): this {
    return this;
  }

  write(
    data: string,
    callback?: (error?: Error | null) => void,
  ): boolean {
    const command = data.replace(/\r\n$/, "");

    if (command.startsWith("EHLO ")) {
      this.pendingResponses.push("500 EHLO not supported\r\n");
    } else if (command.startsWith("HELO ")) {
      this.pendingResponses.push("250 mx.example.com hello\r\n");
    } else if (command.startsWith("MAIL FROM:")) {
      this.pendingResponses.push("250 OK\r\n");
    } else if (command.startsWith("RCPT TO:")) {
      this.pendingResponses.push("250 OK\r\n");
    } else if (command === "DATA") {
      this.pendingResponses.push("354 End data with <CR><LF>.<CR><LF>\r\n");
    } else if (data.endsWith("\r\n.\r\n")) {
      this.pendingResponses.push("250 queued\r\n");
    } else if (command === "QUIT") {
      this.pendingResponses.push("221 bye\r\n");
    }

    callback?.(null);

    this.flushNextResponse();

    return true;
  }
}

const { createConnectionMock } = vi.hoisted(() => ({
  createConnectionMock: vi.fn(),
}));

vi.mock("node:net", () => ({
  createConnection: createConnectionMock,
}));

describe("sendDirectSmtpMessage", () => {
  beforeEach(() => {
    createConnectionMock.mockReset();
    createConnectionMock.mockImplementation(() => {
      const socket = new FakeSocket();
      queueMicrotask(() => {
        socket.emit("connect");
        socket.flushNextResponse();
      });
      return socket;
    });
  });

  it("falls back to HELO when EHLO is rejected", async () => {
    const { sendDirectSmtpMessage } = await import("../src/services/smtp.js");

    const target: MxTarget = {
      exchange: "mx.example.com",
      priority: 10,
    };
    const message: BuiltMessage = {
      envelope: {
        from: "bounce@gebna.net",
        to: ["user@example.com"],
      },
      message: [
        "Date: Thu, 27 Mar 2026 00:00:00 GMT",
        "From: sender@gebna.net",
        "To: user@example.com",
        "Message-ID: <smtp-test@gebna.net>",
        "Subject: Hello",
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="utf-8"',
        "",
        "Body",
      ].join("\r\n"),
    };
    const transportConfig: OutboundTransportConfig = {
      dkim: {
        privateKey: "unused",
        selector: "mail",
      },
      ehloHostname: "mail.gebna.net",
      fromDomain: "gebna.net",
      returnPath: "bounce@gebna.net",
      sendTimeoutMs: 1000,
    };

    await expect(
      sendDirectSmtpMessage(target, message, transportConfig),
    ).resolves.toBeUndefined();
  });
});
