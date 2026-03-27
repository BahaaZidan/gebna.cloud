import { createHash, createSign } from "node:crypto";

import type { BuiltMessage } from "./message-builder.js";
import type { DkimConfig } from "./transport-config.js";

const DKIM_HEADER_NAMES = ["from", "to", "subject", "mime-version", "content-type"];

function splitMessage(message: string): { body: string; headers: string[] } {
  const separator = "\r\n\r\n";
  const separatorIndex = message.indexOf(separator);

  if (separatorIndex === -1) {
    return {
      body: "",
      headers: [message],
    };
  }

  const headerBlock = message.slice(0, separatorIndex);
  const body = message.slice(separatorIndex + separator.length);

  return {
    body,
    headers: headerBlock.split("\r\n"),
  };
}

function canonicalizeBody(body: string): string {
  return body.replace(/\r\n*$/, "\r\n");
}

function canonicalizeHeaderLine(headerLine: string): string {
  const separatorIndex = headerLine.indexOf(":");

  if (separatorIndex === -1) {
    return headerLine.trim().toLowerCase();
  }

  const name = headerLine.slice(0, separatorIndex).trim().toLowerCase();
  const value = headerLine
    .slice(separatorIndex + 1)
    .replace(/\s+/g, " ")
    .trim();

  return `${name}:${value}`;
}

function pickSignedHeaders(headers: string[]): string[] {
  const signedHeaders: string[] = [];

  for (const headerName of DKIM_HEADER_NAMES) {
    const matchingHeader = [...headers]
      .reverse()
      .find((headerLine) => headerLine.toLowerCase().startsWith(`${headerName}:`));

    if (matchingHeader !== undefined) {
      signedHeaders.push(canonicalizeHeaderLine(matchingHeader));
    }
  }

  return signedHeaders;
}

function createBodyHash(body: string): string {
  return createHash("sha256").update(canonicalizeBody(body), "utf8").digest("base64");
}

function createSignatureInput(
  canonicalizedHeaders: string[],
  dkimHeaderWithoutSignature: string,
): string {
  return [...canonicalizedHeaders, canonicalizeHeaderLine(dkimHeaderWithoutSignature)].join(
    "\r\n",
  );
}

function createDkimHeader(
  config: DkimConfig,
  domain: string,
  bodyHash: string,
  signedHeaderNames: string,
): string {
  return [
    "DKIM-Signature:",
    "v=1",
    "a=rsa-sha256",
    "c=simple/simple",
    `d=${domain}`,
    `s=${config.selector}`,
    `h=${signedHeaderNames}`,
    `bh=${bodyHash}`,
    "b=",
  ].join("; ");
}

export function applyDkimSignature(
  builtMessage: BuiltMessage,
  config: DkimConfig,
  domain: string,
): BuiltMessage {
  const { body, headers } = splitMessage(builtMessage.message);
  const canonicalizedHeaders = pickSignedHeaders(headers);
  const signedHeaderNames = canonicalizedHeaders
    .map((headerLine) => headerLine.split(":", 1)[0])
    .join(":");
  const bodyHash = createBodyHash(body);
  const dkimHeader = createDkimHeader(config, domain, bodyHash, signedHeaderNames);
  const signatureInput = createSignatureInput(canonicalizedHeaders, dkimHeader);
  const signer = createSign("RSA-SHA256");

  signer.update(signatureInput, "utf8");
  signer.end();

  const signature = signer.sign(config.privateKey, "base64");
  const signedHeader = `${dkimHeader}${signature}`;
  const signedMessage = `${signedHeader}\r\n${builtMessage.message}`;

  return {
    ...builtMessage,
    message: signedMessage,
  };
}
