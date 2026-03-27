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

    const targets = records.map((record) => ({
      exchange: normalizeExchange(record.exchange),
      priority: record.priority,
    }));

    return sortTargets(targets);
  } catch (error) {
    throw new MxLookupError(error instanceof Error ? error.message : undefined);
  }
}
