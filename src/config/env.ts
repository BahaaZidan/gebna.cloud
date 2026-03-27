import * as v from "valibot";

const EnvSchema = v.object({
  OUTBOUND_API_SECRET: v.pipe(v.string(), v.minLength(1)),
  OUTBOUND_FROM_DOMAIN: v.pipe(v.string(), v.minLength(1)),
  OUTBOUND_EHLO_HOSTNAME: v.pipe(v.string(), v.minLength(1)),
  OUTBOUND_RETURN_PATH: v.pipe(v.string(), v.email()),
  DKIM_SELECTOR: v.pipe(v.string(), v.minLength(1)),
  DKIM_PRIVATE_KEY: v.pipe(v.string(), v.minLength(1)),
  OUTBOUND_REPLY_TO: v.optional(v.pipe(v.string(), v.email())),
  SEND_TIMEOUT_MS: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
  PORT: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
});

type RawEnv = v.InferOutput<typeof EnvSchema>;

export type AppEnv = Omit<RawEnv, "SEND_TIMEOUT_MS" | "PORT"> & {
  SEND_TIMEOUT_MS?: number;
  PORT?: number;
};

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = v.parse(EnvSchema, source);
  const sendTimeoutMs = parseInteger(parsed.SEND_TIMEOUT_MS);
  const port = parseInteger(parsed.PORT);
  const env: AppEnv = {
    OUTBOUND_API_SECRET: parsed.OUTBOUND_API_SECRET,
    OUTBOUND_FROM_DOMAIN: parsed.OUTBOUND_FROM_DOMAIN,
    OUTBOUND_EHLO_HOSTNAME: parsed.OUTBOUND_EHLO_HOSTNAME,
    OUTBOUND_RETURN_PATH: parsed.OUTBOUND_RETURN_PATH,
    DKIM_SELECTOR: parsed.DKIM_SELECTOR,
    DKIM_PRIVATE_KEY: parsed.DKIM_PRIVATE_KEY,
    ...(parsed.OUTBOUND_REPLY_TO === undefined
      ? {}
      : { OUTBOUND_REPLY_TO: parsed.OUTBOUND_REPLY_TO }),
    ...(sendTimeoutMs === undefined
      ? {}
      : { SEND_TIMEOUT_MS: sendTimeoutMs }),
    ...(port === undefined ? {} : { PORT: port }),
  };

  return env;
}
