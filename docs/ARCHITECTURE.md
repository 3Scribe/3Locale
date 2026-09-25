# 3Locale Architecture

## Overview

3Locale is an open-source localisation management application with an optional hosted cloud edition.

The initial goal is to provide a lightweight, developer-focused localisation manager that can be run locally or self-hosted, while sharing as much code as possible with the hosted 3Locale Cloud service.

The architecture should remain simple, modular, testable, and portable between deployment environments.

The application supports Node.js with SQLite and Cloudflare Workers with D1. Other serverless environments remain future targets.

## Architectural Principles

### One application

3Locale should be treated as a single full-stack application rather than separate independently deployed frontend and backend applications.

The application contains:

* an Astro server;
* a React-based interactive application UI;
* TypeScript API routes;
* server-side business logic;
* persistence and storage abstractions.

In production, the server is responsible for serving both the application UI and its API.

During development, Vite may provide its normal development and hot-reload functionality.

### Shared codebase

Community, Cloud, and any future Enterprise editions should share the same core application code.

Avoid long-lived forks such as separate Community and Cloud branches.

Edition-specific behaviour should instead be implemented through:

* configuration;
* feature capabilities;
* infrastructure adapters;
* optional modules;
* deployment-specific packages.

### Platform-neutral core

Localisation domain logic must not depend directly on:

* Node.js;
* Cloudflare Workers;
* SQLite;
* D1;
* PostgreSQL;
* AWS;
* a particular authentication provider;
* a particular storage provider.

Infrastructure-specific behaviour should be accessed through clearly defined interfaces or adapters.

This should make it possible to change deployment environments without rewriting the localisation engine.

### Product name and code identifiers

The product name is `3Locale`. JavaScript and TypeScript identifiers cannot begin with a number, so code should use clear valid identifiers such as `threeLocale`, `threeLocaleRuntime`, or another descriptive equivalent. Environment-variable prefixes should use `THREELOCALE_`.

## Initial Runtime Architecture

The first version will run locally using:

```text
Browser
   |
   v
Astro / Node.js
   |
   +-- React application
   |
   +-- TypeScript API routes
   |
   +-- Application/domain services
   |
   +-- Persistence layer
          |
          v
        SQLite
```

The user accesses a single local application URL.

For example:

```text
http://localhost:4321/
```

Application pages are served by Astro.

Interactive application functionality is implemented using React components.

The React application communicates with server-side functionality through HTTP API routes.

