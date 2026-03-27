import { isEmailInDomain, parseEmailAddress, parseRecipientList } from "../lib/email.js";

export interface SendRequestBody {
  bcc?: string[];
  cc?: string[];
  from?: string;
  headers?: Record<string, string>;
  html?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  to: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function parseHeaders(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const entries: Array<readonly [string, string]> = [];

  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") {
      return null;
    }

    entries.push([key, headerValue] as const);
  }

  return Object.fromEntries(entries);
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
  const subject = parseNonEmptyString(value.subject);
  const text = value.text === undefined ? undefined : parseNonEmptyString(value.text);
  const html = value.html === undefined ? undefined : parseNonEmptyString(value.html);
  const from = value.from === undefined ? undefined : parseNonEmptyString(value.from);
  const replyTo =
    value.replyTo === undefined ? undefined : parseNonEmptyString(value.replyTo);
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

  if (headers === null) {
    return null;
  }

  return {
    ...(bcc === undefined ? {} : { bcc }),
    ...(cc === undefined ? {} : { cc }),
    ...(from === undefined ? {} : { from }),
    ...(headers === undefined ? {} : { headers }),
    ...(html === undefined ? {} : { html }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(text === undefined ? {} : { text }),
    subject,
    to,
  };
}
