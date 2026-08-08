# OrthoFlow — Backend API

Practice-management API for orthodontic and dental clinics: patients, staff, treatments, scheduling,
and traceable records of cash received at the clinic.

Multi-tenant SaaS from day one — a clinic is the tenant boundary, and one practice can never read
another practice's patients or money.

> Architecture rules and domain context live in **[AGENTS.md](./AGENTS.md)**. Read it before adding a
> business domain.

---

## Technology

| Concern    | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Runtime    | Node.js ≥ 20.19 (ESM)                                       |
| Framework  | Fastify 5                                                   |
| Language   | TypeScript 5.9 (`strict`, `NodeNext`)                       |
| Database   | MongoDB Atlas + Mongoose 9                                  |
| Validation | Zod 4 — one schema validates the request _and_ documents it |
| Auth       | JWT access tokens + rotating, revocable refresh tokens      |
| Passwords  | Argon2id                                                    |
| Media      | Cloudinary (behind `MediaService`)                          |
| Logging    | Pino (structured, with redaction)                           |
| Docs       | OpenAPI 3.1 at `/docs`                                      |
| Tests      | Vitest                                                      |

Redis is **not** required. It will later back caching, OTP, queues and background jobs; nothing in
the core domains assumes it exists.

## Requirements

- Node.js **20.19+** (24 LTS recommended)
- npm 10+
- A MongoDB Atlas cluster (or any replica set — transactions are used)
- A Cloudinary account (optional; media features degrade gracefully without it)

## Installation

```bash
npm install
```

## Environment setup

```bash
cp .env.example .env
```

Every variable is validated at boot by `src/config/env.ts`. A missing or malformed value fails the
process immediately with a list of every problem — the API never starts half-configured.

Generate the two JWT secrets (they must differ, and be at least 32 characters):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable                       | Required | Notes                                                |
| ------------------------------ | -------- | ---------------------------------------------------- |
| `NODE_ENV`                     |          | `development` \| `test` \| `production`              |
| `PORT` / `HOST`                |          | Defaults `4000` / `0.0.0.0`                          |
| `LOG_LEVEL`                    |          | Pino level, default `info`                           |
| `MONGODB_URI`                  | ✅       | `mongodb+srv://…`                                    |
| `MONGODB_DB_NAME`              |          | Default `orthoflow`                                  |
| `MONGODB_TRANSACTIONS_ENABLED` |          | Set `false` only for a standalone mongod             |
| `JWT_ACCESS_SECRET`            | ✅       | ≥ 32 chars                                           |
| `JWT_REFRESH_SECRET`           | ✅       | ≥ 32 chars, different from the access secret         |
| `JWT_ACCESS_EXPIRES_IN`        |          | Default `15m`                                        |
| `JWT_REFRESH_EXPIRES_IN`       |          | Default `30d`                                        |
| `CLOUDINARY_*`                 |          | Media stays disabled when unset                      |
| `FRONTEND_URL`                 |          | CORS origin, default `http://localhost:4200`         |
| `RATE_LIMIT_*`                 |          | Global budget; auth routes get their own tighter one |
| `SWAGGER_ENABLED`              |          | Never served in production regardless                |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL`  |          | Only this address may become the first `SUPER_ADMIN` |

**Never commit `.env`.** It is gitignored; `.env.example` is the template.

## MongoDB Atlas setup

1. Create a cluster (the free M0 tier is enough for development).
2. **Database Access** → create a user with _Read and write to any database_.
3. **Network Access** → allow your IP. `0.0.0.0/0` is convenient for development and unacceptable in
   production.
4. Copy the connection string into `MONGODB_URI` and append the database name:
   `…mongodb.net/orthoflow?retryWrites=true&w=majority`.

Atlas is a replica set, so multi-document transactions work out of the box. Registration relies on
them: a clinic created without its owner would be unrecoverable through the API.

Indexes are created automatically outside production (`autoIndex`). In production, treat index builds
as a deploy step.

## Commands

```bash
npm run dev          # watch mode with pretty logs
npm run build        # type-check and emit to dist/
npm start            # run the compiled build
npm run typecheck    # types only, no emit
npm run lint         # ESLint (type-aware)
npm run lint:fix     # ESLint with autofix
npm run format       # Prettier
npm test             # Vitest, single run
npm run test:watch   # Vitest, watch
npm run test:coverage
npm run seed         # development seed data
```

## API documentation

With the server running in development: **http://localhost:4000/docs**

The OpenAPI document is generated from the same Zod schemas that validate requests at runtime, so it
cannot drift from the implementation. Swagger UI is disabled in production.

## Endpoints (milestone 1)

| Method | Path                                              | Purpose                                   |
| ------ | ------------------------------------------------- | ----------------------------------------- |
| GET    | `/health`                                         | Liveness                                  |
| GET    | `/health/ready`                                   | Readiness incl. database                  |
| POST   | `/api/v1/auth/register`                           | Create a clinic and its owner             |
| POST   | `/api/v1/auth/login`                              | Sign in                                   |
| POST   | `/api/v1/auth/refresh`                            | Rotate the refresh token                  |
| POST   | `/api/v1/auth/logout`                             | Revoke this (or every) session            |
| GET    | `/api/v1/auth/me`                                 | Current user and memberships              |
| GET    | `/api/v1/clinics`                                 | Clinics the caller belongs to             |
| GET    | `/api/v1/clinics/:clinicId`                       | Clinic profile                            |
| PATCH  | `/api/v1/clinics/:clinicId`                       | Update clinic profile                     |
| GET    | `/api/v1/clinics/:clinicId/members`               | List staff                                |
| POST   | `/api/v1/clinics/:clinicId/members`               | Add staff (creates the account if needed) |
| PATCH  | `/api/v1/clinics/:clinicId/members/:membershipId` | Change role or status                     |
| DELETE | `/api/v1/clinics/:clinicId/members/:membershipId` | Remove from clinic (soft)                 |
| GET    | `/api/v1/patients`                                | List patients                             |
| POST   | `/api/v1/patients`                                | Create a patient                          |
| GET    | `/api/v1/patients/:patientId`                     | Read a patient                            |
| PATCH  | `/api/v1/patients/:patientId`                     | Update a patient                          |
| POST   | `/api/v1/patients/:patientId/archive`             | Archive (never delete)                    |
| POST   | `/api/v1/patients/:patientId/restore`             | Restore an archived patient               |
| GET    | `/api/v1/audit-logs`                              | Clinic audit trail (owner only)           |

### Choosing a clinic

Most staff work in one clinic, and the server infers it from their membership. Someone who works in
several must say which:

```
x-clinic-id: <clinicId>
```

The header is only a _request_. The server always verifies an ACTIVE membership behind it.

## Response format

```jsonc
// success
{ "success": true, "data": { } }