For example:

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/{id}
POST   /api/projects/{id}/translations
```

Exact route design may evolve as the product develops.

## Application Layers

### User Interface

3Locale is primarily an interactive application rather than a public content website. Authentication will be introduced in a later milestone.

Astro provides the application shell and routing.

React should be used for interactive application areas such as:

* project management;
* translation editing;
* language management;
* import/export interfaces;
* settings;
* team management;
* translation review workflows.

Tailwind CSS and shadcn/ui should be used for styling and application components.

All user-facing strings must use i18next/react-i18next from the beginning. Once 3Locale can manage localisation projects, its own translation catalogue should be managed as a 3Locale project where practical.

The UI must support both left-to-right and right-to-left languages.

Physical-direction CSS such as `left`, `right`, `ml-*`, and `mr-*` should be avoided where logical equivalents are available.

### API Layer

API routes expose server-side functionality to the UI and future external integrations.

Routes should remain thin.

API routes should normally be responsible for:

1. receiving the HTTP request;
2. authenticating and authorising the request where required;
3. validating incoming data;
4. calling the appropriate application service;
5. converting the result into an HTTP response.

Business logic should not be implemented directly inside route handlers.

### Application / Service Layer

The application layer implements product behaviour and coordinates domain operations.

Examples include:

* creating a localisation project;
* adding a language;
* importing a resource file;
* detecting translation keys;
* updating translations;
* exporting resource files;
* performing machine translation;
* synchronising with Git repositories.

Application services may use persistence, storage, translation provider, or other interfaces, but should not depend on their concrete implementations.

### Domain Layer

The domain layer contains the core localisation concepts and rules.

Initial concepts are expected to include:

* User
* Project
* Language
* Translation key
* Base Language value
* Translation
* Resource file
* Import/export format

The domain model should remain independent of hosting and database technologies.

### Milestone 2 localisation model

A project has a `baseLanguage` designation and project-language records. Resource entries carry an identity and a structural path (`string[]`); translations belong to an entry and project language and carry their own value and `needsReview` flag. Base Language values use the same per-language representation as target values, allowing a future Base Language switch without moving text between columns. Switching and language deletion are not implemented.

The SQLite adapter stores paths as JSON arrays with uniqueness per project. It enforces entry/language ownership with composite foreign keys and requires the designated Base Language to belong to the project. Repository and service operations remain asynchronous. Imports check the union of retained and incoming paths and update entries, Base Language values, and affected review flags in one transaction.

Forward migration 2 preserves the released version-1 schema migration, copies each old flat key to a single-segment path, creates records for the original base and target languages, and copies all values and target review flags. Startup uses the existing versioned migration runner; a failed migration rolls back and leaves the prior schema usable.

The JSON provider parses nested objects into structural paths and reconstructs the hierarchy on export. Literal dots and prototype property names remain ordinary segments. Safety limits are 1 MB UTF-8, 5,000 string leaves, 32 path segments, 500 characters per segment, and 20,000 characters per value. Empty objects, arrays, other non-string leaves, comments, trailing commas, and duplicate keys at any level are rejected. The project limit is 100 languages. Retained string/object prefix conflicts reject the entire import. Property order/whitespace and ICU/plural semantics are not round-tripped; supported placeholders remain protected per language.

### Persistence Layer

Persistence should be abstracted from application logic.

The first implementation will use SQLite.

Future implementations may use:

* Cloudflare D1;
* PostgreSQL;
* Aurora;
* another suitable relational datastore.

Database-specific behaviour should remain inside persistence adapters.

Application code should not contain SQLite-specific assumptions unless unavoidable and documented.

Database access must always use parameterised queries or a query builder.

Never construct SQL using untrusted string interpolation.

### Storage Layer

Binary or file-based content may eventually include:

* imported localisation files;
* exported resource packages;
* screenshots providing translation context;
* generated reports.

Storage should use an abstraction so that different environments can provide implementations such as:

* local filesystem;
* Cloudflare R2;
* Amazon S3.

The initial application should avoid introducing object storage until a product feature actually requires it.

## Localisation Formats

Import/export functionality should be implemented as modular format providers.

The application should not couple localisation logic directly to any specific file format.

Conceptually:

```text
ResourceFormat
   |
   +-- JSON
   +-- i18next JSON
   +-- RESX
   +-- PO
   +-- XLIFF
   +-- Android XML
   +-- iOS strings
```

The initial milestone may support only one format.

Additional formats should be added without requiring changes to the core translation model.

Each format provider should be responsible for:

* detecting or validating its format;
* parsing source data;
* mapping source data into the common 3Locale model;
* exporting translations back into the target format.

## Machine Translation

Machine translation should also use a provider abstraction.

Potential providers include:

* Google Cloud Translation;
* Microsoft Translator;
* DeepL;
* user-supplied LLM/API providers.

The core application must not depend on one specific translation provider.

A translation provider should accept a normalised translation request and return translated text plus any useful metadata.

Cloud editions may enforce translation quotas or credits independently of the translation provider implementation.

## Authentication

Authentication is not required for the first localisation proof-of-concept unless explicitly included in the relevant milestone.

When authentication is introduced, authentication and authorisation must remain separate concerns.

Authentication establishes the identity of the user.

Authorisation determines whether that user may perform an action.

Passwords must never be stored directly.

Use a recognised password hashing implementation if local username/password authentication is supported.

The architecture should allow authentication to be replaced later by services such as:

* OAuth;
* OpenID Connect;
* Cognito;
* third-party identity providers.

## Multi-Tenancy

The open-source Community edition may initially operate as a single organisation or simple self-hosted instance.

3Locale Cloud will eventually require multi-tenancy.

The application should therefore avoid assumptions that all data belongs to one global user or organisation.

Likely future hierarchy:

```text
User
   |
   +-- Organisation / Team
           |
           +-- Projects
                   |
                   +-- Languages
                   +-- Keys
                   +-- Translations
```

Multi-tenancy does not need to be implemented until required, but early schema and service design should avoid making it unnecessarily difficult to introduce.

## Hosted Cloud Architecture

A possible future managed Cloud deployment is (R2 and Queues are not provisioned by Community Milestone 4):

```text
Browser
   |
   v
