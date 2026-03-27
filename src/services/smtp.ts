import * as net from "node:net";
import * as tls from "node:tls";
import type { TLSSocket } from "node:tls";

import type { BuiltMessage } from "./message-builder.js";
import type { MxTarget } from "./mx.js";
import type { OutboundTransportConfig } from "./transport-config.js";

const SMTP_PORT = 25;
const LINE_SEPARATOR = "\r\n";

interface SmtpReply {
  code: number;
  lines: string[];
}

export class SmtpTemporaryError extends Error {
  constructor(message = "SMTP temporary failure.") {
    super(message);
    this.name = "SmtpTemporaryError";
  }
}

export class SmtpPermanentError extends Error {
  constructor(message = "SMTP permanent failure.") {
    super(message);
    this.name = "SmtpPermanentError";
  }
}

export class SmtpProtocolError extends Error {
  constructor(message = "SMTP protocol error.") {
    super(message);
    this.name = "SmtpProtocolError";
  }
}

class SmtpConnection {
  private buffer = "";

  constructor(
    private socket: net.Socket | TLSSocket,
    private timeoutMs: number,
  ) {}

  static async connect(host: string, timeoutMs: number): Promise<SmtpConnection> {
    const socket = net.createConnection({ host, port: SMTP_PORT });

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
      socket.setTimeout(timeoutMs, () => {
        reject(new SmtpTemporaryError("SMTP connection timed out."));
      });
    });

    return new SmtpConnection(socket, timeoutMs);
  }

  async upgradeToTls(servername: string): Promise<void> {
    const tlsSocket = tls.connect({
      servername,
      socket: this.socket,
      timeout: this.timeoutMs,
    });

    await new Promise<void>((resolve, reject) => {
      tlsSocket.once("secureConnect", resolve);
      tlsSocket.once("error", reject);
      tlsSocket.setTimeout(this.timeoutMs, () => {
        reject(new SmtpTemporaryError("STARTTLS negotiation timed out."));
      });
    });

    this.socket = tlsSocket;
    this.buffer = "";
  }

  async readReply(): Promise<SmtpReply> {
    const lines: string[] = [];

    while (true) {
      const line = await this.readLine();
      lines.push(line);

      const replyMatch = /^(\d{3})([ -])(.*)$/.exec(line);

      if (replyMatch === null) {
        throw new SmtpProtocolError(`Invalid SMTP reply: ${line}`);
      }

      const codeText = replyMatch[1];

      if (codeText === undefined) {
        throw new SmtpProtocolError(`Invalid SMTP reply: ${line}`);
      }

      if (replyMatch[2] === " ") {
        return {
          code: Number.parseInt(codeText, 10),
          lines,
        };
      }
    }
  }

  async sendCommand(command: string): Promise<SmtpReply> {
    await this.write(`${command}${LINE_SEPARATOR}`);
    return this.readReply();
  }

  async sendData(message: string): Promise<SmtpReply> {
    const normalizedMessage = message.replace(/\r?\n/g, LINE_SEPARATOR);
    const dotStuffedMessage = normalizedMessage.replace(/^\./gm, "..");

    await this.write(`${dotStuffedMessage}${LINE_SEPARATOR}.${LINE_SEPARATOR}`);
    return this.readReply();
  }

  destroy(): void {
    this.socket.destroy();
  }

  private async write(data: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(data, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async readLine(): Promise<string> {
    while (true) {
      const separatorIndex = this.buffer.indexOf(LINE_SEPARATOR);

      if (separatorIndex !== -1) {
        const line = this.buffer.slice(0, separatorIndex);
        this.buffer = this.buffer.slice(separatorIndex + LINE_SEPARATOR.length);
        return line;
      }

      const chunk = await this.readChunk();
      this.buffer += chunk;
    }
  }

  private async readChunk(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const handleData = (chunk: Buffer | string) => {
        cleanup();
        resolve(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      };
      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const handleEnd = () => {
        cleanup();
        reject(new SmtpProtocolError("SMTP connection closed unexpectedly."));
      };
      const handleTimeout = () => {
        cleanup();
        reject(new SmtpTemporaryError("SMTP read timed out."));
      };
      const cleanup = () => {
        this.socket.off("data", handleData);
        this.socket.off("error", handleError);
        this.socket.off("end", handleEnd);
        this.socket.off("timeout", handleTimeout);
      };

      this.socket.once("data", handleData);
      this.socket.once("error", handleError);
      this.socket.once("end", handleEnd);
      this.socket.once("timeout", handleTimeout);
      this.socket.setTimeout(this.timeoutMs);
    });
  }
}

function assertPositiveReply(reply: SmtpReply, context: string): void {
  if (reply.code >= 200 && reply.code < 400) {
    return;
  }

  const message = `${context}: ${reply.lines.join(" | ")}`;

  if (reply.code >= 400 && reply.code < 500) {
    throw new SmtpTemporaryError(message);
  }

  if (reply.code >= 500 && reply.code < 600) {
    throw new SmtpPermanentError(message);
  }

  throw new SmtpProtocolError(message);
}

function parseCapabilities(reply: SmtpReply): Set<string> {
  const capabilities = new Set<string>();

  for (const line of reply.lines) {
    const match = /^\d{3}[ -]([A-Z0-9-]+)/i.exec(line);

    if (match !== null && match[1] !== undefined) {
      capabilities.add(match[1].toUpperCase());
    }
  }

  return capabilities;
}

async function sendEnvelope(
  connection: SmtpConnection,
  message: BuiltMessage,
): Promise<void> {
  assertPositiveReply(
    await connection.sendCommand(`MAIL FROM:<${message.envelope.from}>`),
    "MAIL FROM failed",
  );

  for (const recipient of message.envelope.to) {
    assertPositiveReply(
      await connection.sendCommand(`RCPT TO:<${recipient}>`),
      "RCPT TO failed",
    );
  }

  assertPositiveReply(await connection.sendCommand("DATA"), "DATA failed");
  assertPositiveReply(await connection.sendData(message.message), "Message body failed");
}

export async function sendDirectSmtpMessage(
  target: MxTarget,
  message: BuiltMessage,
  transportConfig: OutboundTransportConfig,
): Promise<void> {
  const connection = await SmtpConnection.connect(
    target.exchange,
    transportConfig.sendTimeoutMs,
  );

  try {
    assertPositiveReply(await connection.readReply(), "SMTP greeting failed");

    const ehloReply = await connection.sendCommand(`EHLO ${transportConfig.ehloHostname}`);
    assertPositiveReply(ehloReply, "EHLO failed");

    const capabilities = parseCapabilities(ehloReply);

    if (capabilities.has("STARTTLS")) {
      assertPositiveReply(await connection.sendCommand("STARTTLS"), "STARTTLS failed");
      await connection.upgradeToTls(target.exchange);

      const tlsEhloReply = await connection.sendCommand(
        `EHLO ${transportConfig.ehloHostname}`,
      );
      assertPositiveReply(tlsEhloReply, "EHLO after STARTTLS failed");
    }

    await sendEnvelope(connection, message);
    assertPositiveReply(await connection.sendCommand("QUIT"), "QUIT failed");
  } finally {
    connection.destroy();
  }
}
