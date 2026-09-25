# Technology Stack for 3Locale

This file lists the development software, languages, libraries, and frameworks that are permissible to use when developing 3Locale.

- Package manager: npm
- Runtimes: Node.js 24 LTS and Cloudflare Workers (workerd)
- Application framework: Astro
- Interactive UI: React
- Language: TypeScript
- Styling: Tailwind CSS
- Components: shadcn/ui
- Localisation: i18next + react-i18next
- Databases: Node built-in SQLite and Cloudflare D1
- Unit/integration tests: Vitest
- Browser/end-to-end tests: Playwright

New foundational technologies should not be introduced without an explicit architectural reason. Small supporting libraries may be added when they solve a clear requirement and fit the existing architecture.

Milestone 3 uses `fflate` as a small supporting ZIP library behind the archive-provider interface for all-target JSON export. It does not become an application/domain dependency. SQLite migrations remain forward-only, and persistence/migration integration tests use real temporary databases.

Milestone 4 uses `@astrojs/cloudflare` with Wrangler JSONC and generated binding types. Wrangler applies the D1 baseline/forward migrations; Miniflare runs the real D1 adapter inside workerd for shared Vitest contracts, with TypeScript transpilation of the test Worker modules. No Cloudflare account is required for tests. Keep Node and Cloudflare builds separate, and run both in CI alongside the focused Worker Playwright smoke test. Deployment commands and operational constraints are documented in [DEPLOYMENT.md](DEPLOYMENT.md).

Milestone 5 adds a provider-neutral asynchronous translation port and DeepL as its first adapter, using standard fetch, streams, AbortSignal and XML tag handling on both runtimes. `saxes` is a small portable strict XML parser used only inside that adapter to reject malformed output and DTD/entity payloads; no hand-written XML parser or platform-specific provider SDK is introduced. Existing Zod and resource-format validation guard external responses and restored placeholders.

Vitest covers shielding, language mapping, batching, safe failure handling and bounded responses with injected fetch. Shared application contracts run against real SQLite and workerd D1, including migrations, stale writes, rollback, provenance and recovery. `npm run test:machine:e2e` uses a separate Astro test composition with an injected deterministic provider, covering HTTP plus English/Arabic UI. Production builds have no fake-provider setting or endpoint. CI needs neither provider credentials nor real API calls and continues to run both production builds and existing browser suites.
