import { MxLookupError, SmtpPermanentError, SmtpProtocolError, SmtpTemporaryError } from "../services/send.js";

export const INVALID_REQUEST_ERROR = {
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request.",
  },
} as const;

export const INTERNAL_ERROR = {
  error: {
    code: "INTERNAL_ERROR",
    message: "Internal error.",
  },
} as const;

export const MX_LOOKUP_FAILED_ERROR = {
  error: {
    code: "MX_LOOKUP_FAILED",
    message: "MX lookup failed.",
  },
} as const;

export const SMTP_TEMPORARY_FAILURE_ERROR = {
  error: {
    code: "SMTP_TEMPORARY_FAILURE",
    message: "Temporary SMTP failure.",
  },
} as const;

export const SMTP_PERMANENT_FAILURE_ERROR = {
  error: {
    code: "SMTP_PERMANENT_FAILURE",
    message: "Permanent SMTP failure.",
  },
} as const;

export interface MappedHttpError {
  body: unknown;
  statusCode: number;
}

export function mapErrorToHttpResponse(error: unknown): MappedHttpError {
  if (error instanceof MxLookupError) {
    return {
      body: MX_LOOKUP_FAILED_ERROR,
      statusCode: 502,
    };
  }

  if (error instanceof SmtpTemporaryError) {
    return {
      body: SMTP_TEMPORARY_FAILURE_ERROR,
      statusCode: 502,
    };
  }

  if (error instanceof SmtpPermanentError) {
    return {
      body: SMTP_PERMANENT_FAILURE_ERROR,
      statusCode: 502,
    };
  }

  if (error instanceof SmtpProtocolError) {
    return {
      body: SMTP_TEMPORARY_FAILURE_ERROR,
      statusCode: 502,
    };
  }

  return {
    body: INTERNAL_ERROR,
    statusCode: 500,
  };
}