Cloudflare
   |
   +-- Astro / Workers
   |
   +-- React application
   |
   +-- API
   |
   +-- D1 or external database
   |
   +-- R2
   |
   +-- Queues
```

Cloudflare-specific APIs must remain behind adapters.

Potential uses include:

* Workers for application/API execution;
* D1 for tenant/project data;
* R2 for uploaded files and screenshots;
* Queues for translation jobs, imports, exports, and Git synchronisation.

Community Milestone 4 runs Astro/React/API on Workers with D1 only. The additional managed Cloud services above remain future possibilities.

## Background Work

Long-running or asynchronous operations should eventually execute through a job abstraction rather than blocking HTTP requests.

Potential background jobs include:

* bulk machine translation;
* repository synchronisation;
* large imports;
* export generation;
* translation validation;
* webhook delivery.

The initial local implementation may execute simple tasks synchronously where appropriate.

When asynchronous processing becomes necessary, application services should submit work through a queue/job interface rather than directly depending on Cloudflare Queues, AWS SQS, or another provider.

## Community and Cloud Editions

The Community edition should remain genuinely useful and should not be artificially crippled.

The initial commercial distinction is expected to be based primarily on managed services and convenience rather than withholding essential localisation functionality.

Community may provide:

* complete self-hosted application;
* localisation projects;
* languages;
* translation editing;
* import/export;
* local machine translation integrations;
* API access.

3Locale Cloud may additionally provide managed capabilities such as:

* managed hosting;
* backups;
* automatic upgrades;
* translation credit allowances;
* scheduled repository synchronisation;
* managed email delivery;
* teams and collaboration;
* usage monitoring;
* billing;
* hosted file storage;
* managed integrations.

The exact Community/Cloud feature boundary is a product decision and should not be hard-coded into the architecture prematurely.

## Capabilities

Where editions require different functionality, prefer capability-based configuration rather than scattered checks such as:

```typescript
if (edition === "cloud")
```

A runtime capabilities model may eventually expose features such as:

```text
managedHosting
billing
teams
scheduledSync
managedMachineTranslation
auditHistory
cloudStorage
```

The UI and services can use these capabilities to determine which functionality is available.

## Testing

The architecture should support several levels of automated testing.

### Unit tests

Used for isolated domain behaviour and pure business logic.

### Integration tests

Used for:

* database operations;
* API behaviour;
* imports and exports;
* translation provider adapters;
* persistence implementations.

Use real SQLite databases for database tests rather than mocking the database layer where practical.

### Browser / end-to-end tests

Used for important application workflows.

Examples:

* create a project;
* import translation resources;
* add a target language;
* edit a translation;
* export the translated resource.

Tests should verify user-visible behaviour rather than internal implementation details.

## Security

All incoming data must be treated as untrusted.

Important principles include:

* validate API request bodies;
* parameterise all database operations;
* validate uploaded files;
* do not expose internal exception messages directly to clients;
* keep secrets server-side;
* never expose secrets through Vite client environment variables;
* use established cryptographic/authentication libraries rather than implementing custom cryptography;
* perform authorisation checks server-side.

Security-sensitive architectural decisions should be documented when introduced.

## Development Philosophy

Prefer the simplest implementation that satisfies the current product requirement while preserving sensible architectural boundaries.

Do not build infrastructure merely because it may be useful in the future.

In particular, the first implementation does not require:

* Cloudflare;
* AWS;
* queues;
* object storage;
* multi-tenancy;
* billing;
* enterprise authentication.

Those should be introduced when a milestone requires them.

At the same time, avoid tightly coupling the core product to choices that are already known to be temporary, particularly SQLite and the Node runtime.

## Initial Target

The initial architecture should support a first complete localisation workflow:

1. Run 3Locale locally.
2. Create a localisation project.
3. Define a Base Language.
4. Add a target language.
5. Import a supported resource file.
6. Display its translation keys and source values.
7. Enter or edit translations.
8. Export a valid translated resource file.

This vertical slice should prove the core architecture before authentication, billing, cloud deployment, collaboration, or advanced translation features are added.

## Milestone 3: atomic reconciliation and checkpoints

`application/imports.ts` constructs a portable reconciliation result from a project snapshot and confirmed locale mappings. It parses through the resource-format provider, applies Base Language authority, reports conflicts/orphans/invalid resources, and computes the candidate state. React presents this result rather than implementing reconciliation. Apply reanalyses the submitted files and checks the preview's project version. HTTP boundaries validate mappings, confirmation, policies, versions and bounded bodies; the combined raw files are limited to 10 MB. Batch routes allow 22 MB JSON transport overhead, while ordinary routes retain their 2 MB bound.

The asynchronous repository `commit` operation atomically compares the expected project version, writes localisation state, appends structured audit records and revision checkpoints, and prunes checkpoints to the application's 100-revision rule. This is a required transactional contract for future adapters, not a sequence of independently committed CRUD calls. SQLite uses `BEGIN IMMEDIATE` with parameterised statements and replaces the project's language/entry/translation snapshot. Snapshot writes preserve unchanged lifecycle metadata. Resource IDs are project-scoped, while paths remain structural arrays. Reads expose ordered language codes plus their lifecycle metadata.

Audit events have stable IDs, project IDs, operation IDs, ISO UTC occurrence time, event kind and relevant structured details (language/path, old/new values and origins, summaries, file mappings or restoration revision). One committed project version identifies one operation. Actor identity is absent until authentication exists. Audit history is durable and paginated by descending event ID, avoiding timestamp ties. It is not a snapshot store or an event-sourcing reconstruction mechanism.

Revisions independently store the complete localisation snapshot and metadata. Before/after import checkpoints allow recovery without replaying audit; new-project imports have only an after checkpoint. Single translation saves do not create revisions. Restore checks project membership/version and commits the restored state, audit event, before/after recovery checkpoints and retention together. Entity update times reflect changes during restoration, while unchanged live entities retain their current metadata. Audit survives restoration and checkpoint pruning. All projects share the newest-100 retention rule.

The application supplies UTC ISO timestamps through an injectable clock. Translation provenance is an extensible string (`manual`/`import` currently), not a provider dependency. Migration 3 backfills all historical lifecycle times consistently from one migration-time timestamp. Existing base translations have import origin and existing targets manual origin, matching Milestone 2 capabilities. It preserves existing identifiers, paths, languages, values and review states and adds audit/revision tables; released migrations remain unchanged.

Batch export validates all target languages from one project snapshot before passing filename/text pairs to an asynchronous archive port. The `fflate` ZIP adapter belongs in `providers`; application/domain code do not import ZIP, filesystem or SQLite APIs. Full-snapshot storage and replacement favour simple correctness for the bounded local milestone; incremental persistence and archive streaming can be considered if measured scale warrants them.

## Milestone 4: runtime composition and D1

The build alias `@runtime` resolves to `src/server/runtime.ts` for Node/SQLite or `src/server/runtime.cloudflare.ts` for Workers/D1. Routes use that single composition port; application/domain modules have no platform detection. Cloudflare bindings and Node environment settings remain in those composition modules. Default development/build commands preserve Node support; explicit Cloudflare commands produce a separate artifact.

`ProjectCommit` includes the previous versioned snapshot and next state. Services already hold both; D1 calculates changed rows at the persistence boundary, while SQLite retains its transactional snapshot strategy. Callers must supply the actual previously read state and matching expected version, without mutating it. D1 validates version consistency and performs the authoritative version guard in the database batch. A named CHECK constraint aborts a stale batch before state/history writes; successful commits remove their guard row. Changes, audit, checkpoint chunks and 100-revision retention commit or roll back together. No manual save rewrites unchanged translations or creates a checkpoint.

The D1 baseline schema preserves structural-path uniqueness, project/entry/language foreign keys, lifecycle and provenance fields, audit pagination indexes and project-isolated revisions. Large snapshots use ordered chunks below the D1 row limit. SQLite migrations 1–3 remain unchanged; D1 has its own forward-only Wrangler migration history. Shared contracts exercise both real stores, including concurrent writers and a failure after retention deletion. D1-specific tests protect write efficiency and multi-megabyte Unicode checkpoints. A focused smoke test runs the built Worker; application behaviour is otherwise shared. See [deployment](DEPLOYMENT.md) for operations, limits, secrets and the unauthenticated-instance warning.
