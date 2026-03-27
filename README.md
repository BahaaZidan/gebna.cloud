# gebna.cloud

Small self-hosted outbound email sender for one domain.

This service is meant to be the final sender. It accepts an authenticated HTTP request, builds the message, DKIM-signs it, resolves recipient MX records, and delivers directly to recipient mail servers.

It does not use an upstream SMTP relay.

## What This Is

- One Node.js service
- One authenticated `POST /send` endpoint
- One unauthenticated `GET /healthz` endpoint
- One configured sending domain
- Any `from` address under that domain
- Direct-to-MX delivery
- DKIM signing

## Hard Requirements Before You Run This

If you want this service to deliver mail directly to Gmail, Outlook, and other recipient servers, the app alone is not enough. Your host and domain must be set up correctly.

You need all of the following:

- A server with a stable public IP
- Outbound TCP port `25` allowed by your hosting provider and firewall
- Correct forward DNS for the hostname you will use in `OUTBOUND_EHLO_HOSTNAME`
- Correct PTR/rDNS for your public IP, pointing back to that hostname
- DKIM DNS published for your configured selector
- Sensible SPF for your sending domain
- Sensible DMARC for your sending domain
- A sending domain you control

If any of these are missing, delivery may fail or go to spam even if the application code is correct.

## Recommended DNS And Mail Identity Setup

Assume your domain is `gebna.net` and your sending host is `mail.gebna.net`.

You should have:

- `A` or `AAAA` record for `mail.gebna.net` pointing to your sending server
- PTR/rDNS for your server IP pointing to `mail.gebna.net`
- `MX` for recipient domains is not your concern; this service looks those up dynamically during delivery
- DKIM TXT record for `<selector>._domainkey.gebna.net`
- SPF TXT record for `gebna.net`
- DMARC TXT record for `_dmarc.gebna.net`

Example SPF:

```txt
v=spf1 a:mail.gebna.net mx -all
```

Example DMARC:

```txt
v=DMARC1; p=quarantine; adkim=s; aspf=s
```

Example DKIM record name:

```txt
s1._domainkey.gebna.net
```

The DKIM TXT value depends on the public key derived from `DKIM_PRIVATE_KEY`.

## Network And Host Requirements

Your host must satisfy all of the following:

- Outbound DNS resolution works
- Outbound TCP `25` works
- STARTTLS-capable SMTP sessions to remote MX hosts are allowed
- The hostname used in `OUTBOUND_EHLO_HOSTNAME` resolves publicly
- The server IP has matching PTR/rDNS
- Local firewall rules allow outbound SMTP and DNS

You should verify these before blaming application code.

## Environment Variables

Required:

- `OUTBOUND_API_SECRET`
- `OUTBOUND_FROM_DOMAIN`
- `OUTBOUND_EHLO_HOSTNAME`
- `OUTBOUND_RETURN_PATH`
- `DKIM_SELECTOR`
- `DKIM_PRIVATE_KEY`

Optional:

- `OUTBOUND_REPLY_TO`
- `SEND_TIMEOUT_MS`
- `PORT`

### Variable Meaning

`OUTBOUND_API_SECRET`

- Shared secret required in the `x-api-secret` header on `POST /send`

`OUTBOUND_FROM_DOMAIN`

- The only allowed sender domain
- If this is `gebna.net`, callers may send from `anything@gebna.net`
- Callers may not send from any other domain

`OUTBOUND_EHLO_HOSTNAME`

- Hostname announced in the SMTP `EHLO`
- This must be a real hostname with working forward DNS
- Its IP should have matching PTR/rDNS

`OUTBOUND_RETURN_PATH`

- Envelope sender used during SMTP delivery
- Must be a valid address under `OUTBOUND_FROM_DOMAIN`
- Example: `bounces@gebna.net`

`DKIM_SELECTOR`

- Selector used for DKIM signing
- Example: `s1`

`DKIM_PRIVATE_KEY`

- Private key used for DKIM signing
- Treat as a secret
- The matching public key must be published in DNS

`OUTBOUND_REPLY_TO`

- Optional default `Reply-To` if the request does not provide one

`SEND_TIMEOUT_MS`

- Optional timeout for the entire send operation

`PORT`

- HTTP listen port

## Install And Run

Install dependencies:

```bash
pnpm install
```

Run the checks:

```bash
pnpm test
pnpm typecheck
```

Start the service:

```bash
node --import tsx src/index.ts
```

The service listens on `PORT` when set, otherwise `3000`.

## Example Environment

```env
OUTBOUND_API_SECRET=super-secret-value
OUTBOUND_FROM_DOMAIN=gebna.net
OUTBOUND_EHLO_HOSTNAME=mail.gebna.net
OUTBOUND_RETURN_PATH=bounces@gebna.net
DKIM_SELECTOR=s1
DKIM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
OUTBOUND_REPLY_TO=reply@gebna.net
SEND_TIMEOUT_MS=20000
PORT=3000
```

## Behavior Summary

The service:

