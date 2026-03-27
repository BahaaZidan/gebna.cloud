import { resolveMx } from "node:dns/promises";

export class MxLookupError extends Error {
  constructor(message = "MX lookup failed.") {
    super(message);
    this.name = "MxLookupError";
  }
}

export interface MxTarget {
  exchange: string;
  priority: number;
}

function normalizeExchange(exchange: string): string {
  return exchange.replace(/\.+$/, "").toLowerCase();
}

function isNullMxRecord(exchange: string): boolean {
  return normalizeExchange(exchange).length === 0;
}

function sortTargets(targets: MxTarget[]): MxTarget[] {
  return [...targets].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.exchange.localeCompare(right.exchange);
  });
}

export async function resolveMxTargets(domain: string): Promise<MxTarget[]> {
  try {
    const records = await resolveMx(domain);

    if (records.length === 0) {
      return [{ exchange: normalizeExchange(domain), priority: 0 }];
    }

    if (records.length === 1 && isNullMxRecord(records[0]?.exchange ?? "")) {
      throw new MxLookupError("Recipient domain does not accept email.");
    }

    const targets = records.map((record) => ({
      exchange: normalizeExchange(record.exchange),
      priority: record.priority,
    }));

    if (targets.some((target) => target.exchange.length === 0)) {
      throw new MxLookupError("Recipient domain has an invalid MX configuration.");
    }

    return sortTargets(targets);
  } catch (error) {
    if (error instanceof MxLookupError) {
      throw error;
    }

    throw new MxLookupError(error instanceof Error ? error.message : undefined);
  }
}
