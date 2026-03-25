# Gebna Cloud — Outbound Email Service Requirements

## 1. Document purpose

This document defines the implementation requirements for the first Gebna Cloud service: a simple outbound email platform.

The service exposes an HTTP API that allows authenticated customers to send arbitrary email messages to arbitrary recipients, provided the customer has verified and configured a sending domain.

This document is intentionally implementation-oriented. It excludes billing, pricing, landing pages, marketing pages, and other go-to-market material. It is meant to be handed to a coding agent and implemented in small, reviewable tasks.

---

## 2. Product goal

Build a modern outbound email service that:

- lets a customer create and verify a sending domain
- lets a customer send email through a simple HTTP API
- supports plain text and HTML emails
- supports common headers and metadata needed for real-world use
- records message lifecycle state for observability and later support tooling
- is designed as a monolith initially
- is structured so the system can later scale horizontally without major redesign

---

## 3. Primary use case

A customer signs up, proves ownership of `example.com`, configures the required DNS records, gets an API key, and sends requests such as:

- transactional emails
- notifications
- one-off emails
- programmatic emails from applications and backends

The system accepts the request, validates it, creates a durable message record, queues the message for delivery, attempts delivery through the provider’s sending pipeline, and exposes status back to the customer through API endpoints.

---

## 4. Non-goals

The following are out of scope for this version:

