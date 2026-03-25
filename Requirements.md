# Gebna Cloud — Outbound Email Service Requirements

## 1. Document purpose

This document defines the implementation requirements for the first Gebna Cloud service: an outbound email platform.

The service exposes a GraphQL API over HTTP that allows authenticated customers to send arbitrary email messages to arbitrary recipients, provided the customer has verified and configured a sending domain.

This document is intentionally implementation-oriented. It excludes billing, pricing, landing pages, marketing pages, and other go-to-market material. It is meant to be handed to a coding agent and implemented in small, reviewable tasks.

---

## 2. Product goal

Build a modern outbound email service that:

- lets a customer create and verify a sending domain
- lets a customer send email through a GraphQL API
- supports plain text and HTML emails
- supports common headers and metadata needed for real-world use
- records message lifecycle state for observability and support tooling
- is designed as a monolith initially
- preserves a path to future horizontal scaling without major redesign

---

## 3. Primary use case

A customer signs up, proves ownership of `example.com`, configures the required DNS records, gets an API key, and sends requests such as:

- transactional emails
- notifications
- one-off emails
- programmatic emails from applications and backends

The system accepts the request, validates it, creates a durable message record, queues the message for delivery, attempts delivery through the provider’s sending pipeline, and exposes status back to the customer through GraphQL queries.

---

## 4. Non-goals

The following are out of scope for this version:

- billing and invoices
- pricing plans
- landing pages and public marketing pages
- inbound email receiving
- mailbox hosting
- template builders
- dedicated IP purchase flows
- reseller features
- multi-region deployment
- customer webhooks for delivery events
- attachments are out of scope for v1

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
- Vite
- Relay compiler
- Vitest
- Valibot for runtime validation of external input

### 5.2 Required application stack

The application stack must use:

- TanStack Start as the full-stack React framework
- React for the UI layer
- Relay as the GraphQL client
- GraphQL API
- GraphQL Yoga
- better-auth for customer authentication and API-key lifecycle management
- Pothos as the GraphQL schema builder
- Drizzle ORM for persistence
- Drizzle Relational Queries v2 (beta) for relational reads
- Tailwind CSS for utility-first styling
- daisyUI for component-level styling primitives on top of Tailwind CSS

TanStack Start is the required application framework for the monolith and must host the customer-facing application and GraphQL API surface. React is the UI runtime. Relay is the required GraphQL client for app-side data access. better-auth is the required authentication system for signup, sign-in, sign-out, session handling, and API-key management. GraphQL Yoga must serve the generated schema. Tailwind CSS is the required styling foundation, and daisyUI is the required component class system. Pothos generates a standard GraphQL schema, and Drizzle RQB v2 is the required relational query layer for nested and related reads.

### 5.3 Runtime and deployment target

The service must target a standard Node.js runtime and containerized deployment model.

Requirements:

- the runtime must be Node.js
- the deployment model must be containerized
- v1 must ship as a single deployable Node.js application bundle
- background job handlers are logical components within that same deployable bundle in v1
- configuration must come from validated environment variables suitable for Node.js and containerized deployments

### 5.4 Code quality

The implementation must emphasize:

- full type safety across GraphQL schema definitions, resolver inputs, business logic, persistence, and internal events
- explicit schemas for all external input
- small modules with narrow responsibilities
- deterministic error handling
- testable service boundaries

### 5.5 Architecture direction

The initial implementation is a monolith, and it must preserve a straightforward path to future horizontal scaling.

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
4. better-auth-backed authentication and API keys
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

UI auth rules for v1:

- the frontend talks directly to better-auth only for signup, sign-in, sign-out, and session lifecycle flows
- all product data fetching and product mutations after authentication must go through GraphQL
- GraphQL resolvers use the server-side better-auth instance for API-key management and account identity lookup
- GraphQL product access must support both session-authenticated UI traffic and API-key-authenticated programmatic traffic
- not every GraphQL operation is available under both auth modes; allowed auth modes must be explicit per operation

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

