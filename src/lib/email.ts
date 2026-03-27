const EMAIL_PATTERN =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

export type EmailInput = string | string[];

export interface ParsedEmailAddress {
  domain: string;
  normalized: string;
}

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function parseEmailAddress(value: string): ParsedEmailAddress | null {
  const normalized = normalizeEmailAddress(value);

  if (!isValidEmailAddress(normalized)) {
    return null;
  }

  const atIndex = normalized.lastIndexOf("@");
  const domain = normalized.slice(atIndex + 1);

  return {
    domain,
    normalized,
  };
}

export function isEmailInDomain(value: string, domain: string): boolean {
  const parsedAddress = parseEmailAddress(value);

  if (parsedAddress === null) {
    return false;
  }

  return parsedAddress.domain === normalizeEmailAddress(domain);
}

export function normalizeRecipientList(input: EmailInput): string[] {
  return Array.isArray(input) ? input : [input];
}

export function parseRecipientList(input: EmailInput): string[] | null {
  const recipients = normalizeRecipientList(input)
    .map((value) => parseEmailAddress(value)?.normalized ?? null)
    .filter((value): value is string => value !== null);

  if (recipients.length === 0) {
    return null;
  }

  return recipients;
}

export function areAllEmailsValid(input: EmailInput): boolean {
  const recipients = normalizeRecipientList(input);

  if (recipients.length === 0) {
    return false;
  }

  return recipients.every((value) => parseEmailAddress(value) !== null);
}