- billing and invoices
- pricing plans
- landing pages and public marketing pages
- inbound email receiving
- mailbox hosting
- template buil([tanstack.com](https://tanstack.com/start/v0/docs/framework/react/overview?utm_source=chatgpt.com))rds
- dedicated IP purchase flows
- reseller features
- multi-region deployment
- customer webhooks for delivery events
- attachments in v1 unless explicitly added later

Note: a basic admin/customer configuration UI is in scope. Only broader marketing and advanced product surfaces are out of scope.

---

## 5. Engineering constraints

### 5.1 Language and tooling

The system must use:

- TypeScript everywhere
- strict TypeScript configuration
- no `any`
- ESLint
- Prettier
- Vite fo([pothos-graphql.dev](https://pothos-graphql.dev/docs/guide?utm_source=chatgpt.com))pplicable

### 5.2 Required application stack

The application stack must use:

- TanStack Start as the full-stack React framework
- React for the UI layer
- Relay as the GraphQL client
- GraphQL API
- Pothos as the GraphQL schema builder
- Drizzle ORM for persistence
- Drizzle Relational Queries v2 (beta) for relational reads
- Tailwind CSS for utility-first styling
- daisyUI for component-level styling primitives on top of Tailwind CSS

TanStack Start is the required application framework for the monolith and should host the customer-facing app/API surface. React is the UI runtime. Relay is the required GraphQL client for app-side data access. Tailwind CSS is the required styling foundation, and daisyUI is the required component class system. Pothos generates a standard GraphQL schema, and Drizzle RQB v2 is the required relational query layer for nested/related reads. 

### 5.3 Code quality

The implementation must emphasize:

- full type safety across GraphQL schema definitions, resolver inputs, business logic, persistence, and internal events
- explicit schemas for all external input
- small modules with narrow responsibilities
- deterministic error handling
- testable service boundaries

### 5.4 Architecture direction

The initial implementation may be a monolith, but it must be shaped so that future horizontal scaling is straightforward.

This means:

- stateless API processes
- durable persistence for state transitions
- queue-backed async delivery flow
- idempotent job handling
- no reliance on in-memory state for correctness
- clear separation between GraphQL transport, domain logic, persistence, and workers

---

## 6. High-level system scope

The system consists of these logical areas:

1. TanStack Start application shell
2. React admin/customer configuration UI
3. Relay environment, queries, mutations, and fragments
4. authentication and API keys
5. account and project ownership model
6. sending domain management
7. DNS verification and domain readiness checks
8. outbound message submission API
9. durable message persistence
10. async delivery pipeline
11. message status tracking
12. suppression and safety controls
13. internal observability and operational tooling
14. Tailwind + daisyUI design system foundation

---

## 7. Core functional requirements

## 7.0 Basic admin/customer UI

The system must include a basic authenticated UI that allows a user to configure and inspect the service without calling GraphQL manually.

Minimum UI scope in v1:

- sign in to the admin/customer area through the chosen auth flow
- view the list of sending domains
- create a sending domain
- view domain verification instructions and current readiness state
- manually trigger domain verification
- view recent sent messages
- inspect message details and current status
- create and revoke API keys
- view and manage suppression entries

UI non-goals for v1:

- rich analytics dashboards
- multi-user team management
- advanced search and saved filters
- template editing
- marketing pages

The UI may remain visually simple, but it must be functional and production-usable.

## 7.1 Accounts

The system must support customer accounts.

Each account owns:

- API keys
- verified domains
- sent messages
- suppression entries
- audit-relevant actions

The exact signup flow is out of scope, but the domain model must assume a stable account identifier exists.

## 7.2 API authentication

The system must support API-key-based authentication for outbound API access.

Requirements:

- each API key belongs to one account
- API keys must be stored hashed, never in plaintext after creation
- the full key value is shown only once at creation time
- each API key has a display name
- each API key can be revoked
- revoked keys stop working immediately
- each request is authenticated to an account through the API key

## 7.3 Sending domains

A customer must be able to create a sending domain record.

A sending domain includes:

- domain name
- account owner
- status
- DKIM configuration
- SPF guidance metadata
- return-path / bounce domain metadata if supported in v1
- timestamps

Domain statuses should be explicit, such as:

- `pending_dns`
- `verified`
- `failed_verification`
- `paused`
- `disabled`

A domain cannot be used for sending until it reaches a sendable status.

## 7.4 Domain ownership verification

The system must require DNS-based proof of domain ownership.

Requirements:

- generate verification records for the customer
- provide exact DNS instructions through API responses
- periodically re-check DNS until verification succeeds or the user retries manually
- persist last verification result
- persist timestamps for checks

Verification should include at minimum:

- ownership verification TXT record
- DKIM DNS records

SPF must be documented and validated for readiness checks, but SPF alone must not be used as proof of ownership.

## 7.5 DKIM

The system must support DKIM signing.

Requirements:

- generate DKIM key material per domain or per domain configuration set
- store private key securely
- expose DNS records needed by the customer
- sign all eligible outbound messages for verified domains
- support key rotation later without breaking the domain model

The initial version may use one selector per domain, but the schema must not block multiple selectors later.

## 7.6 SPF readiness

The system must tell the customer what SPF include mechanism or sending rule is required.

Requirements:

- return machine-readable SPF guidance in the domain details API
- perform readiness checks and warn if SPF is missing or clearly invalid
- do not block sending solely because SPF inspection is imperfect, as long as domain ownership and DKIM requirements are satisfied and product policy allows sending

## 7.7 Message submission

The service must expose an HTTP endpoint for sending messages.

The request must support at least:

- `from`
- `to`
- optional `cc`
- optional `bcc`
- `subject`
- optional `text`
- optional `html`
- optional `replyTo`
- optional custom headers
- optional idempotency key
- optional provider-side metadata tags

Rules:

- at least one of `text` or `html` must be present
- `to`, `cc`, and `bcc` must support one or more recipients
- email address syntax must be validated
- the `from` domain must belong to a verified sending domain of the authenticated account
- requests exceeding configured limits must fail clearly

## 7.8 Arbitrary recipients

The system must allow sending to arbitrary external email addresses.

This is a core requirement.

The product must not require recipients to pre-exist in the system.

## 7.9 Idempotency

The message submission endpoint must support idempotent retries.

Requirements:

- support a caller-provided idempotency key
- deduplicate repeated submissions within a defined scope
- return the original result for a duplicate request when appropriate
- persist enough request fingerprint data to detect misuse

## 7.10 Durable acceptance model

The API should not claim success only because an upstream SMTP/API handoff succeeded.

Instead:

- accept the request only after validation and durable persistence
- create a message record with initial status such as `accepted`
- enqueue delivery work
- return a message identifier immediately after durable acceptance

## 7.11 Delivery pipeline

Message delivery must happen asynchronously.

Requirements:

- queued job per accepted message
- worker process claims jobs safely
- worker loads message and account/domain context
- worker performs final send eligibility checks
- worker renders transport payload
- worker attempts delivery
- worker updates message state
- worker records provider response identifiers

The delivery system must be safe for multiple worker instances later.

## 7.12 Message status model

The system must track message lifecycle states.

Minimum states:

- `accepted`
- `queued`
- `processing`
- `sent_to_provider`
- `failed`
- `suppressed`
- `rejected`

If later webhook-based feedback is added, the model should be extensible for:

- `delivered`
- `bounced`
- `complained`

## 7.13 Failure handling

Failures must be categorized.

At minimum:

- validation failure
- authentication failure
- authorization failure
- domain not verified
- suppression rejection
- provider temporary failure
- provider permanent failure
- internal unexpected failure

The system must persist machine-readable failure codes and a user-safe message.

## 7.14 Retry behavior

The worker must support retrying transient delivery failures.

Requirements:

- retry only for retryable failure classes
- use capped exponential backoff
- store retry count
- stop after a configured maximum
- mark terminal failure explicitly

Retry behavior must be deterministic and safe under duplicate worker execution.

## 7.15 Suppression list

The system must support account-level suppression entries.

Suppression entries prevent sending to certain recipients for safety/compliance reasons.

A suppression entry includes:

- recipient email
- reason
- source
- created timestamp
- optional expiration timestamp

At minimum, the system must support:

- manual suppression insertion
- suppression check before delivery
- suppression check during API acceptance when feasible

## 7.16 Rate limiting

The system must support rate limiting.

At minimum:

- per API key rate limiting
- optional per account rate limiting
- clear error response when exceeded

The implementation must not assume a single process in a way that blocks later distributed rate limiting.

## 7.17 Auditability

The system must record operationally important actions.

At minimum:

- API key creation
- API key revocation
- domain creation
- domain verification changes
- manual suppression actions

## 7.18 Status retrieval API

The API must expose message lookup for the authenticated account.

At minimum:

- fetch message by id
- list recent messages with pagination
- filter by domain and status where feasible

The response must not leak internal-only details or data belonging to another account.

---

## 8. API requirements

## 8.1 API style

Use GraphQL served from the TanStack Start application.

Requirements:

- GraphQL endpoint for customer-facing API access
- Pothos as the schema builder
- Relay-compatible schema design
- versioned schema change discipline even if the HTTP endpoint path is not versioned
- predictable typed error model
- stable field naming
- separation between GraphQL layer and service layer

The generated Pothos schema should be a plain GraphQL schema that can be served by a compatible GraphQL server implementation.

## 8.2 Relay-oriented schema rules

Requirements:

- design object identities so Relay caching and normalization are straightforward
- prefer stable globally unique IDs for GraphQL nodes where practical
- structure list fields with explicit pagination strategy compatible with Relay
- colocatable fragments must be practical for domain, message, suppression, and API key views
- mutation payloads should be explicit and predictable for Relay consumers
- use connection-style pagination for list fields where Relay pagination hooks are expected

Relay treats GraphQL Connections as the best-practice pagination model and provides first-class support for them. ([relay.dev](https://relay.dev/?utm_source=chatgpt.com))

## 8.3 Mutation and query surface required in v1

Minimum GraphQL surface:

Mutations:

- `createApiKey`
- `createDomain`
- `verifyDomain`
- `sendMessage`
- `createSuppression`
- `deleteSuppression`

Queries:

- `domains`
- `domain(id)`
- `messages`
- `message(id)`
- `suppressions`

## 8.4 GraphQL error model

Requirements:

- resolver errors must map from stable domain/service errors
- user-safe messages only
- internal details must stay out of GraphQL responses
- request ID must be attachable through extensions or equivalent logging correlation

## 8.5 GraphQL schema design rules

Requirements:

- keep GraphQL object types thin and map them onto service-layer DTOs
- do not place business policy directly in field definitions when it belongs in services
- use explicit input object types for all mutations
- use explicit enums for message status, domain status, suppression reason, and failure codes where exposed
- use cursor pagination or a clearly typed pagination model for list queries

---

## 9. Data model requirements

The exact database is not mandated here, but the schema must support the following entities.

## 9.1 Account

Fields:

- id
- createdAt
- updatedAt
- status

## 9.2 APIKey

Fields:

- id
- accountId
- name
- keyPrefix
- keyHash
- createdAt
- revokedAt
- lastUsedAt

## 9.3 Domain

Fields:

- id
- accountId
- domain
- status
- verificationToken
- verifiedAt
- lastVerificationCheckAt
- lastVerificationResult
- createdAt
- updatedAt

Constraint:

- domain ownership rules must prevent unsafe duplicate active ownership across accounts

## 9.4 DKIMSelector

Fields:

- id
- domainId
- selector
- privateKeyEncrypted
- publicKey
- status
- createdAt
- rotatedAt

## 9.5 Message

Fields:

- id
- accountId
- domainId
- apiKeyId
- idempotencyKey
- fromEmail
- fromName
- subject
- textBody
- htmlBody
- replyTo
- headersJson
- tagsJson
- status
- providerMessageId
- failureCode
- failureMessage
- acceptedAt
- queuedAt
- processingAt
- finalisedAt
- createdAt
- updatedAt

## 9.6 MessageRecipient

Fields:

- id
- messageId
- type (`to`, `cc`, `bcc`)
- email
- name

## 9.7 DeliveryAttempt

Fields:

- id
- messageId
- attemptNumber
- startedAt
- endedAt
- outcome
- providerResponseCode
- providerResponseSummary
- errorCode
- errorDetailsJson

## 9.8 Suppression

Fields:

- id
- accountId
- email
- reason
- source
- expiresAt
- createdAt

## 9.9 AuditLog

Fields:

- id
- accountId
- actorType
- actorId
- action
- targetType
- targetId
- detailsJson
- createdAt

## 9.10 QueueJob

If jobs are persisted in the main database, the schema must support:

- id
- type
- payloadJson
- status
- availableAt
- lockedAt
- lockToken
- attempts
- maxAttempts
- createdAt
- updatedAt

If a separate queue system is used, the service still needs equivalent logical behavior.

---

## 10. Security requirements

## 10.1 Authentication

- all customer API endpoints require authentication except flows explicitly meant for signup or bootstrap
- API key lookup must compare against a hash, not plaintext

## 10.2 Authorization

- every domain, message, suppression entry, and key must be scoped to the authenticated account
- cross-account access must be impossible through both API and internal service methods

## 10.3 Input validation

All external input must be schema-validated.

This includes:

- headers
- query params
- path params
- JSON bodies
- domain names
- email addresses
- metadata tags

## 10.4 Secret handling

The following must be treated as secrets:

- API keys
- DKIM private keys
- provider credentials

Secrets must not be logged.

## 10.5 Logging safety

Structured logs must avoid:

- plaintext secrets
- full authorization headers
- full API keys
- sensitive internal credentials

## 10.6 Abuse prevention

At minimum the design must leave room for:

- rate limiting
- account suspension
- domain pause/disable
- recipient suppression

---

## 11. Observability requirements

The system must provide enough observability for support and debugging.

Requirements:

- request ID per API request
- structured logs
- message ID returned on acceptance
- delivery attempt records
- machine-readable failure codes
- timestamps for key state transitions

Nice-to-have but optional in initial implementation:

- metrics counters for accepts, rejects, retries, failures
- latency histograms
- queue depth metrics

---

## 12. Internal architecture requirements

The codebase must be organized into clear layers.

Suggested layering:

- `app/`: TanStack Start routes, request handling, and application wiring
- `components/`: React UI components
- `features/`: UI feature modules for domains, messages, API keys, and suppressions
- `relay/`: Relay environment, query loaders, shared fragment helpers, and network layer
- `graphql/`: schema builder, object types, input types, queries, mutations
- `schemas/`: runtime validation schemas and derived types
- `services/`: business logic
- `repos/`: persistence access
- `workers/`: async job handlers
- `lib/`: shared utilities
- `config/`: typed config loading
- `styles/`: global Tailwind entrypoints and daisyUI theme customization

Rules:

- TanStack Start route handlers should stay thin
- React components should fetch through Relay, not ad hoc fetch wrappers
- Relay queries should be fragment-driven where practical
- services should not depend on GraphQL-, Relay-, or React-specific objects
- repositories should not contain business policy
- worker logic should reuse service-layer code where appropriate
- Drizzle RQB v2 should be used for relational reads that naturally map to nested GraphQL query shapes
- shared UI styling should primarily use Tailwind utility classes plus daisyUI component classes
- avoid bespoke CSS except for narrow cases that are hard to express with Tailwind and daisyUI

---

## 13. Horizontal scaling requirements

Even though the first release is a monolith, the implementation must preserve a path to scale-out.

Requirements:

- TanStack Start app instances are stateless
- worker instances are stateless
- Relay environment behavior must not be relied on for correctness on the server side
- all durable state lives in shared persistence
- queue semantics support multiple consumers safely
- retries are idempotent
- duplicate processing is tolerated safely
- rate limiting strategy can later move to a distributed store
- request handling does not depend on local memory caches for correctness

---

## 14. Testing requirements

The implementation must include tests.

Minimum required categories:

- schema validation unit tests
- service unit tests
- repository tests where practical
- GraphQL integration tests
- worker flow tests
- idempotency tests
- authorization boundary tests
- basic UI integration tests for critical admin flows

Critical scenarios to test:

- cannot send from unverified domain
- can send from verified domain
- duplicate idempotency key does not create duplicate message
- suppressed recipient is blocked
- revoked API key is rejected
- retryable provider failure is retried
- non-retryable provider failure becomes terminal
- one account cannot read another account’s messages

---

## 15. Delivery provider abstraction

The code must not hard-wire transport logic directly into GraphQL resolvers or general business logic.

Define a provider abstraction so the system can later support:

- direct SMTP
- third-party mail APIs
- internal MTA pipeline

The provider interface should expose typed outcomes such as:

- success with provider message id
- temporary failure
- permanent failure
- misconfiguration failure

---

## 16. Operational assumptions for v1

Assume:

- one TanStack Start deployment initially
- one relational database initially
- one async queue mechanism initially
- one delivery provider implementation initially
- React UI may begin minimal or internal-only, but the app foundation should still be present

The implementation should still avoid making single-instance assumptions inside business logic.

---

## 17. Out-of-scope deferred items

These should not be implemented unless explicitly pulled into scope later:

- bounce/complaint ingestion webhooks
- recipient engagement tracking
- open/click tracking
- attachment storage and scanning
- templates and substitutions
- scheduled sends
- multiple environments per account
- user/team RBAC
- dedicated IP management
- domain warm-up orchestration
- customer webhooks
- advanced dashboard UX beyond the basic admin/customer configuration UI

---

# 18. Task breakdown

The tasks below are intentionally small so generated code can be reviewed incrementally.

## Phase A — repository and tooling foundation

### T01. Initialize repository structure
Create the monolith repository structure with clear top-level folders for app, services, repositories, workers, schemas, config, and tests.

### T02. Add strict TypeScript configuration
Enable strict mode and other safety-oriented compiler options. Ensure no implicit any and no unsafe defaults.

### T03. Add ESLint configuration
Set up ESLint for TypeScript with rules that reinforce type safety and maintainability.

### T04. Add Prettier configuration
Set up Prettier and ensure formatting scripts exist.

### T05. Add lint scripts
Create package scripts for linting and lint fix.

### T06. Add format scripts
Create package scripts for format and format check.

### T07. Add typecheck script
Create a package script for standalone type checking.

### T08. Add test runner and base config
Set up the test runner and base test config.

### T09. Add Vite configuration
Set up Vite-based development and build configuration.

### T10. Scaffold TanStack Start application
Create the TanStack Start app scaffold and establish the top-level app structure.

### T11. Add React app shell
Create the initial React app shell and shared layout primitives.

### T12. Add Tailwind CSS setup
Configure Tailwind CSS in the app using the Vite-oriented integration path.

### T13. Add daisyUI setup
Configure daisyUI as a Tailwind plugin and define the initial theme strategy. Tailwind documents Vite-based setup, and daisyUI documents itself as a Tailwind CSS plugin that provides higher-level component class names. ([tailwindcss.com](https://tailwindcss.com/docs?utm_source=chatgpt.com))

### T14. Add GraphQL server bootstrap
Create the GraphQL server bootstrap and wire it to the app runtime.

### T15. Add Relay network layer scaffold
Create the Relay network layer that talks to the GraphQL endpoint.

### T16. Add typed Relay environment factory
Build the typed Relay environment initialization for client and server usage as needed.

### T17. Add typed environment config loader
Create a typed configuration module that validates all required environment variables at startup.

## Phase B — shared primitives

### T18. Add shared error model
Create a typed domain error system with stable codes and user-safe messages.

### T19. Add request ID utility
Create request ID generation and propagation utilities.

### T20. Add structured logger wrapper
Create a typed structured logger wrapper with safe field filtering.

### T21. Add pagination primitives
Create typed pagination input and output primitives for list queries.

### T22. Add email address parser/validator
Create shared parsing and validation utilities for email addresses.

### T23. Add domain parser/validator
Create shared parsing and validation utilities for domain names.
Create shared parsing and validation utilities for domain names.
Create shared parsing and validation utilities for domain names.
Create shared parsing and validation utilities for domain names.

## Phase B.5 — GraphQL and Relay foundation

### T24. Initialize Pothos SchemaBuilder
Create the central Pothos builder configuration and typed schema context.

### T25. Add GraphQL context factory
Build the request context containing account identity, request ID, logger, and database handle.

### T26. Add GraphQL scalar strategy
Define the scalar approach for DateTime, JSON, and any custom scalars needed.

### T27. Add GraphQL error mapping utility
Map domain/service errors into GraphQL-safe errors.

### T28. Add root Query and Mutation scaffolding
Create empty root types and modular field registration.

### T29. Add Relay compiler configuration
Set up Relay compiler configuration and generated artifact conventions.

### T30. Add base Relay query conventions
Define the project conventions for fragments, pagination, mutations, and query naming.

### T31. Add Relay provider wiring in React app
Wire the Relay environment into the React application shell.

### T32. Add app-shell navigation and auth guard scaffolding
Create the base authenticated shell, navigation, and route guards for the admin/customer area.

## Phase C — persistence foundation

### T33. Select and wire database access layer
Introduce the database layer and shared connection/bootstrap code.

### T34. Add migration system
Set up schema migration tooling and scripts.

### T35. Create accounts table
Add the initial accounts schema.

### T36. Create api_keys table
Add the API keys schema.

### T37. Create domains table
Add the domains schema.

### T38. Create dkim_selectors table
Add the DKIM selectors schema.

### T39. Create messages table
Add the messages schema.

### T40. Create message_recipients table
Add the message recipients schema.

### T41. Create delivery_attempts table
Add the delivery attempts schema.

### T42. Create suppressions table
Add the suppressions schema.

### T43. Create audit_logs table
Add the audit logs schema.

### T44. Create queue_jobs table or equivalent persistence contract
Add persistent queue job representation if the chosen queue requires it.

### T45. Define Drizzle relations
Declare all table relations needed by Drizzle RQB v2.

### T46. Initialize Drizzle with tables and relations for `db.query`
Wire `drizzle()` initialization so RQB v2 relational reads are available.

## Phase D — repository layer

### T29. Implement account repository
Add typed persistence functions for accounts.

### T30. Implement API key repository
Add typed persistence functions for API key creation, lookup, revocation, and last-used tracking.

### T31. Implement domain repository
Add typed persistence functions for domain lifecycle operations.

### T32. Implement DKIM selector repository
Add typed persistence functions for DKIM selectors.

### T33. Implement message repository
Add typed persistence functions for message creation, reads, and status transitions.

### T34. Implement message recipient repository
Add typed persistence functions for recipient rows.

### T35. Implement delivery attempt repository
Add typed persistence functions for delivery attempt rows.

### T36. Implement suppression repository
Add typed persistence functions for suppression checks and mutations.

### T37. Implement audit log repository
Add typed persistence functions for audit events.

### T38. Implement queue repository or queue adapter
Add typed enqueue, claim, ack, retry, and fail operations.

## Phase E — schema and API contracts

### T54. Define shared API error schema
Add runtime schemas and types for standard error envelopes.

### T55. Define GraphQL object types for API keys
Add Pothos object types and payload types for API key operations.

### T56. Define GraphQL object and input types for domains
Add Pothos object, enum, and input types for domain operations.

### T57. Define GraphQL object and input types for messages
Add Pothos object, enum, and input types for message operations.

### T58. Define GraphQL object and input types for suppressions
Add Pothos object, enum, and input types for suppression operations.

### T59. Define GraphQL pagination types
Add connection or paginated list types for domains, messages, and suppressions.

### T60. Add Relay fragment and query types for domain views
Create the initial Relay query/fragment set for domain lists and domain detail.

### T61. Add Relay fragment and query types for message views
Create the initial Relay query/fragment set for messages and message detail.

### T62. Add Relay mutation types for write operations
Create the initial Relay mutation documents for domain verification, send message, and suppression changes.

### T63. Define UI view-model types for domains
Create typed view-model boundaries for domain screens.

### T64. Define UI view-model types for messages
Create typed view-model boundaries for message screens.

### T65. Define UI view-model types for API keys and suppressions
Create typed view-model boundaries for API key and suppression screens.

## Phase F — authentication and authorization

### T47. Implement API key generator
Create secure API key generation with prefix and secret components.

### T48. Implement API key hashing
Hash API keys for storage and add verification helpers.

### T49. Implement authentication middleware
Authenticate requests via API key and attach account context.

### T50. Implement authorization helpers
Add reusable account-scoped access checks.

### T51. Implement revoked-key rejection
Ensure revoked keys are blocked consistently.

## Phase G — domain lifecycle services

### T52. Implement domain creation service
Create a service that validates input, creates a domain, creates verification token material, and returns DNS instructions.

### T53. Implement DKIM key generation service
Generate DKIM key material and persist the selector record.

### T54. Implement domain ownership verification checker
Resolve and verify ownership TXT records.

### T55. Implement DKIM DNS readiness checker
Resolve and verify DKIM DNS records.

### T56. Implement SPF readiness checker
Inspect SPF DNS presence/readiness and return warnings or readiness details.

### T57. Implement domain verification service
Combine the DNS checks and update domain status deterministically.

### T58. Implement domain pause/disable capability in service layer
Allow internal policy to pause or disable domains cleanly.

## Phase H — message acceptance services

### T59. Implement send-request validation service
Validate sender domain ownership, content presence, recipient counts, and basic limits.

### T60. Implement idempotency lookup service
Check whether the request has already been accepted for the same scope.

### T61. Implement suppression pre-check service
Check whether any intended recipient is suppressed.

### T62. Implement message acceptance service
Persist the message, recipients, initial status, and enqueue a delivery job.

### T63. Implement acceptance transaction boundary
Ensure message creation and job enqueueing happen atomically or with equivalent correctness guarantees.

## Phase I — delivery provider abstraction

### T64. Define delivery provider interface
Create the typed abstraction that the worker uses for sending.

### T65. Implement initial provider adapter
Implement the first concrete provider adapter.

### T66. Map provider responses to internal outcomes
Normalize provider-specific outcomes into typed success/failure categories.

## Phase J — worker and queue processing

### T67. Implement queue claim loop
Create the worker loop that safely claims available jobs.

### T68. Implement message-delivery worker handler
Load message context and run the send pipeline.

### T69. Implement final eligibility re-check before send
Re-check domain status, suppression, and terminal-state safety immediately before delivery.

### T70. Implement delivery attempt recording
Record each provider send attempt with timestamps and result metadata.

### T71. Implement success transition handling
Update message status and provider message ID on success.

### T72. Implement retry scheduling for transient failures
Reschedule transient failures with capped exponential backoff.

### T73. Implement terminal failure handling
Mark non-retryable and exhausted failures as terminal.

### T74. Implement duplicate-processing safety
Ensure worker reprocessing cannot create duplicate final side effects beyond allowed idempotent boundaries.

## Phase K — GraphQL operations

### T94. Implement `createApiKey` mutation
Create the GraphQL mutation for API key creation.

### T95. Implement `createDomain` mutation
Create the GraphQL mutation for domain creation.

### T96. Implement `domains` query
Create the GraphQL query for listing domains.

### T97. Implement `domain(id)` query
Create the GraphQL query for reading a single domain.

### T98. Implement `verifyDomain` mutation
Create the GraphQL mutation for manual verification check triggering.

### T99. Implement `sendMessage` mutation
Create the GraphQL mutation for message submission.

### T100. Implement `messages` query
Create the paginated GraphQL query for message listing.

### T101. Implement `message(id)` query
Create the GraphQL query for message detail.

### T102. Implement `createSuppression` mutation
Create the GraphQL mutation for suppression creation.

### T103. Implement `suppressions` query
Create the GraphQL query for suppression listing.

### T104. Implement `deleteSuppression` mutation
Create the GraphQL mutation for suppression deletion.

### T105. Implement TanStack Start route integration for GraphQL endpoint
Wire the GraphQL execution entrypoint into the TanStack Start application.

## Phase K.5 — Basic admin/customer UI

### T106. Implement authenticated app layout
Create the basic logged-in layout using Tailwind and daisyUI primitives.

### T107. Implement domain list page
Create the domain listing screen.

### T108. Implement domain create page/form
Create the domain creation screen and mutation flow.

### T109. Implement domain detail page
Create the domain detail screen with verification instructions and readiness state.

### T110. Implement manual domain verification action
Create the UI action for re-running verification.

### T111. Implement message list page
Create the recent messages screen.

### T112. Implement message detail page
Create the message detail screen.

### T113. Implement API key list/create/revoke page
Create the API key management screen.

### T114. Implement suppression list/create/delete page
Create the suppression management screen.

### T115. Add basic loading, empty, and error states for all admin screens
Ensure every critical screen has usable states.

## Phase L — observability and safety

### T86. Add request logging middleware
Log requests with request ID, account context, and safe metadata.

### T87. Add error-to-response mapper
Map typed domain errors to stable HTTP responses.

### T88. Add message status transition logging
Log important status transitions with message ID.

### T89. Add audit logging hooks
Write audit log records for key operational actions.

### T90. Add metrics hooks
Add metrics counters and timers where feasible.

### T91. Add rate limiting middleware
Add per-key and/or per-account rate limiting.

## Phase M — test coverage

### T92. Add unit tests for email validation
Test valid and invalid email parsing cases.

### T93. Add unit tests for domain validation
Test valid and invalid domain parsing cases.

### T94. Add unit tests for API key auth flow
Test success, bad key, and revoked key cases.

### T95. Add unit tests for domain verification service
Test verification success and failure transitions.

### T96. Add unit tests for message acceptance service
Test happy path and key rejection scenarios.

### T97. Add unit tests for idempotency behavior
Test duplicate send submissions.

### T98. Add unit tests for suppression behavior
Test blocked recipients.

### T99. Add worker tests for retryable failures
Test retry scheduling and attempt increments.

### T100. Add worker tests for permanent failures
Test terminal failure transitions.

### T116. Add integration tests for `sendMessage`
Test end-to-end acceptance behavior through GraphQL.

### T117. Add integration tests for domain GraphQL operations
Test create, read, list, and verify flows through GraphQL.

### T118. Add integration tests for GraphQL auth context
Verify API key authentication and context scoping inside GraphQL execution.

### T119. Add integration tests for Relay query flow
Verify the app-side Relay environment can query and mutate against the GraphQL endpoint correctly.

### T120. Add UI tests for domain management flow
Verify the core domain-management UI path works.

### T121. Add UI tests for API key management flow
Verify create and revoke flows work.

### T122. Add authorization boundary tests
Verify one account cannot access another account’s resources.

## Phase N — implementation hardening

### T123. Review all external schemas for strictness
Ensure no loose or unbounded input objects remain.

### T124. Review logs for secret leakage
Ensure keys and secrets are redacted everywhere.

### T125. Review error codes for consistency
Ensure all domain/service errors map to stable public codes.

### T126. Review database indexes
Add indexes needed for lookup paths, queue claiming, and idempotency checks.

### T127. Review transaction boundaries
Verify correctness for domain creation, message acceptance, and worker transitions.

### T128. Review horizontal-scaling assumptions
Check for in-memory correctness dependencies and remove them.

### T129. Review Relay schema ergonomics
Ensure the schema shape remains practical for fragment colocation, pagination, and mutation updates.

### T130. Review admin UI consistency
Ensure shared Tailwind and daisyUI patterns are applied consistently across screens.

### T131. Produce implementation README
Document local setup, scripts, environment variables, GraphQL schema layout, Relay setup, TanStack Start wiring, Tailwind/daisyUI setup, and service boundaries for future contributors and coding agents.
Document local setup, scripts, environment variables, GraphQL schema layout, Relay setup, TanStack Start wiring, and service boundaries for future contributors and coding agents.
Document local setup, scripts, environment variables, GraphQL schema layout, and service boundaries for future contributors and coding agents.
Document local setup, scripts, environment variables, and service boundaries for future contributors and coding agents.

---

## 19. Recommended implementation order

Use this order when driving a coding agent:

1. T01–T18
2. T19–T38
3. T39–T51
4. T52–T58
5. T59–T63
6. T64–T74
7. T75–T91
8. T92–T110

This sequence keeps each review slice focused and limits cross-cutting rework.

---

## 20. Acceptance criteria for v1

The v1 implementation is considered complete when all of the following are true:

- a verified account domain can be created and checked through API
- DKIM configuration exists and is usable for signing
- an authenticated customer can submit an outbound email over HTTP
- the system persists the message durably before acknowledging success
- the system enqueues asynchronous delivery work
- a worker can deliver the message through the provider abstraction
- message state transitions are persisted and queryable
- suppressed recipients are blocked
- idempotency prevents duplicate accepted sends for the same request scope
- revoked API keys are rejected
- logs and errors are structured and safe
- the system remains compatible with future horizontal scaling

---

## 21. Notes for the coding agent

When implementing, optimize for:

- very small PRs
- strict typing
- clear runtime schemas
- minimal hidden magic
- deterministic state transitions
- reusable service boundaries
- GraphQL schema shapes that are friendly to Relay
- TanStack Start wiring that stays thin and replaceable
- code that can later be split into separate app/API and worker deployments without redesigning the core domain model