// paginated
{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 100, "pages": 5 } }

// error
{ "success": false, "error": { "code": "PATIENT_NOT_FOUND", "message": "Patient not found" } }
```

`error.code` is stable and safe to branch on. Stack traces are never returned.

## Quick start

```bash
npm run seed
```

Then sign in (development credentials, printed by the seed script):

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@orthoflow.test","password":"OrthoFlow-Dev-2026"}'
```

Or register a fresh clinic:

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "firstName":"Amine","lastName":"Ben Salah",
    "email":"amine@clinic.tn","password":"Str0ngPassphrase",
    "clinic":{"name":"Cabinet Al Amal"}
  }'
```

## Architecture

```
src/
├── app.ts              # composes plugins and modules
├── server.ts           # listen, graceful shutdown
├── config/             # env, database, cloudinary, logger  (only place reading process.env)
├── plugins/            # security, database, auth guards, swagger, error handler
├── common/             # errors, constants, types, utils, validation, authorization policy
├── modules/            # auth, users, clinics, memberships, patients, audit-logs, health
└── infrastructure/     # mongoose connection/transactions, argon2, JWT, cloudinary
```

Request flow:

```
routes → guards → controller → service → repository → Mongoose
           │          │           │           │
           │          │           │           └── clinicId is always in the filter
           │          │           └── business rules and invariants live here
           │          └── reads validated input, calls one service, shapes the response
           └── authenticate → requireClinic → requirePermission
```

### Modules

| Module        | What it owns                                                             |
| ------------- | ------------------------------------------------------------------------ |
| `auth`        | Registration, login, refresh rotation, logout, sessions                  |
| `users`       | Platform accounts (deliberately clinic-agnostic)                         |
| `clinics`     | The tenant root                                                          |
| `memberships` | Who works where, with what role — the only place a clinic role is stored |
| `patients`    | First business domain; the reference implementation for new modules      |
| `audit-logs`  | Append-only trail of business events                                     |
| `health`      | Liveness and readiness probes                                            |

## Security notes

- **Tenant isolation** — every tenant-scoped query filters on `clinicId`, taken from the caller's
  verified membership. A `clinicId` in a request body is ignored. A resource in another clinic
  answers 404, never 403.
- **Passwords** — Argon2id with OWASP baseline parameters. Hashes are `select: false` and never
  serialized.
- **Tokens** — access tokens carry only an id and a session, so a revoked role takes effect on the
  next request rather than at the next expiry. Refresh tokens are stored as SHA-256 digests, rotate
  on every use, and a replayed token burns its entire family.
- **Input** — Zod validates body, query, params and the environment. Responses are serialized through
  their schemas, so a handler cannot leak an extra field.
- **Transport** — Helmet headers, an explicit CORS allow-list, a 1 MiB body limit, global rate
  limiting plus a tighter budget on credential endpoints.
- **Errors** — one central handler; no stack traces leave the process.
- **Logging** — passwords, tokens, digests, cookies and authorization headers are redacted at the
  logger.
- **Deletion** — patients, users, memberships and financial records are archived or status-changed,
  never destroyed.

## Roadmap

Milestone 1 (this release) covers the foundation, authentication, tenancy, RBAC and the patients
domain. Next: guardians, appointments, treatments, cash records and receipts — in that order, for the
reasons set out in [AGENTS.md](./AGENTS.md#20-current-development-stage).
