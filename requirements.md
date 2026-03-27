# Gebna Outbound Email Layer Requirements

## 1. Purpose

This document defines the requirements for a very small self-hosted outbound email layer.

The service is not a product platform. It is a Node.js HTTP service with one authenticated send endpoint.

---

## 2. Product shape

Build a simple outbound email layer that:

- runs on Node.js
- is self-hostable
- exposes a single HTTP endpoint for sending email
- authenticates requests with a secret header backed by an environment variable
- sends synchronously during the request
- uses one statically configured sending domain
- delivers directly to recipient mail servers as the final sender

---

## 3. Non-goals

The following are out of scope for v1:

- GraphQL
- UI of any kind
- user accounts
- sessions
- signup, sign-in, sign-out, or API keys
- domain creation flows
- domain verification flows
- sender-domain DNS management
- queues and background workers
- retries
- message persistence
- delivery history
- suppressions
- templates
- analytics
- multi-tenant support
- multiple sending domains

---

## 4. Runtime and deployment

Requirements:

- the runtime must be Node.js
- the deployment model must be self-hosted and container-friendly
- the service must run as a single Node.js process in v1
- configuration must come from environment variables
- startup must fail clearly if required configuration is missing

---

## 5. Static operator configuration

The service must be configured statically for one sending domain.

Required environment variables:

- `OUTBOUND_API_SECRET`
- `OUTBOUND_FROM_DOMAIN`
- `OUTBOUND_EHLO_HOSTNAME`
- `OUTBOUND_RETURN_PATH`
- `DKIM_SELECTOR`
- `DKIM_PRIVATE_KEY`

Optional environment variables:

- `OUTBOUND_REPLY_TO`
- `SEND_TIMEOUT_MS`
- `PORT`

Rules:

- `OUTBOUND_FROM_DOMAIN` is the only sending domain used by the service in v1
- `OUTBOUND_RETURN_PATH` must be a valid email address under the configured domain
- callers must be allowed to choose any sender email address under the configured domain
- callers must not be allowed to use a sender email address outside the configured domain
- the operator is responsible for whatever DNS setup their domain requires
- this service must not attempt to create, verify, or manage DNS records
- the operator is responsible for publishing the DKIM public key in DNS for the configured selector and domain
- the operator is responsible for the network, hostname, PTR/rDNS, and reputation prerequisites required for direct outbound delivery

---

## 6. Authentication

The service must authenticate requests with a single shared secret.

Requirements:

- the secret value must come from `OUTBOUND_API_SECRET`
- the send endpoint must require an `x-api-secret` header
- the provided secret must be compared safely
- requests with a missing or invalid secret must fail with `401`
- no other authentication or authorization layer is required in v1

---

## 7. HTTP API

## 7.1 Endpoint surface

The service must expose:

- `POST /send`
- `GET /healthz`

`GET /healthz` does not require authentication.

`POST /send` does require the secret header.

## 7.2 Request format

`POST /send` must accept JSON.

Required fields:

- `to`
- `subject`

At least one of the following must be present:

- `text`
- `html`

Optional fields:

- `from`
- `cc`
- `bcc`
- `replyTo`
- `headers`

Rules:

- `from` must be a valid email address under the configured `OUTBOUND_FROM_DOMAIN`
- `to`, `cc`, and `bcc` must accept either a single email string or an array of email strings
- every email address must be validated
- empty recipient lists are invalid
- `subject` must be a non-empty string
- at least one of `text` or `html` must be non-empty
- `replyTo`, if provided, must be a valid email address
- `headers`, if provided, must be a flat string-to-string map

## 7.3 Response format

Success response:

- HTTP `200`
- JSON body indicating success

Failure response:

- HTTP `400` for invalid input
- HTTP `401` for missing or invalid secret
- HTTP `500` or `502` for send failures
- JSON body with a stable error code and user-safe message

The service does not need to return a persisted message ID in v1 because no persistence layer exists.

---

## 8. Send behavior

The send flow must be synchronous.

Requirements:

- the request must validate input first
- the service must construct the final outbound message during the request
- the service must attempt delivery during the same request
- the HTTP response must reflect the actual send attempt result
- the service must not enqueue work for later processing
- the service must not persist the message before or after send
- the service must not implement retries in v1

---

## 9. SMTP transport

The service must send email by delivering directly to recipient mail servers.

Requirements:

- DKIM signing configuration must come from environment variables
- the service must resolve recipient-domain MX records
- the service must attempt delivery directly to the resolved recipient MX hosts
- the service must identify itself with the configured `OUTBOUND_EHLO_HOSTNAME`
- the service must build a valid SMTP envelope
- the service must build a valid RFC 5322 message payload
- the service must apply DKIM signing before SMTP delivery
- the service must set the `From` header from the caller-provided `from` value after validating that it belongs to the configured domain
- the service must use the configured `OUTBOUND_RETURN_PATH` as the envelope sender
- the service must set `Reply-To` from request input when provided, otherwise from static configuration when configured
- the service must support `to`, `cc`, and `bcc`
- the service must support plain text and HTML content
- the service must support SMTP over port `25` with STARTTLS when the remote server offers it
- the service must enforce a configurable send timeout

The service must not depend on an upstream SMTP relay in v1.

---

## 10. Error model

The service must return stable machine-readable error codes.

Minimum error codes:

