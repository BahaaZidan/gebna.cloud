import type { AppEnv } from "../config/env.js";

const DEFAULT_SEND_TIMEOUT_MS = 30_000;

export interface DkimConfig {
  privateKey: string;
  selector: string;
}

export interface OutboundTransportConfig {
  dkim: DkimConfig;
  ehloHostname: string;
  fromDomain: string;
  replyTo?: string;
  returnPath: string;
  sendTimeoutMs: number;
}

export function createOutboundTransportConfig(
  env: AppEnv,
): OutboundTransportConfig {
  return {
    dkim: {
      privateKey: env.DKIM_PRIVATE_KEY,
      selector: env.DKIM_SELECTOR,
    },
    ehloHostname: env.OUTBOUND_EHLO_HOSTNAME,
    fromDomain: env.OUTBOUND_FROM_DOMAIN,
    ...(env.OUTBOUND_REPLY_TO === undefined
      ? {}
      : { replyTo: env.OUTBOUND_REPLY_TO }),
    returnPath: env.OUTBOUND_RETURN_PATH,
    sendTimeoutMs: env.SEND_TIMEOUT_MS ?? DEFAULT_SEND_TIMEOUT_MS,
  };
}