- accepts a request
- authenticates it using `x-api-secret`
- validates the request body
- ensures `from` belongs to `OUTBOUND_FROM_DOMAIN`
- builds the RFC 5322 message
- DKIM-signs the message
- resolves MX records for recipient domains
- connects directly to recipient MX hosts
- attempts delivery synchronously
- returns success or failure immediately

The service does not:

- enqueue work
- retry later
- persist the message
- store history
- handle bounces asynchronously

## API

### `GET /healthz`

- No authentication required
- Used for health checks

Example:

```bash
curl http://localhost:3000/healthz
```

### `POST /send`

Required header:

```txt
x-api-secret: <OUTBOUND_API_SECRET>
```

Required JSON fields:

- `to`
- `subject`
- at least one of `text` or `html`

Optional JSON fields:

- `from`
- `cc`
- `bcc`
- `replyTo`
- `headers`

### Request Rules

- `from` must be under `OUTBOUND_FROM_DOMAIN`
- `to`, `cc`, and `bcc` may be a string or an array of strings
- all addresses must be valid
- `subject` must be non-empty
- at least one of `text` or `html` must be non-empty
- `headers` must be a flat string-to-string object

### Example Request

```bash
curl -X POST http://localhost:3000/send \
  -H 'content-type: application/json' \
  -H 'x-api-secret: super-secret-value' \
  -d '{
    "from": "hello@gebna.net",
    "to": ["user@example.com"],
    "cc": [],
    "bcc": [],
    "subject": "Test message",
    "text": "Hello from gebna.cloud",
    "html": "<p>Hello from <strong>gebna.cloud</strong></p>",
    "replyTo": "reply@gebna.net",
    "headers": {
      "X-App": "gebna-cloud"
    }
  }'
```

## Error Behavior

Expected machine-readable error codes:

- `UNAUTHORIZED`
- `INVALID_REQUEST`
- `MX_LOOKUP_FAILED`
- `SMTP_TEMPORARY_FAILURE`
- `SMTP_PERMANENT_FAILURE`
- `INTERNAL_ERROR`
- `NOT_FOUND`

Typical meanings:

`UNAUTHORIZED`

- Missing or wrong `x-api-secret`

`INVALID_REQUEST`

- The JSON body is malformed
- A required field is missing
- `from` is outside `OUTBOUND_FROM_DOMAIN`
- a recipient is invalid
- `text` and `html` are both missing
- `headers` is not a flat string-to-string object

`MX_LOOKUP_FAILED`

- No MX could be resolved for the recipient domain, or DNS resolution failed

`SMTP_TEMPORARY_FAILURE`

- Remote server returned a transient SMTP failure
- Current v1 does not retry automatically

`SMTP_PERMANENT_FAILURE`

- Remote server returned a permanent SMTP failure

`NOT_FOUND`

- Any route other than `GET /healthz` and `POST /send`

## Deliverability Caveats

This service can be the final sender, but that does not mean mail will automatically land in inboxes.

Deliverability still depends on:

- IP reputation
- domain reputation
- PTR/rDNS correctness
- EHLO hostname correctness
- DKIM correctness
- SPF and DMARC correctness
- complaint rates
- content quality

Minimal direct delivery works best for controlled or low-volume use first. Cold direct delivery from a brand-new IP is likely to perform poorly with major providers.

## Operational Caveats

Current v1 tradeoffs:

- no retry queue
- no deferred delivery
- no bounce processor
- no attempt history
- no suppression list
- no persistence

This means:

- transient remote failures are returned directly to the caller
- process restarts lose all in-flight context
- you have no built-in audit trail of what was sent

## Local Run Checklist

Before starting the service, verify:

1. Your environment variables are present.
2. `OUTBOUND_EHLO_HOSTNAME` resolves publicly.
3. Your server IP PTR/rDNS points back to that hostname.
4. DKIM public key is published in DNS.
5. SPF exists for `OUTBOUND_FROM_DOMAIN`.
6. DMARC exists for `OUTBOUND_FROM_DOMAIN`.
7. Outbound DNS works from the host.
8. Outbound TCP `25` is allowed from the host.

## Production Checklist

Before using this against real recipients:

1. Start with low volume.
2. Test Gmail, Outlook, Apple, and a custom-domain mailbox.
3. Check whether mail lands in inbox, spam, or is rejected.
4. Confirm DKIM alignment on received messages.
5. Confirm SPF and DMARC alignment on received messages.
6. Confirm EHLO hostname and PTR/rDNS look sane in headers and SMTP logs.

## Logging Rules

The service should log:

- request ID
- path
- method
- status code
- duration
- recipient counts
- MX target selection
- sanitized SMTP outcome

The service should never log:

- `OUTBOUND_API_SECRET`
- `DKIM_PRIVATE_KEY`
- full request bodies by default

## Health Checks

`GET /healthz` is suitable for container health checks.

It does not require authentication and currently returns:

```json
{ "ok": true }
```

## Scope Reminder

This README describes a minimal direct sender.

If you later need production-grade behavior, you will likely add:

- retries
- queueing
- persistence
- bounce handling
- delivery history
- suppression logic
- rate limiting

Those are intentionally not part of the current scope.