- `UNAUTHORIZED`
- `INVALID_REQUEST`
- `INVALID_FROM`
- `INVALID_RECIPIENT`
- `INVALID_REPLY_TO`
- `MX_LOOKUP_FAILED`
- `SMTP_TEMPORARY_FAILURE`
- `SMTP_PERMANENT_FAILURE`
- `INTERNAL_ERROR`

Requirements:

- error responses must not leak secrets
- error messages must be safe to return to callers
- transport-level failure details may be logged safely, but not returned in raw form

---

## 11. Security

Requirements:

- the shared secret must never be logged
- the DKIM private key must never be logged
- full request bodies must not be logged by default
- structured logs must redact the secret header
- the service must validate all external input before attempting send

---

## 12. Observability

Requirements:

- expose `GET /healthz`
- log request method, path, status code, and duration
- log send success and send failure events
- log recipient MX target selection and sanitized SMTP response outcomes
- log sanitized recipient counts, not full message bodies
- include a request ID in logs

---

## 13. Self-hosting requirements

Requirements:

- the service must be easy to run in a container
- the runtime dependencies for v1 must remain minimal: the Node.js service plus outbound DNS and SMTP connectivity
- the README must document all required environment variables
- the README must document the required secret header and request format
- the README must document the direct-delivery operational prerequisites for the configured domain and host

---

## 14. Testing requirements

Minimum required categories:

- request validation tests
- secret authentication tests
- MX lookup tests
- direct SMTP send service unit tests
- HTTP integration tests for `/send`
- health check tests
- DKIM signing tests

Critical scenarios:

- request with wrong secret is rejected
- request with missing secret is rejected
- request with invalid recipient is rejected
- request with missing body content is rejected
- valid request sends successfully
- valid request produces a DKIM-signed message
- recipient MX lookup failure produces a non-success response
- remote SMTP temporary failure produces a non-success response
- health check responds successfully without authentication

---

## 15. Task breakdown

### T01. Done — Initialize Node.js service
Create the basic Node.js service structure.

### T02. Done — Add strict TypeScript configuration
Enable strict TypeScript settings.

### T03. Done — Add lint and format tooling
Set up ESLint and Prettier.

### T04. Done — Add test runner configuration
Set up the test runner and base config.

### T05. Done — Add environment config loader
Create typed environment variable loading and validation.

### T06. Done — Add HTTP server bootstrap
Create the HTTP server bootstrap and lifecycle wiring.

### T07. Done — Add request ID support
Create request ID generation and propagation utilities.

### T08. Done — Add structured logger
Create a structured logger with redaction support.

### T09. Done — Add health endpoint
Implement `GET /healthz`.

### T10. Done — Add secret auth middleware
Implement `x-api-secret` authentication middleware.

### T11. Done — Add email validation utilities
Create parsing and validation utilities for email addresses, recipient lists, and sender-domain enforcement.

### T12. Done — Add request schema validation
Validate the `POST /send` request body.

### T13. Add SMTP transport configuration
Create the typed direct-delivery and DKIM transport configuration layer.

### T14. Add outbound message builder
Build the RFC 5322 message payload and SMTP envelope.

### T15. Add DKIM signing
Implement DKIM signing for outbound messages using the configured selector and private key.

### T16. Add MX lookup service
Implement recipient-domain MX resolution and target selection.

### T17. Add direct SMTP client
Implement the direct SMTP session flow, including EHLO and STARTTLS handling.

### T18. Add synchronous send service
Implement the synchronous direct-delivery send operation using MX lookup and the SMTP client.

### T19. Add `POST /send` endpoint
Implement the authenticated send endpoint.

### T20. Add error mapping
Map validation, auth, MX, and SMTP failures to stable HTTP responses.

### T21. Add request logging
Log request metadata, outcomes, and durations safely.

### T22. Add send outcome logging
Log send success and failure events without leaking secrets or full message bodies.

### T23. Add validation tests
Test request schema and email validation behavior.

### T24. Add secret auth tests
Test missing-secret and wrong-secret cases.

### T25. Add send service tests
Test direct-delivery success and failure behavior, including DKIM signing and MX lookup handling.

### T26. Add HTTP integration tests for `/send`
Test end-to-end request handling for the send endpoint.

### T27. Add health endpoint tests
Test `GET /healthz`.

### T28. Produce README
Document startup, environment variables, DKIM DNS expectations, direct-delivery prerequisites, request format, secret header usage, and self-hosting instructions.

---

## 16. Acceptance criteria

The implementation is complete when all of the following are true:

- the service runs on Node.js
- the service exposes `POST /send`
- the service exposes `GET /healthz`
- `POST /send` requires the `x-api-secret` header
- the secret comes from an environment variable
- the service sends synchronously during the request
- the sending domain is fixed by static configuration
- callers can send from any email address under the configured domain
- the service applies DKIM signing using static configuration
- the service resolves recipient MX records and delivers directly without an upstream SMTP relay
- the service supports `to`, `cc`, `bcc`, `subject`, `text`, `html`, and `replyTo`
- the service returns clear validation and auth errors
- the service can be self-hosted with environment-variable configuration
- the README documents how to run and use the service

---

## 17. Backlog

These items are explicitly out of scope for v1:

- retries
- queues and background workers
- persistence
- delivery history
- multiple domains
- multiple transport profiles
- retries after transient remote failures
- bounce handling
- suppressions
- rate limiting
- templates
- GraphQL
- UI
