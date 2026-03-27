import type { SendRequestBody } from "../http/send-schema.js";
import type { OutboundTransportConfig } from "./transport-config.js";

export interface SmtpEnvelope {
  from: string;
  to: string[];
}

export interface BuiltMessage {
  envelope: SmtpEnvelope;
  message: string;
}

const MULTIPART_BOUNDARY = "gebna-boundary";

function formatHeader(name: string, value: string): string {
  return `${name}: ${value}`;
}

function formatAddressList(addresses: string[]): string {
  return addresses.join(", ");
}

function collectEnvelopeRecipients(request: SendRequestBody): string[] {
  return [
    ...request.to,
    ...(request.cc ?? []),
    ...(request.bcc ?? []),
  ];
}

function buildHeaders(
  request: SendRequestBody,
  transportConfig: OutboundTransportConfig,
): string[] {
  const from = request.from ?? transportConfig.returnPath;
  const replyTo = request.replyTo ?? transportConfig.replyTo;
  const headers = [
    formatHeader("From", from),
    formatHeader("To", formatAddressList(request.to)),
    formatHeader("Subject", request.subject),
    formatHeader("MIME-Version", "1.0"),
  ];

  if (request.cc !== undefined) {
    headers.push(formatHeader("Cc", formatAddressList(request.cc)));
  }

  if (replyTo !== undefined) {
    headers.push(formatHeader("Reply-To", replyTo));
  }

  if (request.headers !== undefined) {
    for (const [name, value] of Object.entries(request.headers)) {
      headers.push(formatHeader(name, value));
    }
  }

  if (request.text !== undefined && request.html !== undefined) {
    headers.push(
      formatHeader(
        "Content-Type",
        `multipart/alternative; boundary="${MULTIPART_BOUNDARY}"`,
      ),
    );
    return headers;
  }

  if (request.html !== undefined) {
    headers.push(formatHeader("Content-Type", 'text/html; charset="utf-8"'));
    return headers;
  }

  headers.push(formatHeader("Content-Type", 'text/plain; charset="utf-8"'));
  return headers;
}

function buildBody(request: SendRequestBody): string {
  if (request.text !== undefined && request.html !== undefined) {
    return [
      `--${MULTIPART_BOUNDARY}`,
      'Content-Type: text/plain; charset="utf-8"',
      "",
      request.text,
      `--${MULTIPART_BOUNDARY}`,
      'Content-Type: text/html; charset="utf-8"',
      "",
      request.html,
      `--${MULTIPART_BOUNDARY}--`,
    ].join("\r\n");
  }

  return request.text ?? request.html ?? "";
}

export function buildOutboundMessage(
  request: SendRequestBody,
  transportConfig: OutboundTransportConfig,
): BuiltMessage {
  const envelopeRecipients = collectEnvelopeRecipients(request);
  const headers = buildHeaders(request, transportConfig);
  const body = buildBody(request);
  const message = [...headers, "", body].join("\r\n");

  return {
    envelope: {
      from: transportConfig.returnPath,
      to: envelopeRecipients,
    },
    message,
  };
}
