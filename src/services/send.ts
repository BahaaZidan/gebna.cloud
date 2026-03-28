import type { SendRequestBody } from "../http/send-schema.js";
import { parseEmailAddress } from "../lib/email.js";
import { createLogger, serializeError } from "../lib/logger.js";

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

type DeliveryFailureType = "permanent" | "protocol" | "temporary";

export interface DeliveryAttempt {
  error?: string;
  exchange: string;
  failureType?: DeliveryFailureType;
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

export interface SendContext {
  requestId?: string;
}

function createLogContext(context: SendContext): Record<string, string> {
  if (context.requestId === undefined) {
    return {};
  }

  return {
    requestId: context.requestId,
  };
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
  context: SendContext,
): Promise<DeliveryAttempt> {
  const logContext = createLogContext(context);

  try {
    await sendDirectSmtpMessage(target, message, transportConfig);

    logger.info("smtp.attempt.succeeded", {
      ...logContext,
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
    const failureType: DeliveryFailureType =
      error instanceof SmtpTemporaryError
        ? "temporary"
        : error instanceof SmtpPermanentError
          ? "permanent"
          : "protocol";

    logger.warn("smtp.attempt.failed", {
      ...logContext,
      exchange: target.exchange,
      ...serializeError(error),
      priority: target.priority,
      recipientCount: message.envelope.to.length,
    });

    return {
      error: errorMessage,
      exchange: target.exchange,
      failureType,
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
  context: SendContext,
): Promise<DeliveryResult> {
  const domainMessage = createDomainMessage(message, recipients);
  const mxTargets = await resolveMxTargets(recipientDomain);
  const attempts: DeliveryAttempt[] = [];
  const logContext = createLogContext(context);

  logger.info("mx.targets.resolved", {
    ...logContext,
    mxTargets: mxTargets.map((target) => ({
      exchange: target.exchange,
      priority: target.priority,
    })),
    recipientCount: recipients.length,
    recipientDomain,
  });

  for (const target of mxTargets) {
    const attempt = await tryTarget(target, domainMessage, transportConfig, context);
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
  const failureType = lastAttempt?.failureType;

  if (failureType === "temporary") {
    throw new SmtpTemporaryError(message);
  }

  if (failureType === "permanent") {
    throw new SmtpPermanentError(message);
  }

  throw new SmtpProtocolError(message);
}

export async function sendMessage(
  request: SendRequestBody,
  transportConfig: OutboundTransportConfig,
  context: SendContext = {},
): Promise<SendResult> {
  const builtMessage = buildOutboundMessage(request, transportConfig);
  const signedMessage = applyDkimSignature(
    builtMessage,
    transportConfig.dkim,
    transportConfig.fromDomain,
  );
  const groupedRecipients = groupRecipientsByDomain(builtMessage.envelope.to);
  const deliveries: DeliveryResult[] = [];
  const logContext = createLogContext(context);

  for (const [recipientDomain, recipients] of groupedRecipients.entries()) {
    const delivery = await deliverToRecipientDomain(
      recipientDomain,
      recipients,
      signedMessage,
      transportConfig,
      context,
    );

    deliveries.push(delivery);
  }

  const totalRecipientCount = builtMessage.envelope.to.length;
  const recipientDomains = deliveries.map((delivery) => delivery.recipientDomain);
  try {
    assertSuccessfulDeliveries(deliveries);
  } catch (error) {
    logger.warn("send.failed", {
      ...logContext,
      deliveryCount: deliveries.length,
      ...serializeError(error),
      recipientCount: totalRecipientCount,
      recipientDomains,
    });
    throw error;
  }

  logger.info("send.completed", {
    ...logContext,
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