The UI does not need advanced visual polish in v1, but it must be functional and production-usable.

## 7.1 Accounts

The system must support customer accounts.

Each account owns:

- API keys
- verified domains
- sent messages
- suppression entries
- audit-relevant actions

For v1, each authenticated better-auth user maps to exactly one account.

Session-authenticated users and API keys both resolve to account-scoped access, but they remain distinct actor types for authorization and audit purposes.

The signup UX does not need advanced polish in v1, but better-auth-backed signup, sign-in, and sign-out flows are in scope because the admin/customer UI requires them.

## 7.2 Authentication modes

The system must support session-based and API-key-based authentication for product GraphQL access.

Requirements:

- the product GraphQL API must support two auth modes: better-auth session auth for human users and API-key auth for programmatic clients
- both auth modes must resolve to a normalized account context
- the active auth mode must remain visible to resolvers, services, and audit logging
- each GraphQL operation must explicitly declare whether it allows `session`, `api_key`, or both
- each API key belongs to one account
- API-key lifecycle management must be implemented through the better-auth server instance and its API-key capability
- API keys must be stored hashed or otherwise non-recoverably protected by better-auth, never in plaintext after creation
- the full key value is shown only once at creation time
- each API key has a display name
- each API key can be revoked
- revoked keys stop working immediately
- each API-key-authenticated request is authenticated to an account through the API key

## 7.3 Sending domains

A customer must be able to create a sending domain record.

A sending domain includes:

- domain name
- account owner
- status
- DKIM configuration
- SPF guidance metadata
- optional return-path or bounce-domain metadata when the v1 transport supports it
- timestamps

Domain statuses must be explicit.

Minimum required statuses:

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
- provide exact DNS instructions through GraphQL responses
- allow manual DNS re-checks in v1
- persist last verification result
- persist timestamps for checks

Verification must include at minimum:

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
- preserve future key rotation without breaking the domain model

V1 uses one selector per domain. The schema must allow multiple selectors in a future version.

## 7.6 SPF readiness

The system must tell the customer what SPF include mechanism or sending rule is required.

Requirements:

- return machine-readable SPF guidance in the domain details GraphQL response
- perform readiness checks and warn if SPF is missing or clearly invalid
- do not block sending solely because SPF inspection is imperfect, as long as domain ownership and DKIM requirements are satisfied and product policy allows sending

## 7.7 Message submission

The service must expose a GraphQL mutation over HTTP for sending messages.

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

The `sendMessage` mutation must support idempotent retries.

Requirements:

- support a caller-provided idempotency key
- deduplicate repeated submissions within a defined scope
- return the original accepted result when the idempotency key and request fingerprint match
- reject reuse of the same idempotency key with a different request fingerprint
- persist enough request fingerprint data to detect misuse

## 7.10 Durable acceptance model

The system must not claim success only because an upstream SMTP or provider API handoff succeeded.

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

The delivery system must be safe under multiple worker instances.

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

The status model must reserve room for future states such as:

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
- suppression check during GraphQL acceptance before the message is accepted

## 7.16 Rate limiting

The system must support rate limiting.

At minimum:

- per API key rate limiting
- optional per account rate limiting
- clear error response when exceeded

The implementation must not rely on single-process assumptions that would block distributed rate limiting.

## 7.17 Auditability

The system must record operationally important actions.

At minimum:

- API key creation
- API key revocation
- domain creation
- domain verification changes
- manual suppression actions

## 7.18 Status retrieval queries

GraphQL must expose message lookup for the authenticated account.

At minimum:

- fetch message by id
- list recent messages with pagination
- filter by domain and status

The response must not leak internal-only details or data belonging to another account.

---

## 8. API requirements

## 8.1 API style

Use GraphQL served from the TanStack Start application as the default product API surface.

Requirements:

