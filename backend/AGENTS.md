# AGENTS.md — OrthoFlow Backend

**Always read this file before changing backend architecture or implementing a new business domain.**

This is the permanent context and architectural rulebook for the OrthoFlow backend. It describes
what the product is, why the architecture looks the way it does, and which shortcuts are forbidden.
When a rule here conflicts with a convenient implementation, the rule wins — or the rule gets
changed here first, deliberately, in the same commit.

---

## 1. Product vision

OrthoFlow is a cloud practice-management platform for orthodontic and dental clinics. It is **not**
an appointment-booking app. It is the system of record a practice runs on: patients, staff,
treatments, scheduling, documents, and the money that changes hands.

The first real user is a single orthodontic clinic. The architecture is multi-tenant SaaS from day
one, because retrofitting tenancy into a live medical-records system is not a refactor — it is a
rewrite with a data-leak incident in the middle.

Eventual domains: clinics, staff, patients, guardians, appointments, appointment types, recurring
visits, treatment plans and timelines, cash records, installments, receipts, waiting lists,
treatment photos, documents, notifications, audit history, analytics, a parent/patient portal, and
multi-clinic organizations.

## 2. Business context that shapes the code

### 2.1 Money is recorded, not processed

OrthoFlow does **not** process online payments. Patients pay physically at the clinic, mostly in
cash. The platform's job is _traceability of money already received_, not payment capture.

This matters more than it sounds. Many orthodontic patients are children. A parent hands their child
money before an appointment; weeks later there is a dispute about whether the clinic ever received
it. The record of "who handed over how much, to which staff member, on which day, against which
treatment" is the product feature.

Consequences that are non-negotiable:

- The domain is called `cash-records`, never `payments-gateway`. Do not import Stripe, do not model
  webhooks, do not create a `PaymentIntent`.
- A financial record is **never** hard-deleted and **never** silently overwritten. Corrections are
  expressed as a status change (`CANCELLED`, `ADJUSTED`) plus a compensating record, and always with
  an audit entry naming the actor and the reason.
- Balances are **derived** from authoritative backend records. A total supplied by the front-end is
  display data, never a source of truth.
- Deleting a user or a treatment must not destroy financial history. Nothing that a cash record
  points at may be hard-deleted.

### 2.2 Patients are often minors

A patient may have a mother, a father, a legal guardian, or several responsible adults; one guardian
may be responsible for several children. The guardian relationship is many-to-many and must never be
modelled as a single `parentId` on the patient.

## 3. Technology

| Concern          | Choice                                           |
| ---------------- | ------------------------------------------------ |
| Runtime          | Node.js ≥ 20.19 (ESM, `"type": "module"`)        |
| HTTP             | Fastify 5                                        |
| Language         | TypeScript 5.9, `strict`, `NodeNext`             |
| Database         | MongoDB Atlas + Mongoose 9                       |
| Validation       | Zod 4 (runtime) — types alone are not validation |
| Auth             | JWT access tokens + rotating refresh tokens      |
| Password hashing | Argon2id                                         |
| Media            | Cloudinary (behind `MediaService`)               |
| Logging          | Pino (via Fastify)                               |
| Docs             | `@fastify/swagger` + `fastify-type-provider-zod` |
| Tests            | Vitest                                           |

Redis is **not** a dependency. It will later back caching, OTP, queues, distributed rate limiting and
background jobs. Nothing in the core domains may assume it exists. Where Redis will slot in, the seam
already exists (rate-limit store, `AuthService.loadAuthenticatedUser`).

Relative imports must carry the `.js` extension — that is `NodeNext` ESM, not a typo.

## 4. Architecture

```
src/
├── app.ts                 # composes plugins + modules
├── server.ts              # process lifecycle
├── config/                # env, database, cloudinary, logger — the ONLY place reading process.env
├── plugins/               # Fastify cross-cutting concerns
├── common/                # errors, constants, types, utils, validation, authorization policy
├── modules/<domain>/      # business domains
└── infrastructure/        # database, security, cloudinary adapters
```

