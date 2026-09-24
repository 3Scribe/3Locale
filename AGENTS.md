# 3Locale Agent Guidance

This file provides guidance to agentic coding tools working in the 3Locale repository.

Read the project documentation, contained in the docs folder, before making substantive changes:

- `PRODUCT.md` describes what 3Locale does and the intended user experience.
- `ARCHITECTURE.md` describes how the application is structured and the boundaries between layers.
- `TECHNOLOGY.md` lists the approved technology stack.

If these documents conflict, stop and surface the conflict rather than silently choosing one interpretation.

# Core Rules

**Scope discipline.** Implement the requested change only. Do not perform drive-by refactors, broad lint cleanups, package upgrades, or unrelated code changes unless they are required for the task. Report unrelated issues separately.

**Keep the core portable.** Localisation domain logic must not depend directly on Node.js, Cloudflare Workers, SQLite, D1, PostgreSQL, AWS, or a particular authentication or storage provider. Infrastructure-specific behaviour belongs behind adapters or interfaces.

**Thin HTTP routes.** API route handlers should validate the request, authenticate and authorise where required, call application/domain services, and convert results to HTTP responses. Business logic belongs outside route files.

**Regression evidence for bugs.** When fixing deterministic behaviour, add a regression test where it protects a meaningful boundary. A test should fail if the bug returns.

**Localise everything user-facing.** All UI text, aria labels, placeholders, validation messages, toasts, and other user-visible strings must go through i18next/react-i18next. Do not add hard-coded English strings to rendered UI.