- GraphQL endpoint for customer-facing product API access
- Pothos as the schema builder
- Relay-compliant schema design
- versioned schema change discipline even if the HTTP endpoint path is not versioned
- predictable typed error model
- stable field naming
- separation between GraphQL layer and service layer
- GraphQL is the default interface for all product reads and writes unless a requirement explicitly says otherwise
- signup, sign-in, sign-out, and session lifecycle flows are the allowed v1 exception and are handled through better-auth endpoints
- the GraphQL layer must support both better-auth session auth and API-key auth
- GraphQL must not be treated as globally session-guarded; authorization must be evaluated per operation
- GraphQL request context must include normalized account identity, actor identity, and auth mode

The generated Pothos schema must be a plain GraphQL schema served through GraphQL Yoga.

GraphQL is the only product interface in v1. Auth flows use better-auth directly, but all post-authentication product interactions must use GraphQL.

## 8.2 Relay-oriented schema rules

Requirements:

- design object identities so Relay caching and normalization are straightforward
- use stable globally unique IDs for GraphQL node types
- use connection-style pagination for Relay-driven list fields
- support colocated fragments for domain, message, suppression, and API key views
- use explicit and predictable mutation payload types for Relay consumers

## 8.3 Mutation and query surface required in v1

Minimum GraphQL surface:

Mutations:

- `createApiKey`
- `revokeApiKey`
- `createDomain`
- `verifyDomain`
- `sendMessage`
- `createSuppression`
- `deleteSuppression`

Queries:

- `apiKeys`
- `domains`
- `domain(id)`
- `messages`
- `message(id)`
- `suppressions`

Auth policy for the minimum v1 GraphQL surface:

- session-authenticated only: `createApiKey`, `revokeApiKey`, `apiKeys`, `createDomain`, `verifyDomain`, `domains`, `domain(id)`, `createSuppression`, `deleteSuppression`, `suppressions`
- session-authenticated or API-key-authenticated: `sendMessage`, `messages`, `message(id)`

## 8.4 GraphQL error model

Requirements:

- resolver errors must map from stable domain/service errors
- user-safe messages only
- internal details must stay out of GraphQL responses
- request ID must be included in GraphQL `extensions` and in structured logs

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

Authentication and session persistence are delegated to better-auth and do not need to be standardized by this document beyond the account and API-key integration requirements below.

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

If better-auth manages API-key persistence directly, the physical table shape can differ, but the service must preserve the listed logical fields and behaviors.

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

Note:

- `apiKeyId` must be nullable because a message can be created by a session-authenticated actor rather than an API-key-authenticated actor

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

- all customer product API endpoints require authentication except signup, sign-in, and sign-out flows
- better-auth is the source of truth for customer session authentication and API-key authentication
- session-authenticated user access and API-key-authenticated access are both first-class and must be handled explicitly
- each GraphQL operation must enforce its allowed auth modes rather than assuming one global authentication rule for the whole schema
- API key lookup and verification must be delegated to better-auth server-side APIs or adapters, not to plaintext comparison

## 10.2 Authorization

- every domain, message, suppression entry, and key must be scoped to the authenticated account
- authorization must evaluate both account scope and auth mode
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

Optional in v1:

- metrics counters for accepts, rejects, retries, failures
- latency histograms
- queue depth metrics

---

## 12. Internal architecture requirements

The codebase must be organized into clear layers.

Required logical layering:

- `app/`: TanStack Start routes, request handling, and application wiring
- `auth/`: better-auth server/client setup, auth adapters, and auth helpers
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

