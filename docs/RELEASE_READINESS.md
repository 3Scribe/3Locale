# Community pre-release review

Milestones 6–7 improve operational readiness and introduce single-owner authentication. Protect first-owner setup before exposing an unclaimed instance. Review deployment origin, passkey continuity and encryption-key retention before hosting valuable data.

## Implemented and reviewed

- Instance setup distinguishes readable storage, missing optional provider configuration and an unverified supplied key. Explicit checks report credential/quota/connectivity outcomes without sending project text or exposing credentials.
- Confirmed draft ZIPs are visibly separate from strict production exports. Missing, unreviewed and invalid translations become empty strings with a structural-path manifest; there is no silent source fallback.
- Project rename, permanent deletion and target-language removal enforce expected versions. Deletion removes all owned current/history records in one transaction/batch. Language removal retains recovery checkpoints. SQLite/D1 shared tests exercise rollback, stale writes, cleanup and recovery.
- Existing Cloudflare copies have an upgrade procedure that preserves the Worker and database, including copies with unrelated Git history. Milestone 7 adds security tables and replaces the deployment DeepL key with encrypted application records; the root encryption key remains a deployment secret.
- Unexpected HTTP exceptions no longer log raw exception objects. Provider errors and instance status use safe application codes.
- Tracked-file checks found no private keys, common GitHub/AWS token patterns or developer-specific Windows paths. Runtime data, build output and secret files remain ignored. Synthetic provider credentials are confined to tests and isolated test databases, never operational examples or production configuration.
- `npm audit --omit=dev` reported zero vulnerabilities on 2026-09-27. The lockfile uses npm registry sources. This is a point-in-time check, not a guarantee against undiscovered issues.
- Repository and package metadata remain `AGPL-3.0-only`. Historical MIT-release statements are intentional. Copied shadcn/ui attribution is retained in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); dependencies retain their upstream licences.
- Historical migrations, regression fixtures and earlier milestone documentation are retained deliberately. They explain supported upgrades and are not disposable development cruft. No uncertain files were deleted or existing dependency versions upgraded; Milestone 7 adds the two SimpleWebAuthn packages and their supporting dependencies.

## Operational limits and later work

- Milestone 7 implements the single owner, passkey login, central API authorization and logout. Additional passkeys, account recovery and multi-user permissions remain later work. Protect the initial claim at the deployment layer.
- Credentials are now named encrypted installation records managed in authenticated Settings. Multiple records and an explicit default are supported. Only the encryption root key remains deployment-owned; losing it requires restoring the original key or replacing stored provider credentials.
- A storage check proves current-schema reads, not future write capacity; provider checks are point-in-time and do not guarantee language support or future quota. Per-credential check metadata is persisted; general instance status remains a transient snapshot. Unexpected server errors are intentionally terse; host metrics and operator-controlled diagnostics remain necessary.
- Project deletion has no in-app undo and does not purge host backups. Language removal retains audit/revision history and protects the final target. Revision retention is still 100; use a database backup for durable recovery.
- Draft export is selected-language only, saved-state only and deliberately empties unreviewed output. Normal multi-language ZIP export remains strict. Drafts are not a full-fidelity backup of metadata/history.
- Translation remains synchronous, with no queue or retry ledger. Provider charges can occur even if later batches or stale-version checks prevent persistence.
- No live Cloudflare account upgrade or real DeepL credential check was performed as part of automated validation. Local built-Worker tests and injected provider responses cover the implementation; deployment owners should perform the documented post-upgrade smoke check.
- Before the public v0.1.0 reset, choose an immutable release ref, preserve released migration identities, review the intended public Git history and ensure third-party licence notices accompany any separately packaged compiled distribution. The package version is still the pre-release placeholder `0.1.0`; it is not a release attestation.
- Multi-cloud templates, background jobs, additional providers/formats and broader diagnostic tooling remain future milestones.

## Milestone 7 validation and remaining security work

Owner and credential migrations preserve all existing localisation/history records. Shared SQLite/D1 contracts cover singleton setup, challenge/session lifecycle, encryption/default semantics and concurrency. Browser workflows use genuine WebAuthn with virtual authenticators, enforce the server API boundary and verify English/Arabic credential management. Test secrets and private passkeys are generated or synthetic, confined to ignored test artifacts.

No real DeepL account, public HTTPS reverse-proxy deployment, hardware passkey or live Cloudflare upgrade was exercised. Operators must perform deployment-specific checks. First-claim access restrictions, stable origin, root-key backup and passkey-manager continuity are required operational decisions. Request-rate/abuse protection belongs at the host boundary in addition to the bounded outstanding challenge store. No self-service recovery/reset, extra passkey UI, rotation tool, MFA policy, credential audit ledger or external identity service is included.
