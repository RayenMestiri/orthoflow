# OrthoFlow Production Operations

## Supported topology

Run one backend replica behind one trusted HTTPS reverse proxy. Serve Angular and `/api/v1` from the same public origin; the supplied Nginx container proxies `/api/` to Fastify. MongoDB Atlas, Cloudinary, and SMTP remain managed dependencies. Set `TRUST_PROXY_HOPS=1` for this topology and keep `API_REPLICA_COUNT=1`; startup rejects horizontal scaling because rate limits are currently process-local.

TLS must terminate at the public edge, redirect HTTP to HTTPS, and preserve `X-Forwarded-Proto`. Keep the backend private. Store all production secrets in the hosting provider's encrypted secret store, never in an image, Angular bundle, Git, or `.env` artifact.

## Deployment gate and order

1. Deploy to staging with synthetic data and production builds.
2. Run backend lint, typecheck, tests, build, and `npm audit --omit=dev`.
3. Run frontend lint, tests, build, and the dependency audit.
4. Back up MongoDB and confirm Cloudinary asset recovery is enabled.
5. Run `npm run media:private:plan`; after review, run `npm run media:private:apply` once.
6. Run `npm run db:indexes:apply` in staging, inspect query latency, then run it in production before the API deployment. The command creates missing indexes and does not drop existing ones.
7. Deploy the immutable images, wait for `/health/ready`, then perform the clinic smoke test.
8. Roll back to the previous image if readiness or smoke checks fail. Schema changes in this milestone are additive.

Production deploys are blocked by any failed CI job or invalid environment. Never seed production.

## Backup and recovery

The clinic owner and platform operator must agree on retention with legal counsel. Initial operational baseline:

- MongoDB Atlas continuous backup/PITR where available, daily snapshot, 35-day retention, monthly snapshot for 12 months, encryption enabled.
- A named operator reviews backup status daily and alerts on any failed snapshot.
- Cloudinary backup/versioning must be enabled in the subscribed plan. Export asset metadata (`publicId`, delivery type, resource type, format, record ID) after each production backup window.
- Never treat MongoDB backup as media backup.

Quarterly, restore the latest Mongo snapshot into an isolated staging project. Verify per-clinic counts for patients, guardians, appointments, treatments, cash records, receipts, consents, documents, media, tasks, and audit logs; run `validate`/index inspection; open sampled relationships and protected files. Record date, backup identifier, RPO/RTO, discrepancies, operator, and sign-off in `docs/RESTORE-DRILL.md`. Destroy the isolated restore after evidence is retained. Never restore over production.

## Monitoring and alerting

Ship structured stdout logs to the hosting provider with restricted access and retention. Alert on readiness failure, HTTP 5xx rate, p95 latency, process restart, Mongo pool/connectivity, worker batch failures, communication delivery failures, Cloudinary errors, CPU/memory, and disk pressure. `x-request-id` is returned to users and included in request logs; request bodies and credentials must not be exported.

Use provider error tracking only with request/body capture disabled and PII scrubbing enabled. The API warns for requests slower than `SLOW_REQUEST_THRESHOLD_MS` without logging query values. Suggested pilot objectives: availability 99.5%, p95 reads under 750 ms, p95 writes under 1.5 s; tune only from staging/pilot measurements.

## Performance and launch validation

Run bounded staging load at 10, 25, then 50 virtual users over dashboard, schedule, patient profile, reception, search, and portal reads. Stop on sustained errors, p95 above 2 seconds, or Mongo saturation. Do not load-test production. Browser-smoke all core workflows at 1440, 1280, 1024, 768, 430, 390, and 360 pixels using synthetic records.

Before go-live, verify one complete synthetic clinic workflow, expired/revoked tokens, cross-tenant ID rejection, duplicate payment/consent commands, provider outage behavior, and graceful SIGTERM drain.

## Data retention

Patient and media removal is archival in normal workflows. Permanent patient-media deletion is not exposed by the API or UI. Financial records, receipts, signed consents, generated documents, and audit history remain traceable. Portal access revocation must immediately remove the guardian relationship's access. Any exceptional erasure requires an approved, audited operator procedure and external retention review.