- TanStack Start route handlers must stay thin
- React components must fetch through Relay, not ad hoc fetch wrappers
- React auth flows must use better-auth client APIs directly only for signup, sign-in, sign-out, and session lifecycle operations
- Relay queries must be fragment-driven
- auth code must normalize session-authenticated users and API-key-authenticated callers into a shared account-scoped actor context before business logic runs
- services must not depend on GraphQL-, Relay-, or React-specific objects
- repositories must not contain business policy
- worker logic must reuse service-layer code instead of reimplementing business rules
- Drizzle RQB v2 must be used for relational reads that naturally map to nested GraphQL query shapes
- shared UI styling must primarily use Tailwind utility classes plus daisyUI component classes
- custom CSS is allowed only for cases that are hard to express with Tailwind and daisyUI
- shared UI primitives must be used for form inputs, buttons, menus, and loading states instead of re-creating ad hoc markup per screen
- server/runtime code must stay portable to standard Node.js

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
- rate limiting must not rely on in-memory per-process counters for correctness
- request handling does not depend on local memory caches for correctness

---

## 14. Testing requirements

The implementation must include tests.

Minimum required categories:

- schema validation unit tests
- service unit tests
- repository tests for non-trivial query and persistence logic
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
- session-authenticated admin operations succeed
- API-key-authenticated `sendMessage` succeeds when the account and domain are valid
- session-only operations reject API-key authentication
- retryable provider failure is retried
- non-retryable provider failure becomes terminal
- one account cannot read another account’s messages

---

## 15. Delivery provider abstraction

The code must not hard-wire transport logic directly into GraphQL resolvers or general business logic.

Define a provider abstraction that preserves future support for:

- direct SMTP
- third-party mail APIs
- internal MTA pipeline

The provider interface must expose typed outcomes such as:

- success with provider message id
- temporary failure
- permanent failure
- misconfiguration failure

---

## 16. Operational assumptions for v1

Assume:

- one deployed Node.js application bundle initially
- one containerized deployment model initially
- one relational database initially
- one async queue mechanism initially
- one delivery provider implementation initially
- the React UI does not need advanced polish in v1, but it must cover the required admin and customer workflows
- application code must run correctly in the required Node.js runtime

The implementation must avoid single-instance assumptions inside business logic.

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
Set up Vite-based development and build configuration for a Node-targeted TanStack Start application.

### T10. Scaffold TanStack Start application
Create the TanStack Start app scaffold for the Node runtime and establish the top-level app structure.

### T11. Add React app shell
Create the initial React app shell and shared layout primitives.

### T12. Add Tailwind CSS setup
Configure Tailwind CSS in the app using the Vite-oriented integration path.

### T13. Add daisyUI setup
Configure daisyUI as a Tailwind plugin and define the initial theme strategy.

### T14. Add GraphQL server bootstrap
Create the Node-hosted GraphQL Yoga server bootstrap and wire it to the app runtime.

### T15. Add Relay network layer scaffold
Create the Relay network layer that talks to the GraphQL endpoint.

### T16. Add typed Relay environment factory
Build the typed Relay environment initialization for client and server usage.

### T17. Add typed environment config loader
Create a typed configuration module that validates all required Node and Docker environment variables at startup.

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

## Phase B.5 — GraphQL and Relay foundation

### T24. Initialize Pothos SchemaBuilder
Create the central Pothos builder configuration and typed schema context.

### T25. Add GraphQL context factory
Build the request context containing normalized account identity, actor identity, auth mode, request ID, logger, and database handle.

### T26. Add GraphQL scalar strategy
Define the scalar approach for DateTime, JSON, and any custom scalars needed.

### T27. Add GraphQL error mapping utility
Map domain/service errors into GraphQL-safe errors.

### T28. Add root Query and Mutation scaffolding
Create empty root types and modular field registration.

### T29. Add Relay compiler configuration
Set up Relay compiler configuration, schema export automation, and generated artifact conventions.

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

### T36. Provision API-key persistence for better-auth
Add the API-key persistence schema or compatibility contract required by better-auth.

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

### T44. Create queue_jobs table or define the persistent queue contract
Add the persistent queue job representation used by the chosen queue implementation.

### T45. Define Drizzle relations
Declare all table relations needed by Drizzle RQB v2.

### T46. Initialize Drizzle with tables and relations for `db.query`
Wire `drizzle()` initialization so RQB v2 relational reads are available.

