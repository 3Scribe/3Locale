# 3Locale

A localisation workspace built with Astro and React, supporting Node/SQLite and Cloudflare Workers/D1.

**No authentication is implemented yet. Anyone who can reach a deployed instance can read and modify projects. Restrict access before hosting sensitive data.**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/3Scribe/3Locale)

See [deployment instructions](docs/DEPLOYMENT.md) for local D1 development, manual deployment, button setup, migrations, secrets and current limits.

## Run locally

Requires Node.js 24.15 or later in the Node 24 LTS line and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4321. Create a project with a Base Language tag (for example `en`) and comma-separated target language tags (`fr, de`). Import flat or nested JSON, select an editing language, save translations, and export that language. Add more languages from the project editor. Use the interface language selector to switch between English and Arabic.

```json
{
  "welcome": "Hello {{name}}",
  "account.save": "Save"
}
```

Data persists in `data/three-locale.db`. Set the server-only `THREELOCALE_DATABASE_PATH` environment variable to use another SQLite file. Back up the database with a SQLite-aware backup tool, or stop the server before copying the database and any WAL files.

For a production build:

```sh
npm run build
npm start
```

Set `HOST=127.0.0.1` and `PORT=4321` in your shell for a loopback-only production server. This milestone has no authentication; hosted access requires deployment-layer protection until the authentication milestone.

## Checks

```sh
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:d1
npm run build
npm run build:cloudflare
npx playwright install chromium
npm run test:e2e
npm run test:cloudflare
```

Browser tests run their own server on port 4322 with a separate `data/e2e.db`. Database integration tests use temporary real SQLite databases.

## Milestone 2

- Create and reopen projects with a Base Language and multiple target languages; add languages later.
- Import flat or nested JSON objects containing unique keys and string leaves.
- Edit independent translations and review states, see progress per language, filter the selected language, and export its complete nested JSON.
- Preserve existing translations and keys during reimport; changed Base Language strings require review and saving before export.
- Detect missing or altered `{name}` and `{{name}}` placeholders.
- Localised English/Arabic UI with logical layout and RTL coverage.

Imports are limited to 1 MB of UTF-8, 5,000 string leaves per file, 32 path segments, 500 characters per segment, and 20,000 characters per value. Projects support up to 100 languages including the Base Language. Arrays, non-string leaves, empty objects (including the root), comments, duplicate keys at any level, and trailing commas are rejected. Paths are segment arrays: `["account.name"]` and `["account", "name"]` remain distinct. The editor displays quoted segments separated by `›`. JSON property order and whitespace are not preserved; structure, keys, and values are. Empty translations count as untranslated. Each exported language must have nonblank values with matching placeholders and no pending review for all retained entries. Absent entries are retained. A reimport that would make a path both a string and an object is rejected transactionally. Base Language switching and destructive deletion are not implemented.

The format treats values as opaque text except for simple brace placeholders. It does not interpret ICU messages or i18next plural semantics. Authentication, collaboration, machine translation, and additional formats are future work.

## Structure

`src/domain` defines portable models and ports; `src/application` coordinates use cases; `src/persistence` contains SQLite and D1 adapters and persistence deltas; `migrations/d1` contains Wrangler migrations; `src/providers` contains the JSON format; `src/server` composes the runtime and HTTP validation; `src/pages/api` contains thin routes. React components use i18next resources under `src/i18n` and shadcn/ui controls.

The initial adapter uses Node's built-in `node:sqlite` (which may print an experimental warning on Node 24). Only the adapter imports SQLite. Zod validates HTTP input; jsonc-parser detects duplicate properties before mapping into the format-neutral model. These supporting libraries avoid hand-written input parsers. Repository operations and application services return promises; the SQLite adapter retains synchronous SQLite execution internally. Both adapters implement the asynchronous repository contract. Commits include previous and next state so D1 can calculate incremental writes. Schema startup runs the ordered migrations in `src/persistence/migrations.ts` transactionally, recording the version with SQLite `user_version`. Migration 2 converts version-1 projects into project-language records and entries with structural paths, copying both base values and target translations (including empty values and review flags) into per-language translation records. Existing flat keys become single-segment paths. The released first migration is unchanged. Add consecutive forward migrations rather than editing released migrations; failures roll back pending changes and newer schemas are rejected.

See [product](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [technology](docs/TECHNOLOGY.md), and [agent guidance](AGENTS.md).

GitHub Actions runs `format:check`, lint, typecheck, Vitest including shared SQLite/D1 contracts, both builds, Chromium Playwright tests, and a built-Worker smoke test on pull requests to `main` and pushes to `main`, using Node 24. `format:check` reports formatting differences without modifying files.

## Milestone 3: imports and recovery

Use **Import existing locale files** to create a project directly from a locale set, or import files into an open project. Select up to 20 JSON files (10 MB combined, with the existing 1 MB per-file limit), confirm or correct every language mapping, and choose the Base Language for a new project. Filename suggestions such as `messages.en-gb.json` become `en-GB`, but never count as confirmation. Duplicate canonical language mappings are rejected. New projects require a Base Language file and at least one target language; existing projects may import target files alone.

Analyse before applying. Preview shows languages, new/unchanged/changed base entries, populated/unchanged translations, conflicts, review changes, invalid resources, and unmatched target paths. Only existing and newly imported Base Language paths define entries. Orphans are reported and skipped. Select **Keep existing translations** or **Use imported translations** explicitly. Identical values remain unchanged; blank existing translations can be filled; blank incoming target values never erase existing text. Base changes mark existing nonempty target translations for review, including imported replacements; saving that language clears its review state. Absent base entries remain retained. Invalid resources block the entire batch.

Applying commits languages, values, metadata, audit events, and revisions together. A preview of an older project version is rejected; reopen the project and analyse again. The post-import summary uses the same application result as the audit record.

**Audit** displays durable, structured events newest first, including value/provenance changes and import summaries. Older events load in pages of 100. **Revisions** stores full localisation checkpoints before and after imports (only after for new-project imports), and before and after restoration. Individual translation saves are audited without consuming revisions. Every project retains its newest 100 checkpoints; audit events are not pruned with revisions. Restoration replaces languages, entries, translations, provenance, and review state atomically after explicit confirmation. It preserves audit history and records both the restoration event and a checkpoint of the replaced state. Unsaved browser edits are discarded when an import or restoration refreshes the project.

**Export all target languages (ZIP)** produces canonical filenames such as `fr-FR.json` and `ar.json`. The Base Language is excluded. Every target must pass the same completeness, review, and placeholder validation as single-language export before any archive is produced.

Projects, language records, entries, and persisted translations have ISO UTC lifecycle timestamps. Unchanged reads/imported values do not advance entity timestamps. Translation origins are `manual` or `import`; the string representation can accommodate future origins without implementing them. Migration 3 preserves Milestone 2 state, timestamps historical entities once at migration time, and labels historical base values as imported and target values as manual (the only Milestone 2 write paths). It does not invent historical audit events or checkpoints. Released migrations 1 and 2 remain unchanged.

Current limits: nested string-only JSON, a batch-wide conflict policy, full snapshots rather than incremental revisions, no audit search, and no Base Language switching or deletion workflow. SQLite commits replace the bounded project localisation snapshot inside a transaction; D1 uses incremental writes through the same asynchronous, version-checked commit contract.

## Licence

Copyright (c) 2026 3Scribe. 3Locale Community is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE) for the full licence text. Previously published MIT-licensed versions are not retroactively relicensed; future repository versions covered by this change are distributed under `AGPL-3.0-only`.