### 4.1 Layers

```
routes  →  controller  →  service  →  repository  →  Mongoose model
```

- **Routes** declare the path, the Zod schemas, and the guards. No logic.
- **Controllers** read validated input, call one service method, shape the response. No branching on
  business state, no database access, no `try/catch`.
- **Services** own use cases and business rules. This is where invariants live.
- **Repositories** own MongoDB access. They are the only files that import a Mongoose model.
- **Mappers** convert persistence records to DTOs, field by field, never by spreading.

> **Never implement a feature only at controller level. Business rules belong in services/domain
> logic and persistence belongs in repositories/data-access layers.**

A "thin controller" that quietly performs a permission check, computes a total, or builds a Mongo
filter is not thin. Move it.

### 4.2 Module layout

```
modules/<domain>/
  <domain>.model.ts       # Mongoose schema
  <domain>.types.ts       # domain types, status enums, DTO shapes
  <domain>.schema.ts      # Zod request/response schemas
  <domain>.repository.ts  # persistence
  <domain>.service.ts     # use cases
  <domain>.mapper.ts      # record → DTO
  <domain>.controller.ts  # HTTP adapter
  <domain>.routes.ts      # route table
```

Combine files when a module is genuinely small (see `audit-logs`, which has no controller because it
has one read endpoint). Do not create empty placeholder files or folders for domains that are not
implemented yet — the directory listing should describe what exists.

Register the module in `src/modules/index.ts`. That file is the whole API surface.

## 5. Multi-tenancy — the most important section

The tenant is the **clinic**. Almost every business document carries `clinicId`.

### 5.1 The rule

> **Never trust `clinicId`, `userId`, `role`, financial totals, ownership information, or privileged
> fields directly from the client.**

The authenticated user's _memberships_ decide which clinics they may touch. A `clinicId` arriving in
a request body is data, not authority — and in practice it is stripped, because create/update Zod
schemas simply do not declare the field.

### 5.2 How a request gets its tenant

1. `app.authenticate` verifies the access token and rebuilds `request.authUser` **from the database**.
2. `app.requireClinic()` resolves the requested clinic from — in order — the route param, the
   `x-clinic-id` header, the query string, or (when the caller belongs to exactly one clinic) that
   membership. Callers with several memberships must be explicit.
3. `buildTenantContext` (in `common/authorization/policy.ts`) verifies an **ACTIVE** membership and
   produces `request.tenant`. A `SUPER_ADMIN` may act without a membership.
4. `app.requirePermission(...)` checks the permission table for that clinic role.
5. Controllers read `requireTenant(request).clinicId`. Services take `clinicId` as their first
   parameter. Repositories put it in the Mongo filter.

### 5.3 Repository rules

- Every read or write of a tenant-scoped collection includes `clinicId` in the filter.
- There is no `findById(patientId)` — only `findByIdInClinic(patientId, clinicId)`. A lookup by id
  alone is a cross-tenant read waiting to be called from the wrong place.
- A resource in another clinic returns **404**, not 403. Confirming an id exists elsewhere is a leak.
- Every index on a tenant-scoped collection starts with `clinicId`.
- No unbounded queries. List endpoints go through `toPaginationParams`, which caps page size at 100.

## 6. Authentication

- Argon2id for passwords (OWASP baseline parameters, `MAX_PASSWORD_BYTES` guard against DoS).
- `passwordHash` is `select: false` on the schema. Loading it requires an explicit, greppable
  `.select('+passwordHash')`, and only `findByEmailForAuthentication` does it.
- The access token carries `{ sub, sid, typ }` — an id and a session, **never a role or a clinic**.
  Identity and authority are re-read from the database on every request so a revoked membership takes
  effect immediately instead of at the next token expiry.
- Refresh tokens are **never stored raw**. The SHA-256 digest is stored; the token is 256 bits of
  entropy, so a slow KDF would buy nothing.