## Phase D — repository layer

### T47. Implement account repository
Add typed persistence functions for accounts.

### T48. Implement API key adapter
Add the typed adapter layer that GraphQL resolvers use for API key creation, lookup, revocation, listing, and last-used tracking via better-auth.

### T49. Implement domain repository
Add typed persistence functions for domain lifecycle operations.

### T50. Implement DKIM selector repository
Add typed persistence functions for DKIM selectors.

### T51. Implement message repository
Add typed persistence functions for message creation, reads, and status transitions.

### T52. Implement message recipient repository
Add typed persistence functions for recipient rows.

### T53. Implement delivery attempt repository
Add typed persistence functions for delivery attempt rows.

### T54. Implement suppression repository
Add typed persistence functions for suppression checks and mutations.

### T55. Implement audit log repository
Add typed persistence functions for audit events.

### T56. Implement queue repository or queue adapter
Add typed enqueue, claim, ack, retry, and fail operations.

## Phase E — schema and API contracts

### T57. Define shared API error schema
Add runtime schemas and types for standard error envelopes.

### T58. Define GraphQL object types for API keys
Add Pothos object types and payload types for API key operations.

### T59. Define GraphQL object and input types for domains
Add Pothos object, enum, and input types for domain operations.

### T60. Define GraphQL object and input types for messages
Add Pothos object, enum, and input types for message operations.

### T61. Define GraphQL object and input types for suppressions
Add Pothos object, enum, and input types for suppression operations.

### T62. Define GraphQL pagination types
Add connection or paginated list types for domains, messages, and suppressions.

### T63. Add Relay fragment and query types for domain views
Create the initial Relay query/fragment set for domain lists and domain detail.

### T64. Add Relay fragment and query types for message views
Create the initial Relay query/fragment set for messages and message detail.

### T65. Add Relay mutation types for write operations
Create the initial Relay mutation documents for API key management, domain verification, send message, and suppression changes.

### T66. Define UI view-model types for domains
Create typed view-model boundaries for domain screens.

### T67. Define UI view-model types for messages
Create typed view-model boundaries for message screens.

### T68. Define UI view-model types for API keys and suppressions
Create typed view-model boundaries for API key and suppression screens.

## Phase F — authentication and authorization

### T69. Integrate better-auth server instance
Configure better-auth for TanStack Start, including session auth for the admin UI, API-key support for programmatic clients, and normalized account resolution.

### T70. Wire better-auth client auth flows
Implement signup, sign-in, sign-out, and session lifecycle flows for the admin/customer UI.

### T71. Implement GraphQL authentication context
Authenticate GraphQL requests via better-auth session or better-auth-managed API key and attach normalized account context, actor identity, and auth mode.

### T72. Implement authorization helpers
Add reusable account-scoped access checks.

### T73. Implement revoked-key rejection
Ensure revoked keys are blocked consistently through better-auth-backed API-key validation.

## Phase G — domain lifecycle services

### T74. Implement domain creation service
Create a service that validates input, creates a domain, creates verification token material, and returns DNS instructions.

### T75. Implement DKIM key generation service
Generate DKIM key material and persist the selector record.

### T76. Implement domain ownership verification checker
Resolve and verify ownership TXT records.

### T77. Implement DKIM DNS readiness checker
Resolve and verify DKIM DNS records.

### T78. Implement SPF readiness checker
Inspect SPF DNS presence/readiness and return warnings or readiness details.

### T79. Implement domain verification service
Combine the DNS checks and update domain status deterministically.

### T80. Implement domain pause/disable capability in service layer
Allow internal policy to pause or disable domains cleanly.

## Phase H — message acceptance services

### T81. Implement send-request validation service
Validate sender domain ownership, content presence, recipient counts, and basic limits.

### T82. Implement idempotency lookup service
Check whether the request has already been accepted for the same scope.

### T83. Implement suppression pre-check service
Check whether any intended recipient is suppressed.

