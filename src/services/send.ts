import type { SendRequestBody } from "../http/send-schema.js";
import { parseEmailAddress } from "../lib/email.js";
import { createLogger } from "../lib/logger.js";

import { applyDkimSignature } from "./dkim.js";
import { buildOutboundMessage, type BuiltMessage } from "./message-builder.js";
import { MxLookupError, resolveMxTargets, type MxTarget } from "./mx.js";
import {
  sendDirectSmtpMessage,
  SmtpPermanentError,
  SmtpProtocolError,
  SmtpTemporaryError,
} from "./smtp.js";
import type { OutboundTransportConfig } from "./transport-config.js";

const logger = createLogger();

export interface DeliveryAttempt {
  error?: string;
  exchange: string;
  priority: number;
  success: boolean;
}

export interface DeliveryResult {
  attempts: DeliveryAttempt[];
  recipientDomain: string;
  success: boolean;
}

export interface SendResult {
  deliveries: DeliveryResult[];
  success: boolean;
}

function groupRecipientsByDomain(recipients: string[]): Map<string, string[]> {
  const groupedRecipients = new Map<string, string[]>();

  for (const recipient of recipients) {
    const parsedAddress = parseEmailAddress(recipient);

    if (parsedAddress === null) {
      continue;
    }

    const domainRecipients = groupedRecipients.get(parsedAddress.domain) ?? [];
    domainRecipients.push(parsedAddress.normalized);
    groupedRecipients.set(parsedAddress.domain, domainRecipients);
  }

  return groupedRecipients;
}

function createDomainMessage(message: BuiltMessage, recipients: string[]): BuiltMessage {
  return {
    ...message,
    envelope: {
      ...message.envelope,
      to: recipients,
    },
  };
}

async function tryTarget(
  target: MxTarget,
  message: BuiltMessage,
  transportConfig: OutboundTransportConfig,
): Promise<DeliveryAttempt> {
  try {
    await sendDirectSmtpMessage(target, message, transportConfig);

    logger.info("smtp.attempt.succeeded", {
      exchange: target.exchange,
      priority: target.priority,
      recipientCount: message.envelope.to.length,
    });

    return {
      exchange: target.exchange,
      priority: target.priority,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "SMTP delivery failed.";

    logger.warn("smtp.attempt.failed", {
      error: errorMessage,
      exchange: target.exchange,
      priority: target.priority,
      recipientCount: message.envelope.to.length,
    });

    return {
      error: errorMessage,
      exchange: target.exchange,
      priority: target.priority,
      success: false,
    };
  }
}

async function deliverToRecipientDomain(
  recipientDomain: string,
  recipients: string[],
  message: BuiltMessage,
  transportConfig: OutboundTransportConfig,
): Promise<DeliveryResult> {
  const domainMessage = createDomainMessage(message, recipients);
  const mxTargets = await resolveMxTargets(recipientDomain);
  const attempts: DeliveryAttempt[] = [];

  logger.info("mx.targets.resolved", {
    mxTargets: mxTargets.map((target) => ({
      exchange: target.exchange,
      priority: target.priority,
    })),
    recipientCount: recipients.length,
    recipientDomain,
  });

  for (const target of mxTargets) {
    const attempt = await tryTarget(target, domainMessage, transportConfig);
    attempts.push(attempt);

    if (attempt.success) {
      return {
        attempts,
        recipientDomain,
        success: true,
      };
    }
  }

  return {
    attempts,
    recipientDomain,
    success: false,
  };
}

function assertSuccessfulDeliveries(results: DeliveryResult[]): void {
  const failedDelivery = results.find((result) => !result.success);

  if (failedDelivery === undefined) {
    return;
  }

  const lastAttempt = failedDelivery.attempts.at(-1);
  const message = lastAttempt?.error ?? "SMTP delivery failed.";

  if (message.includes(" 4")) {
    throw new SmtpTemporaryError(message);
  }

  if (message.includes(" 5")) {
    throw new SmtpPermanentError(message);
  }

  throw new SmtpProtocolError(message);
}

export async function sendMessage(
  request: SendRequestBody,
  transportConfig: OutboundTransportConfig,
): Promise<SendResult> {
  const builtMessage = buildOutboundMessage(request, transportConfig);
  const signedMessage = applyDkimSignature(
    builtMessage,
    transportConfig.dkim,
    transportConfig.fromDomain,
  );
  const groupedRecipients = groupRecipientsByDomain(builtMessage.envelope.to);
  const deliveries: DeliveryResult[] = [];

  for (const [recipientDomain, recipients] of groupedRecipients.entries()) {
    const delivery = await deliverToRecipientDomain(
      recipientDomain,
      recipients,
      signedMessage,
      transportConfig,
    );

    deliveries.push(delivery);
  }

  const totalRecipientCount = builtMessage.envelope.to.length;
  const recipientDomains = deliveries.map((delivery) => delivery.recipientDomain);
  try {
    assertSuccessfulDeliveries(deliveries);
  } catch (error) {
    logger.warn("send.failed", {
      deliveryCount: deliveries.length,
      error: error instanceof Error ? error.message : "SMTP delivery failed.",
      recipientCount: totalRecipientCount,
      recipientDomains,
    });
    throw error;
  }

  logger.info("send.completed", {
    deliveryCount: deliveries.length,
    recipientCount: totalRecipientCount,
    recipientDomains,
  });

  return {
    deliveries,
    success: true,
  };
}

export { MxLookupError, SmtpPermanentError, SmtpProtocolError, SmtpTemporaryError };
