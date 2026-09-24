# 3Locale

A local localisation workspace built with Astro, React, and SQLite.

## Run locally

Requires Node.js 24.15 or later in the Node 24 LTS line and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4321. Create a project with source and target language tags (for example `en` and `fr`), import a flat JSON file, save translations, and export the target resource. Use the interface language selector to switch between English and Arabic.

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
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests run their own server on port 4322 with a separate `data/e2e.db`. Database integration tests use temporary real SQLite databases.

## Initial milestone

- Create and reopen projects with one source and one target language.
- Import flat JSON objects containing unique keys and string values.
- Edit and persist translations, filter unfinished strings, and export complete JSON.
- Preserve existing translations and keys during reimport; changed source strings require review and saving before export.
- Detect missing or altered `{name}` and `{{name}}` placeholders.
- Localised English/Arabic UI with logical layout and RTL coverage.

Imports are limited to 1 MB, 5,000 keys, 500 characters per key, and 20,000 characters per value. Nested JSON, arrays, comments, duplicate keys, and trailing commas are rejected. Dots in keys remain literal. Empty translations count as untranslated. Exports require all retained keys to have nonblank translations with matching placeholders and no pending source review. Removed source keys are retained; deletion is not part of this milestone.

The format treats values as opaque text except for simple brace placeholders. It does not interpret ICU messages or i18next plural semantics. Authentication, collaboration, machine translation, and additional formats are future work.

## Structure

`src/domain` defines portable models and ports; `src/application` coordinates use cases; `src/persistence` contains the SQLite adapter and versioned migration; `src/providers` contains the flat JSON format; `src/server` composes the runtime and HTTP validation; `src/pages/api` contains thin routes. React components use i18next resources under `src/i18n` and shadcn/ui controls.

The initial adapter uses Node's built-in `node:sqlite` (which may print an experimental warning on Node 24). Only the adapter imports SQLite. Zod validates HTTP input; jsonc-parser detects duplicate properties before mapping into the format-neutral model. These supporting libraries avoid hand-written input parsers. Future schema changes must add forward migrations rather than editing the initial migration.

See [product](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [technology](docs/TECHNOLOGY.md), and [agent guidance](AGENTS.md).