### T84. Implement message acceptance service
Persist the message, recipients, initial status, and enqueue a delivery job.

### T85. Implement acceptance transaction boundary
Ensure message creation and job enqueueing happen atomically or with equivalent correctness guarantees.

## Phase I — delivery provider abstraction

### T86. Define delivery provider interface
Create the typed abstraction that the worker uses for sending.

### T87. Implement initial provider adapter
Implement the first concrete provider adapter.

### T88. Map provider responses to internal outcomes
Normalize provider-specific outcomes into typed success/failure categories.

## Phase J — worker and queue processing

### T89. Implement queue claim loop
Create the worker loop that safely claims available jobs.

### T90. Implement message-delivery worker handler
Load message context and run the send pipeline.

### T91. Implement final eligibility re-check before send
Re-check domain status, suppression, and terminal-state safety immediately before delivery.

### T92. Implement delivery attempt recording
Record each provider send attempt with timestamps and result metadata.

### T93. Implement success transition handling
Update message status and provider message ID on success.

### T94. Implement retry scheduling for transient failures
Reschedule transient failures with capped exponential backoff.

### T95. Implement terminal failure handling
Mark non-retryable and exhausted failures as terminal.

### T96. Implement duplicate-processing safety
Ensure worker reprocessing cannot create duplicate final side effects beyond allowed idempotent boundaries.

## Phase K — GraphQL operations

### T97. Implement `createApiKey` mutation
Create the GraphQL mutation for API key creation.

### T98. Implement `revokeApiKey` mutation
Create the GraphQL mutation for API key revocation.

### T99. Implement `apiKeys` query
Create the GraphQL query for listing API keys.

### T100. Implement `createDomain` mutation
Create the GraphQL mutation for domain creation.

### T101. Implement `domains` query
Create the GraphQL query for listing domains.

### T102. Implement `domain(id)` query
Create the GraphQL query for reading a single domain.

### T103. Implement `verifyDomain` mutation
Create the GraphQL mutation for manual verification check triggering.

### T104. Implement `sendMessage` mutation
Create the GraphQL mutation for message submission.

### T105. Implement `messages` query
Create the paginated GraphQL query for message listing.

### T106. Implement `message(id)` query
Create the GraphQL query for message detail.

### T107. Implement `createSuppression` mutation
Create the GraphQL mutation for suppression creation.

### T108. Implement `suppressions` query
Create the GraphQL query for suppression listing.

### T109. Implement `deleteSuppression` mutation
Create the GraphQL mutation for suppression deletion.

### T110. Implement TanStack Start route integration for GraphQL endpoint
Wire the GraphQL execution entrypoint into the TanStack Start application for the Node runtime target.

## Phase K.5 — Basic admin/customer UI

### T111. Implement authenticated app layout
Create the basic logged-in layout using Tailwind and daisyUI primitives.

### T112. Implement domain list page
Create the domain listing screen.

### T113. Implement domain create page/form
Create the domain creation screen and mutation flow.

### T114. Implement domain detail page
Create the domain detail screen with verification instructions and readiness state.

### T115. Implement manual domain verification action
Create the UI action for re-running verification.

### T116. Implement message list page
Create the recent messages screen.

### T117. Implement message detail page
Create the message detail screen.

### T118. Implement API key list/create/revoke page
Create the API key management screen.

### T119. Implement suppression list/create/delete page
Create the suppression management screen.

### T120. Add basic loading, empty, and error states for all admin screens
Ensure every critical screen has usable states.

## Phase L — observability and safety

### T121. Add request logging middleware
Log requests with request ID, account context, and safe metadata.

### T122. Add error-to-response mapper
Map typed domain errors to stable HTTP responses.

### T123. Add message status transition logging
Log important status transitions with message ID.

### T124. Add audit logging hooks
Write audit log records for key operational actions.

### T125. Add metrics hooks
Add metrics counters and timers for key flows.

### T126. Add rate limiting middleware
Add per-key and/or per-account rate limiting.

