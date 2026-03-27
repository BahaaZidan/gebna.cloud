import { isEmailInDomain, parseEmailAddress, parseRecipientList } from "../lib/email.js";

export interface SendRequestBody {
  bcc?: string[];
  cc?: string[];
  from?: string;
  headers: Record<string, string> & {
    "Message-ID": string;
  };
  html?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  to: string[];
}

const FORBIDDEN_HEADER_NAMES = new Set([
  "bcc",
  "cc",
  "content-type",
  "date",
  "dkim-signature",
  "from",
  "mime-version",
  "reply-to",
  "subject",
  "to",
]);

const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const MESSAGE_ID_PATTERN = /^<[^<>\r\n]+>$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsUnsafeHeaderText(value: string): boolean {
  return value.includes("\r") || value.includes("\n");
}

function parseNonEmptyHeaderString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (containsUnsafeHeaderText(normalized)) {
    return null;
  }

  return normalized;
}

function parseNonEmptyBodyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function parseHeaders(
  value: unknown,
): (Record<string, string> & { "Message-ID": string }) | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const entries: Array<readonly [string, string]> = [];

  for (const [key, headerValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const lowerCaseKey = normalizedKey.toLowerCase();

    if (
      normalizedKey.length === 0 ||
      !HEADER_NAME_PATTERN.test(normalizedKey) ||
      FORBIDDEN_HEADER_NAMES.has(lowerCaseKey)
    ) {
      return null;
    }

    if (
      typeof headerValue !== "string" ||
      containsUnsafeHeaderText(headerValue) ||
      headerValue.trim().length === 0
    ) {
      return null;
    }

    entries.push([
      lowerCaseKey === "message-id" ? "Message-ID" : normalizedKey,
      headerValue.trim(),
    ] as const);
  }

  const parsedHeaders = Object.fromEntries(entries);
  const messageId = parsedHeaders["Message-ID"];

  if (messageId === undefined || !MESSAGE_ID_PATTERN.test(messageId)) {
    return null;
  }

  return parsedHeaders as Record<string, string> & { "Message-ID": string };
}

function parseOptionalRecipients(value: unknown): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" && !Array.isArray(value)) {
    return null;
  }

  return parseRecipientList(value);
}

export function parseSendRequestBody(
  value: unknown,
  fromDomain: string,
): SendRequestBody | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const to = parseOptionalRecipients(value.to);
  const cc = parseOptionalRecipients(value.cc);
  const bcc = parseOptionalRecipients(value.bcc);
  const subject = parseNonEmptyHeaderString(value.subject);
  const text = value.text === undefined ? undefined : parseNonEmptyBodyString(value.text);
  const html = value.html === undefined ? undefined : parseNonEmptyBodyString(value.html);
  const from =
    value.from === undefined ? undefined : parseNonEmptyHeaderString(value.from);
  const replyTo =
    value.replyTo === undefined ? undefined : parseNonEmptyHeaderString(value.replyTo);
  const headers = value.headers === undefined ? undefined : parseHeaders(value.headers);

  if (to === null || to === undefined) {
    return null;
  }

  if (cc === null || bcc === null) {
    return null;
  }

  if (subject === null) {
    return null;
  }

  if (text === null || html === null) {
    return null;
  }

  if (text === undefined && html === undefined) {
    return null;
  }

  if (from === null || (from !== undefined && !isEmailInDomain(from, fromDomain))) {
    return null;
  }

  if (replyTo === null || (replyTo !== undefined && parseEmailAddress(replyTo) === null)) {
    return null;
  }

  if (headers === null || headers === undefined) {
    return null;
  }

  return {
    ...(bcc === undefined ? {} : { bcc }),
    ...(cc === undefined ? {} : { cc }),
    ...(from === undefined ? {} : { from }),
    headers,
    ...(html === undefined ? {} : { html }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(text === undefined ? {} : { text }),
    subject,
    to,
  };
}
