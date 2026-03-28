type LogLevel = "debug" | "info" | "warn" | "error";

type LogValue =
  | boolean
  | null
  | number
  | string
  | LogValue[]
  | { [key: string]: LogValue };

export type LogFields = Record<string, LogValue>;

export interface LogRecord extends LogFields {
  event: string;
  level: LogLevel;
  timestamp: string;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const REDACTED_VALUE = "[REDACTED]";

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "dkimPrivateKey",
  "dkim_private_key",
  "secret",
  "x-api-secret",
  "xApiSecret",
]);

function shouldRedact(key: string): boolean {
  return REDACTED_KEYS.has(key);
}

function redactValue(key: string, value: LogValue): LogValue {
  if (shouldRedact(key)) {
    return REDACTED_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactNestedValue(item));
  }

  if (value !== null && typeof value === "object") {
    return redactFields(value);
  }

  return value;
}

function redactNestedValue(value: LogValue): LogValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactNestedValue(item));
  }

  if (value !== null && typeof value === "object") {
    return redactFields(value);
  }

  return value;
}

export function redactFields(fields: LogFields): LogFields {
  const redactedEntries = Object.entries(fields).map(([key, value]) => [
    key,
    redactValue(key, value),
  ]);

  return Object.fromEntries(redactedEntries);
}

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      ...(error.stack === undefined ? {} : { errorStack: error.stack }),
      ...(error.cause === undefined
        ? {}
        : {
            errorCause:
              error.cause instanceof Error
                ? `${error.cause.name}: ${error.cause.message}`
                : String(error.cause),
          }),
    };
  }

  return {
    errorValue:
      typeof error === "string" ? error : JSON.stringify(error) ?? String(error),
  };
}

function writeLog(level: LogLevel, event: string, fields: LogFields = {}): void {
  const record: LogRecord = {
    event,
    level,
    timestamp: new Date().toISOString(),
    ...redactFields(fields),
  };

  const serializedRecord = JSON.stringify(record);
  process.stdout.write(`${serializedRecord}\n`);
}

export function createLogger(): Logger {
  return {
    debug(event, fields) {
      writeLog("debug", event, fields);
    },
    info(event, fields) {
      writeLog("info", event, fields);
    },
    warn(event, fields) {
      writeLog("warn", event, fields);
    },
    error(event, fields) {
      writeLog("error", event, fields);
    },
  };
}
