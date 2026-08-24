# Security and Tenant-Isolation Baseline

## Protected assets and controls

Patient, guardian, clinical, financial, receipt, consent, document, media, portal, and staff-authentication data are sensitive. Staff and portal JWT audiences and signing secrets are separate. Access tokens are short-lived bearer tokens; rotating refresh tokens are held in `HttpOnly`, `Secure`, `SameSite=Lax` cookies in production and are not returned in API JSON.

Every clinic resource read and mutation must include the authenticated `clinicId`; an object ID is never authorization. Backend permissions are authoritative. Portal reads additionally prove `PortalUser → Guardian → Patient` access. Frontend visibility is only a usability layer.

| Threat                        | Enforced boundary                                                                |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Cross-clinic ID guessing      | Tenant-scoped repository filters and integration tests                           |
| Broken role access            | Backend permission guards and role tests                                         |
| Stolen/replayed refresh token | Rotation, family revocation, cookie-only transport                               |
| Brute force/abuse             | Global and credential-route IP limits; single-replica fail-fast                  |
| Public clinical media         | Cloudinary authenticated delivery and short-lived authorized URLs                |
| Upload abuse                  | One-file multipart cap, MIME allowlist, structure/magic validation, passive PDFs |
| XSS/embedding                 | Angular escaping, CSP, frame denial, URL allowlists                              |
| Secret/PII leakage            | Validated environment, Pino redaction, safe errors with request IDs              |
| Partial media failure         | Compensating deletion of newly uploaded orphan assets                            |
| Backup loss                   | Atlas PITR/snapshots plus separately verified Cloudinary recovery                |

## Review rules

For every new route, add unauthenticated, unauthorized-role, foreign-clinic-ID, invalid-input, and success tests. Queries for patient, guardian, treatment, appointment, visit, payment, receipt, media, follow-up, retention, task, consent, document, notification, and portal resources must visibly carry clinic or guardian relationship context.

Never log request bodies, clinical note text, patient DTOs, signatures, PDF bytes, tokens, passwords, destinations, or encrypted provider payloads. Use the returned request ID for support correlation.

Report suspected vulnerabilities privately to the designated platform operator. Do not place patient data, secrets, or exploit details in public issues.