**RTL from the start.** Use logical Tailwind utilities such as `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, and `text-end` instead of physical left/right equivalents where possible. Directional icons must behave correctly in RTL layouts.

**Prefer established libraries.** Do not implement custom cryptography, password hashing, authentication primitives, parsers, or other security-sensitive infrastructure when a mature maintained library is appropriate.

**Comments explain why.** Prefer clear code over comments. Add comments only for non-obvious constraints, invariants, or reasoning that a future maintainer could otherwise misunderstand. Do not write PR narratives or issue references into source comments.

# Git Workflow

For substantive implementation work:

1. Start from the latest `main` branch.
2. Create a new branch before making changes.
3. Use a descriptive branch name such as:
   - `feature/project-creation`
   - `feature/json-import`
   - `fix/duplicate-translation-keys`
4. Implement the complete requested change on that branch.
5. Run all required formatting, linting, type-checking, build, and relevant test commands.
6. Commit the completed work with a concise descriptive commit message.
7. Push the branch to GitHub.
8. Open a pull request against `main`.
9. The pull request must include:
   - a concise summary of the change;
   - significant implementation decisions;
   - tests and checks performed;
   - known limitations or follow-up work, if any.
10. Do not merge the pull request. Leave it for human review.

For very small edits explicitly requested by the user, a branch and PR are not required unless requested.

# Workflow Before Completion

Before considering a substantive task complete:

- run `npm run format` if that script exists;
- run `npm run lint` if that script exists;
- run `npm run typecheck` if that script exists;
- run the tests relevant to the changed behaviour;
- run `npm run build`;
- fix failures introduced by the change;
- update project documentation if the implementation changes an architectural or product decision.

Do not change or weaken a test merely to make the suite pass. Understand the failure first.

# Application Architecture

3Locale is a single full-stack Astro application.

The initial runtime is Node.js with SQLite. The same application should remain portable to future deployments such as Cloudflare Workers with D1/R2/Queues or other serverless environments.

The application contains these conceptual layers:

- **UI:** Astro application shell plus React interactive components.
- **API:** TypeScript HTTP routes.
- **Application/services:** use-case orchestration and product behaviour.
- **Domain:** localisation concepts and business rules.
- **Persistence:** database interfaces/adapters.
- **Storage:** file/object storage interfaces/adapters when needed.
- **Providers:** machine translation, Git, email, and similar external integrations.

Dependencies should point inward. Domain code must not import infrastructure-specific code.

# UI

Use React for interactive application areas and Astro for the application shell/routing.

Use Tailwind CSS and shadcn/ui. Prefer existing shadcn/ui components over hand-built equivalents for common controls such as buttons, dialogs, inputs, dropdowns, checkboxes, and alerts.

Accessibility is required:

- use semantic HTML;
- preserve keyboard navigation;
- provide useful labels and descriptions;
- maintain visible focus states;
- do not rely on colour alone to communicate state.

All user-facing UI must be localisable through i18next/react-i18next.

# API and Validation

State-changing operations must not use GET requests.

Validate all external input at the server boundary, including:

- request bodies;
- path/query parameters;
- uploaded files;
- values received from external integrations.

Do not expose internal stack traces, database errors, secrets, or raw exception messages to clients.

Authentication establishes who the user is. Authorisation determines what the user may do. Keep those concerns separate.

Authorisation checks must be enforced server-side.

# Database

SQLite is the initial database, but application/domain code must not depend on SQLite-specific behaviour unless unavoidable and documented.

All SQL must be parameterised. Never construct SQL statements by interpolating untrusted values.

If a query builder or ORM is introduced, use its parameterisation facilities rather than raw interpolated SQL.

Database migrations must be forward-only once released. Do not edit a migration that has already shipped; add a new migration to correct or extend the schema.

Foreign-key and frequently queried columns should be indexed where appropriate, based on observed query patterns rather than speculative optimisation.

Database tests should use a real temporary SQLite database where practical rather than mocking the database layer.

# Localisation and Resource Formats

The internal localisation model must not be coupled to a particular resource-file format.

Import/export formats should be implemented through format-provider abstractions. A provider is responsible for parsing, validating, mapping into the common 3Locale model, and exporting back to its supported format.

The first milestone may support only one format. Do not build additional formats unless the current task requires them.

Translations must preserve placeholders, variables, pluralisation constructs, and other format-specific semantics where supported.

# Machine Translation

Machine translation must be accessed through provider abstractions.

The core application must not depend directly on Google, Microsoft, DeepL, an LLM provider, or another specific vendor.

Machine-generated translations must remain editable and should retain enough metadata to identify their origin when machine translation is introduced.

# Environment and Secrets

Use Vite/Astro environment conventions for public build-time configuration.

Secrets must remain server-side and must never be exposed to client bundles.

Do not commit credentials, API keys, tokens, connection strings, or production secrets to the repository.

The product name is `3Locale`, but JavaScript/TypeScript identifiers cannot begin with a number. Prefer identifiers such as `threeLocale`, `threeLocaleRuntime`, or another clear valid name. Environment-variable prefixes should use `THREELOCALE_` rather than a digit-leading name.

# Testing

Use Vitest for unit/integration tests and Playwright for browser/end-to-end tests as documented in `TECHNOLOGY.md`.

Tests should verify behaviour rather than restating implementation details.

Good tests include:

- domain behaviour;
- API validation and responses;
- database persistence and migrations;
- import/export round trips;
- placeholder/translation validation;
- important user workflows.

Avoid tests that:

- merely assert a constant or configuration literal;
- test only that a mock returns its configured value;
- assert implementation details with no user-visible or behavioural consequence;
- duplicate tests belonging to third-party libraries.

For browser-facing features, add or update an end-to-end test when the workflow is important enough to protect against regression.

# Development Philosophy

Prefer the simplest implementation that satisfies the current requirement while preserving the architectural boundaries documented in `ARCHITECTURE.md`.

Do not prematurely build Cloudflare deployment, AWS deployment, queues, object storage, multi-tenancy, billing, enterprise authentication, or other future capabilities unless the active milestone requires them.

When a task reveals a reusable project rule, update this file or the relevant project document so future agents do not have to rediscover the same decision.