- Refresh tokens **rotate**. Rotation is one atomic `revokeIfActive`; whoever wins gets the new pair.
- Presenting an already-rotated token is treated as theft: the whole token _family_ is revoked and an
  `auth.refresh_reuse_detected` audit entry is written.
- Logout revokes the session, which also kills in-flight access tokens (the guard checks
  `isSessionUsable`).
- Login must not reveal whether an email is registered: unknown accounts still pay the Argon2 cost.

Implemented in this milestone: password reset and email verification with expiring,
single-use, attempt-limited codes delivered through backend SMTP. Still to build: MFA.

## 7. Authorization (RBAC)

Two independent planes:

- **Platform role** on the user: `SUPER_ADMIN` | `USER`. `SUPER_ADMIN` is OrthoFlow staff.
- **Clinic role** on the membership: `CLINIC_OWNER`, `ORTHODONTIST`, `DENTIST`, `SECRETARY`,
  `ASSISTANT`. Future: `PATIENT`, `GUARDIAN` (portal access — do not add until the portal exists).

Authentication answers _"who are you?"_. Authorization answers _"are you allowed to do this in **this
clinic**?"_. Always enforce both.

Rules:

- Never write `if (role === 'SECRETARY')` in a route, controller or service. Declare a permission.
- Permissions live in `common/constants/permissions.ts`; the role→permission table is the single
  place a new role is wired up.
- Authorization decisions live in `common/authorization/policy.ts`, which imports neither Fastify nor
  Mongoose so it stays unit-testable.

## 8. Users, clinics and memberships

A user belongs to **many** clinics. `ClinicMembership { userId, clinicId, role, status, invitedBy,
joinedAt, removedAt }` is the only place a clinic role is stored, with a unique index on
`(userId, clinicId)`.

- Re-hiring someone reactivates their existing membership rather than inserting a second row.
- Removal is `status: REMOVED`, never a delete — past appointments and cash records must keep
  resolving to the person who handled them.
- A clinic must always keep at least one ACTIVE `CLINIC_OWNER` (`assertClinicKeepsAnOwner`).
- Nobody may change their own membership.

## 9. Database conventions

- One collection per major growing domain. **Do not** embed appointments, treatments, payments or
  photos in the patient document — that document must not grow without bound over years of care.
- Explicit `collection` names in camelCase (`clinicMemberships`, `authSessions`, `auditLogs`).
- `timestamps: true` everywhere except audit logs, which are append-only (`updatedAt: false`).
- `strict: 'throw'` on every schema, so a stray `isSuperAdmin: true` in a payload cannot reach Mongo.
- Unique constraints are enforced by indexes, not by an application-level "check then insert".
- Reads use `.lean<T>()` — we serialize DTOs, we do not need hydrated documents.
- `autoIndex` is off in production; index builds are a deploy step.
- Multi-document consistency uses `withTransaction` (Atlas is a replica set). Registration creates
  user + clinic + membership + audit entries in one transaction: a clinic with no owner is
  unrecoverable through the API.

### Query-injection policy

Mongoose's `sanitizeFilter` is deliberately **off** — it also rewrites the legitimate operator
objects repositories build (`{ $gte: date }`). Injection is prevented one layer earlier: every value
that reaches a filter has passed a Zod schema that admits only primitives, so a client cannot smuggle
`{ "$ne": null }` into a query. If you ever build a filter from an unvalidated value, you have
introduced the vulnerability this policy assumes cannot exist.

User-supplied search terms go through `escapeRegex` before becoming a regex.

## 10. Validation

- Zod validates **body, query, params and environment**. TypeScript disappears at runtime.
- One schema serves both validation and OpenAPI documentation, so the docs cannot drift.
- Response schemas are enforced too: `fastify-type-provider-zod` serializes replies through them, so
  a handler that accidentally returns a raw Mongoose document cannot leak a field.
