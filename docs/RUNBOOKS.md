# Production Runbooks

## Backend will not start

Check the first structured fatal log and environment validation output. Confirm the secret store is mounted, Mongo URI is non-local, HTTPS origin/CORS values are exact, Cloudinary/SMTP variables exist, JWT secrets are distinct, `TRUST_PROXY_HOPS` is explicit, and Atlas permits the host. Do not weaken validation. Roll back the image if the previous release starts with the same environment.

## MongoDB outage

Confirm Atlas status and `/health/ready` failure. Stop deployments and nonessential jobs; do not retry writes manually. Preserve request IDs and timestamps. After recovery, verify worker leases, recent cash/consent operations, and outbox backlog before restoring traffic. Escalate prolonged outage using the Atlas support plan.

## Cloudinary outage

Uploads and protected downloads should fail safely; metadata must not pretend success. Keep existing DB records. Record the outage window, disable repeated manual retries, and reconcile assets against Mongo metadata after recovery. Run the private-media plan command; never bulk-delete unmatched provider assets without review.

## Communication provider outage

Confirm worker failure codes and provider status. Jobs remain retryable through the outbox/lease model. Disable the affected channel if retries risk rate abuse, preserve queued jobs, then re-enable after a sandbox send. Do not copy destinations or message bodies into tickets.

## Restore backup

Create a new isolated Atlas project/cluster, restrict network access, restore the chosen recovery point, run the verification checklist in `PRODUCTION.md`, and document results in `RESTORE-DRILL.md`. Production cutover requires an incident lead, explicit clinic approval, a written recovery point, and a separate plan; never overwrite production during a drill.

## Compromised staff account or secret

Suspend the membership/account, revoke all sessions, preserve audit and access logs, and assess affected clinics. Rotate the relevant secret in the provider store, deploy, and invalidate dependent sessions. For JWT signing-secret rotation, force reauthentication. For Cloudinary/SMTP credentials, revoke the old credential after the new deployment is healthy.

## Failed deployment

Stop rollout, retain logs/request IDs, and restore the last immutable image. Additive index/media migrations are not rolled back by deleting data. Verify readiness, login, dashboard, patient read, schedule, reception, protected media, and one safe write before ending the incident.

## Suspected data incident

Contain access, revoke compromised identities/credentials, preserve logs and backup evidence, identify affected tenant(s) and time window, and appoint an incident lead. Avoid speculative notifications or legal conclusions; follow the clinic's approved privacy and breach-response process.
