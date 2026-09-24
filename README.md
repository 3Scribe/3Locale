# 3Locale

A local localisation workspace built with Astro, React, and SQLite.

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

Set `HOST=127.0.0.1` and `PORT=4321` in your shell for a loopback-only production server. This milestone has no authentication; run it locally. Hosted or shared access requires the later authentication milestone.

## Checks

```sh
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
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

`src/domain` defines portable models and ports; `src/application` coordinates use cases; `src/persistence` contains the SQLite adapter and versioned migration; `src/providers` contains the JSON format; `src/server` composes the runtime and HTTP validation; `src/pages/api` contains thin routes. React components use i18next resources under `src/i18n` and shadcn/ui controls.

The initial adapter uses Node's built-in `node:sqlite` (which may print an experimental warning on Node 24). Only the adapter imports SQLite. Zod validates HTTP input; jsonc-parser detects duplicate properties before mapping into the format-neutral model. These supporting libraries avoid hand-written input parsers. Repository operations and application services return promises; the SQLite adapter retains synchronous SQLite execution internally. Future async adapters can implement the same repository contract. Schema startup runs the ordered migrations in `src/persistence/migrations.ts` transactionally, recording the version with SQLite `user_version`. Migration 2 converts version-1 projects into project-language records and entries with structural paths, copying both base values and target translations (including empty values and review flags) into per-language translation records. Existing flat keys become single-segment paths. The released first migration is unchanged. Add consecutive forward migrations rather than editing released migrations; failures roll back pending changes and newer schemas are rejected.

See [product](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [technology](docs/TECHNOLOGY.md), and [agent guidance](AGENTS.md).

GitHub Actions runs `format:check`, lint, typecheck, Vitest, build, and Chromium Playwright tests on pull requests to `main` and pushes to `main`, using Node 24. `format:check` reports formatting differences without modifying files.