- Create/update schemas simply **omit** server-owned fields (`clinicId`, `status`, `slug`,
  `createdBy`). Zod strips unknown keys, so sending them is a no-op rather than an escalation.

## 11. API conventions

- REST, versioned under `/api/v1`. `/health` sits outside the version prefix.
- Plural resource nouns; nested routes only for genuine containment
  (`/clinics/:clinicId/members`).
- `PATCH` for partial updates. No `DELETE` on anything a financial or clinical record points at —
  use archive/status transitions.
- Response envelopes:

```jsonc
{ "success": true, "data": {} }

{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 100, "pages": 5 } }

{ "success": false, "error": { "code": "PATIENT_NOT_FOUND", "message": "Patient not found" } }
```

- `error.code` is a stable API contract (`common/constants/error-codes.ts`). Messages may change;
  codes may not.

## 12. Error handling

- Throw typed errors from `common/errors`: `ValidationError` (400), `UnauthorizedError` (401),
  `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `BusinessRuleError` (422),
  `RateLimitError` (429), `ServiceUnavailableError` (503).
- **Do not scatter `try/catch` + `reply.status(...)` through controllers.** One error handler
  (`plugins/error-handler.plugin.ts`) decides status, log level and what the client may see.
- Anything that is not an `AppError` is a bug: logged with its stack, reported as a generic 500.
- Stack traces are never serialized to clients, in any environment.

## 13. Logging

- Structured Pino via Fastify. Request id, method, route, status and duration come for free; the auth
  guard adds `userId` and `clinicId` to the request's child logger.
- **Never log**: passwords, password hashes, access or refresh tokens, token digests, secrets,
  connection strings, or clinical content. The redaction list in `config/logger.ts` is the
  enforcement point.
- Expected 4xx: one `warn` line with the code. Unexpected 5xx: `error` with the stack.

## 14. Security checklist for any new endpoint

- [ ] Helmet, CORS, cookie and rate-limit plugins apply (they are global).
- [ ] Body, query and params validated by Zod.
- [ ] `app.authenticate` unless the route is deliberately public.
- [ ] `app.requireClinic()` for anything tenant-scoped.
- [ ] `app.requirePermission(...)` with a declared permission.
- [ ] Repository filters include `clinicId`.
- [ ] Response schema declared, so nothing extra can be serialized.
- [ ] Audit entry for any sensitive change.
- [ ] Never expose: `MONGODB_URI`, JWT secrets, Cloudinary secrets, password hashes, token digests.

## 15. Audit requirements

Audit these, at minimum: patient created/updated/archived, cash record created/cancelled/adjusted,
appointment cancelled, treatment modified, membership role or status changed, login, logout, refresh
replay detection.

- Entries capture `clinicId`, `actorUserId`, `action`, `resourceType`, `resourceId`, `metadata`,
  `ip`, `userAgent`, `createdAt`.
- Metadata records **what** changed (field names), not a second copy of the data. Never tokens,
  passwords or clinical notes.
- Audit logs are append-only. There is no update or delete path, and only `CLINIC_OWNER` may read
  them.
- Use `auditLogService.record()` inside the transaction for financially or legally meaningful
  changes; `recordSafe()` only for peripheral events where a logging hiccup must not fail the
  operation.

## 16. Cloudinary / media

- Only `MediaService` (`infrastructure/cloudinary/media.service.ts`) may import the Cloudinary SDK.
  Controllers and services depend on the interface.
- Binaries live in Cloudinary; **metadata lives in MongoDB**.
- Assets are stored under `<root>/clinics/<clinicId>/<scope>`, so tenancy holds even at the storage
  provider.
- Cloudinary is optional: a deployment without credentials boots fine and media becomes unavailable.

## 17. Testing

- Vitest. `npm test` must pass before anything is considered done.
- Test what would actually hurt if it broke: environment validation, password hashing, the JWT flow,
  authorization decisions, tenant isolation, and at least one protected route per module.
- Integration tests use `buildApp({ withDatabase: false })` with mocked repositories, so the real
  routing/validation/auth/tenancy pipeline runs without MongoDB.
- `tests/helpers/repository-mocks.ts` must never import `src/app.ts` — `vi.mock` factories import it,
  and the cycle deadlocks the run.
- Do not write tests that only raise the count.

## 18. Naming conventions

| Thing                   | Convention                                  |
| ----------------------- | ------------------------------------------- |
| Files                   | `kebab-case.role.ts` (`patient.service.ts`) |
| Classes                 | `PascalCase`                                |
| Functions, variables    | `camelCase`                                 |
| Constants, enum members | `SCREAMING_SNAKE_CASE`                      |
| Mongo collections       | `camelCase` plural                          |
| Routes                  | `kebab-case` plural (`/cash-records`)       |
| Error codes             | `SCREAMING_SNAKE_CASE`                      |
| Audit actions           | `resource.verb` (`patient.archived`)        |

## 19. Prohibited shortcuts

1. Business logic in a controller or a route handler.
2. Reading `process.env` outside `src/config/env.ts` (ESLint blocks it).
3. Trusting `clinicId`, `userId`, `role` or a money total from a request payload.
4. A MongoDB query on a tenant-scoped collection without `clinicId` in the filter.
5. An unbounded `find()` with no pagination.
6. `any`, or a cast used to silence a real type error.
7. Hard-deleting a patient, a user, a treatment, a cash record or an audit log.
8. Recomputing or accepting a financial balance from the client.
9. Logging secrets, tokens or clinical content.
10. Importing the Cloudinary SDK outside `MediaService`.
11. `try/catch` + `reply.status(...)` inside a controller.
12. Adding a dependency without a stated reason.
13. Creating empty folders or placeholder files for unimplemented domains.

## 20. Current development stage

**Milestone 1 — foundation. Complete.**

Implemented:

- Project setup: TypeScript strict, ESLint, Prettier, Vitest, build/dev scripts.
- Validated environment configuration and structured logging.
- MongoDB connection, transaction helper, query helpers.
- Centralized error handling and the response envelope.
- OpenAPI 3.1 docs generated from the Zod schemas.
- Auth: register (clinic + owner bootstrap), login, refresh with rotation and replay detection,
  logout, `GET /auth/me`.
- Users, clinics, clinic memberships.
- RBAC and tenant isolation.
- Patients — the first business domain, used as the reference implementation.
- Audit logging (write side wired into services; read side for clinic owners).
- `/health` and `/health/ready`.
- Media service abstraction (no upload endpoints yet).
- Development seed script.

**Deliberately not built yet** — do not add these without a milestone:
appointments and scheduling, treatments, cash records, receipts, guardians, notifications, Redis,
analytics, AI, the parent portal, PDF receipt generation, media upload endpoints.

### Notes for the next milestones

- **Guardians** come before cash records: a cash record references the guardian who handed the money
  over, and the patient↔guardian relation is many-to-many (its own collection, not an array on the
  patient).
- **Receipt numbering** must not be derived from a document count — that races and re-uses numbers
  after a cancellation. Use a dedicated `counters` collection with an atomic
  `findOneAndUpdate({ _id: 'receipt:<clinicId>:<year>' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })`,
  and format as `<clinicPrefix>-<year>-<seq padded>`. Uniqueness scope: clinic + year.
- **Appointments** should be added as a module exactly like `patients`: statuses `SCHEDULED`,
  `CONFIRMED`, `ARRIVED`, `WAITING`, `IN_TREATMENT`, `COMPLETED`, `NO_SHOW`, `CANCELLED`. Store
  instants in UTC and render in the clinic's `timezone`. Do not build recurrence yet, but do not
  model the collection in a way that forbids it.
- **Redis** slots into the rate-limit store and `AuthService.loadAuthenticatedUser` first. Neither
  requires touching a domain module.