## Phase M — test coverage

### T127. Add unit tests for email validation
Test valid and invalid email parsing cases.

### T128. Add unit tests for domain validation
Test valid and invalid domain parsing cases.

### T129. Add unit tests for API key auth flow
Test success, bad key, and revoked key cases.

### T130. Add unit tests for domain verification service
Test verification success and failure transitions.

### T131. Add unit tests for message acceptance service
Test happy path and key rejection scenarios.

### T132. Add unit tests for idempotency behavior
Test duplicate send submissions.

### T133. Add unit tests for suppression behavior
Test blocked recipients.

### T134. Add worker tests for retryable failures
Test retry scheduling and attempt increments.

### T135. Add worker tests for permanent failures
Test terminal failure transitions.

### T136. Add integration tests for `sendMessage`
Test end-to-end acceptance behavior through GraphQL.

### T137. Add integration tests for domain GraphQL operations
Test create, read, list, and verify flows through GraphQL.

### T138. Add integration tests for GraphQL auth context
Verify API key authentication and context scoping inside GraphQL execution.

### T139. Add integration tests for Relay query flow
Verify the app-side Relay environment can query and mutate against the GraphQL endpoint correctly.

### T140. Add UI tests for domain management flow
Verify the core domain-management UI path works.

### T141. Add UI tests for API key management flow
Verify create and revoke flows work.

### T142. Add authorization boundary tests
Verify one account cannot access another account’s resources.

## Phase N — implementation hardening

### T143. Review all external schemas for strictness
Ensure no loose or unbounded input objects remain.

### T144. Review logs for secret leakage
Ensure keys and secrets are redacted everywhere.

### T145. Review error codes for consistency
Ensure all domain/service errors map to stable public codes.

### T146. Review database indexes
Add indexes needed for lookup paths, queue claiming, and idempotency checks.

### T147. Review transaction boundaries
Verify correctness for domain creation, message acceptance, and worker transitions.

### T148. Review horizontal-scaling assumptions
Check for in-memory correctness dependencies and remove them.

### T149. Review Relay schema ergonomics
Ensure the schema shape remains practical for fragment colocation, pagination, and mutation updates.

### T150. Review admin UI consistency
Ensure shared Tailwind and daisyUI patterns are applied consistently across screens.

### T151. Produce implementation README
Document local setup, scripts, environment variables, GraphQL schema layout, Relay setup, TanStack Start wiring, better-auth integration, Node/Docker runtime assumptions, Tailwind/daisyUI setup, and service boundaries for future contributors and coding agents.

---

## 19. Recommended implementation order

Use this order when driving a coding agent:

1. T01-T23
2. T24-T46
3. T47-T73
4. T74-T96
5. T97-T126
6. T127-T151

This sequence keeps each review slice focused and limits cross-cutting rework.

---

## 20. Acceptance criteria for v1

The v1 implementation is considered complete when all of the following are true:

- a verified account domain can be created and checked through GraphQL
- DKIM configuration exists and is usable for signing
- an authenticated customer can submit an outbound email through GraphQL
- the system persists the message durably before acknowledging success
- the system enqueues asynchronous delivery work
- a worker can deliver the message through the provider abstraction
- message state transitions are persisted and queryable
- suppressed recipients are blocked
- idempotency prevents duplicate accepted sends for the same request scope
- revoked API keys are rejected
- logs and errors are structured and safe
- the system can run in a standard Node.js containerized deployment
- the system preserves a path to future horizontal scaling

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
- better-auth integration that stays thin and replaceable
- portable Node runtime code
- code that fits a single consistent containerized deployment model without redesigning the core domain model

---

## 22. Backlog

These items are intentionally deferred and should not be treated as required for v1 unless explicitly pulled forward:

### B01. Add automated domain verification re-check scheduling
Periodically re-check DNS for domains that are not yet sendable, persist the latest verification result, and schedule the work in a way that remains safe under multiple worker instances.
