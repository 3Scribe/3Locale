# Community pre-release review

Milestone 6 improves operational readiness; it does not declare the unauthenticated application safe for unrestricted public hosting.

## Implemented and reviewed

- Instance setup distinguishes readable storage, missing optional provider configuration and an unverified supplied key. Explicit checks report credential/quota/connectivity outcomes without sending project text or exposing credentials.
- Confirmed draft ZIPs are visibly separate from strict production exports. Missing, unreviewed and invalid translations become empty strings with a structural-path manifest; there is no silent source fallback.
- Project rename, permanent deletion and target-language removal enforce expected versions. Deletion removes all owned current/history records in one transaction/batch. Language removal retains recovery checkpoints. SQLite/D1 shared tests exercise rollback, stale writes, cleanup and recovery.
- Existing Cloudflare copies have an upgrade procedure that preserves the Worker, database and secrets, including copies with unrelated Git history. No schema changes are introduced in this milestone.
- Unexpected HTTP exceptions no longer log raw exception objects. Provider errors and instance status use safe application codes.
- Tracked-file checks found no private keys, common GitHub/AWS token patterns or developer-specific Windows paths. Runtime data, build output and secret files remain ignored. Synthetic provider credentials are confined to injected-fetch tests and are not operational examples or production configuration.
- `npm audit --omit=dev` reported zero vulnerabilities on 2026-09-26. The lockfile uses npm registry sources. This is a point-in-time check, not a guarantee against undiscovered issues.
- Repository and package metadata remain `AGPL-3.0-only`. Historical MIT-release statements are intentional. Copied shadcn/ui attribution is retained in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); dependencies retain their upstream licences.
- Historical migrations, regression fixtures and earlier milestone documentation are retained deliberately. They explain supported upgrades and are not disposable development cruft. No uncertain files were deleted or dependencies upgraded.

## Operational limits and later work

- **Milestone 7:** single-owner/passkey authentication, server-side authorisation and authenticated settings ownership. Until then, everyone who can reach the app can edit/delete projects, query provider availability and spend configured translation quota. Keep loopback or deployment-layer access restrictions.
- Credentials remain deployment-wide server secrets. No browser credential editor, application-managed secret storage or multi-user provider settings are introduced.
- A storage check proves current-schema reads, not future write capacity; provider checks are point-in-time and do not guarantee language support or future quota. Configuration check results are not persisted. Unexpected server errors are intentionally terse; host metrics and operator-controlled diagnostics remain necessary.
- Project deletion has no in-app undo and does not purge host backups. Language removal retains audit/revision history and protects the final target. Revision retention is still 100; use a database backup for durable recovery.
- Draft export is selected-language only, saved-state only and deliberately empties unreviewed output. Normal multi-language ZIP export remains strict. Drafts are not a full-fidelity backup of metadata/history.
- Translation remains synchronous, with no queue or retry ledger. Provider charges can occur even if later batches or stale-version checks prevent persistence.
- No live Cloudflare account upgrade or real DeepL credential check was performed as part of automated validation. Local built-Worker tests and injected provider responses cover the implementation; deployment owners should perform the documented post-upgrade smoke check.
- Before the public v0.1.0 reset, choose an immutable release ref, preserve released migration identities, review the intended public Git history and ensure third-party licence notices accompany any separately packaged compiled distribution. The package version is still the pre-release placeholder `0.1.0`; it is not a release attestation.
- Multi-cloud templates, background jobs, additional providers/formats and broader diagnostic tooling remain future milestones.
