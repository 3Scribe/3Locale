# 3Locale Product

## Status

Draft product definition.

This document describes what 3Locale is, who it is for, how users should interact with it, and the product behaviour that implementations should provide.

Technical implementation details belong in `ARCHITECTURE.md`.

---

# Product Overview

3Locale is an open-source localisation management system designed primarily for software developers and small software teams.

It provides a central place to manage application localisation resources, languages, translation keys, translations, machine translation, and import/export workflows.

3Locale should be lightweight enough for an individual developer to run locally while also supporting a hosted cloud service for users who do not want to operate their own infrastructure.

The initial commercial model is:

* **3Locale Community** — free and open source, self-hosted.
* **3Locale Cloud** — managed hosted version with a low monthly subscription.
* Additional Team, Pro, or Enterprise capabilities may be introduced later if genuine customer requirements justify them.

The Community edition must remain genuinely useful. The hosted product should primarily charge for convenience, managed infrastructure, automation, collaboration, and managed services rather than artificially disabling basic localisation functionality.

---

# Product Positioning

3Locale is intended to sit between manual localisation management and large commercial Translation Management Systems.

The target user has outgrown:

* editing JSON files manually;
* spreadsheets;
* sending translation files by email;
* maintaining separate copies of resource files;
* manually identifying missing translations.

But they may not need, or want to pay for, a large enterprise TMS costing €50–€200+ per month.

The intended position is:

> A lightweight localisation manager for developers and small teams who want proper localisation tooling without enterprise TMS complexity or pricing.

The hosted product should be inexpensive enough that a developer may reasonably decide:

> I could self-host this, but at this price it is easier to let 3Locale host it.

An initial target price for an individual/small-team hosted plan is approximately **$10 per month**, subject to validation.

---

# Primary Users

## Individual Developer

A developer maintaining one or more applications that support multiple languages.

Typical needs:

* import application resource files;
* see untranslated strings;
* edit translations;
* use machine translation;
* export updated resources;
* avoid manually maintaining multiple language files.

## Small Development Team

A small software team where multiple developers or translators may contribute localisation work.

Typical needs:

* central project storage;
* multiple users;
* translation review;
* language progress tracking;
* Git integration;
* machine translation;
* controlled import/export.

## Translator or Reviewer

A user who needs to work on translations without modifying application source code.

Typical needs:

* see source text and context;
* enter translations;
* identify untranslated strings;
* review machine translations;
* mark translations as reviewed or approved.

## Self-Hosted Organisation

An organisation that wants localisation management but prefers to operate the software on its own infrastructure.

Typical needs:

* Docker/self-hosted deployment;
* control of its own data;
* unrestricted use of the Community edition;
* optional future paid support or advanced self-hosted capabilities.

---

# Core Concepts

## User

A person who interacts with 3Locale.

Users may eventually belong to one or more teams or organisations.

## Project

A localisation project represents an application, website, library, or other software product whose translations are managed by 3Locale.

A project contains:

* a name;
* a source language;
* one or more target languages;
* translation keys;
* translations;
* localisation resource files;
* project settings.

## Source Language

The canonical language in which application strings are authored.

For example:

```text
English (en)
```

Each translation key has a source value in the project's source language.

## Target Language

A language into which the project's source strings are translated.

Examples:

```text
French (fr)
German (de)
Arabic (ar)
Japanese (ja)
```

A project may contain any reasonable number of target languages.

## Translation Key

A stable identifier used by application code to refer to a localised string.

For example:

```text
account.sign_in
account.sign_out
profile.save
```

Each key has a source value and may have one translation per target language.

## Source String

The original text associated with a translation key.

Example:

```text
Key: account.sign_in
Source: Sign in
```

## Translation

The target-language value associated with a source string.

Example:

```text
Language: French
Translation: Se connecter
```

A translation may eventually have metadata including:

* translation status;
* translator;
* source of translation;
* review status;
* last modified date;
* machine translation provider.

## Resource File

A localisation resource imported from or exported to an application.

Examples may include:

* JSON;
* i18next JSON;
* RESX;
* PO;
* XLIFF;
* Android XML;
* iOS strings.

3Locale internally represents translations using a common model so that the product is not tied to one resource format.

---

# Core User Workflow

The fundamental 3Locale workflow is:

1. User creates a project.
2. User selects the project's source language.
3. User adds one or more target languages.
4. User imports a source localisation resource file.
5. 3Locale extracts translation keys and source strings.
6. The user sees which strings require translation.
7. The user enters translations manually or requests machine translations.
8. The user reviews and edits translated strings.
9. 3Locale shows translation progress for each language.
10. The user exports valid resource files for use by the application.

This workflow should remain simple even as more advanced functionality is added.

---

# Project Dashboard

Each project should eventually provide a clear overview of localisation status.

The dashboard should answer questions such as:

* How many translation keys exist?
* Which languages are configured?
* What percentage of each language has been translated?
* How many translations require review?
* Are any source strings newer than their translations?
* Are there validation errors?
* When was the project last imported, exported, or synchronised?

Example:

```text
3Scribe Web App

Source language: English
Keys: 1,842

French       96%
German       91%
Spanish     100%
Arabic       72%
Japanese     48%
```

Users should be able to drill down from progress figures directly to missing or problematic strings.

---

# Translation Editor

The translation editor is the primary working area of the application.

A user should be able to see:

```text
Key
Source text
Target translation
Translation status
```

The editor should support filtering by states such as:

* untranslated;
* translated;
* needs review;
* changed source;
* validation error.

Search should allow users to locate strings by:

* key;
* source text;
* translated text.

Editing should be fast and keyboard-friendly.

Changes should be saved reliably without requiring users to manage resource files manually.

---

# Translation Status

The initial implementation may distinguish only between translated and untranslated strings.

Future versions may support richer states such as:

```text
Untranslated
Machine translated
Translated
Needs review
Approved
Source changed
```

Machine-generated translations should be distinguishable from human-reviewed translations.

A source string changing after a translation has been created should be detectable so that the translation can be marked as potentially outdated.

---

# Machine Translation

3Locale should support machine translation as an aid to localisation rather than requiring users to copy text into external translation tools.

Potential providers include:

* Google Cloud Translation;
* Microsoft Translator;
* DeepL;
* future AI/LLM providers.

Users should be able to translate:

* one string;
* selected strings;
* all untranslated strings for a language.

Machine translations must remain editable.

The system should retain enough metadata to identify that a translation originated from machine translation.

---

# Machine Translation Credits

3Locale Cloud may include a monthly machine translation allowance.

A possible initial hosted plan may include approximately:

```text
10,000 machine translation characters/credits per month
```

Exact limits and provider costs should be validated before launch.

Additional translation usage may later be:

* purchased separately;
* included in higher tiers;
* performed using a user's own provider API key.

The Community edition should be capable of supporting user-supplied translation credentials where practical.

---

# Import

Users should be able to import supported localisation resource files.

Import should:

* identify translation keys;
* extract source strings;
* add newly discovered keys;
* update changed source values;
* preserve existing translations where appropriate;
* report malformed or unsupported input clearly.

Import must not silently destroy translation data.

Where an imported source file removes an existing key, 3Locale should not immediately destroy historical translations without an explicit product decision.

The first version may support a single format, with additional formats added incrementally.

---

# Export

Users should be able to export project translations in formats supported by the project.

Export should produce valid resource files suitable for use directly by an application.

A project may eventually export:

* one language;
* selected languages;
* all languages;
* a ZIP containing all resource files.

Export should not include invalid translation data without clearly informing the user.

---

# Validation

3Locale should help prevent localisation mistakes.

Potential validation rules include:

* required translation missing;
* placeholder missing;
* placeholder changed;
* malformed interpolation syntax;
* duplicate key;
* unsupported value type;
* translation unexpectedly empty;
* incompatible pluralisation structure.

Example:

```text
Source:
Hello {name}

Translation:
Bonjour

Problem:
{name} placeholder is missing from the translation.
```

Validation rules should be appropriate to the relevant resource format.

---

# Pluralisation and Variables

3Locale must not assume all localisation strings contain simple static text.

The product should eventually support common localisation concepts such as:

* variables;
* placeholders;
* plural forms;
* interpolation;
* multiline strings;
* escaped content.

The common internal representation should preserve enough information to safely round-trip supported source formats.

---

# Context

A translator often requires more information than the source string alone.

Future versions should allow translation keys to contain contextual information such as:

* description;
* developer note;
* screenshot;
* source file/location;
* usage example.

Example:

```text
Key:
account.close

Source:
Close

Context:
Button used to close the account permanently,
not to close the current dialog.
```

---

# Screenshots

Future versions may allow screenshots to be associated with translation keys.

Screenshots can help translators understand where and how text appears in the application.

Potential future capabilities include:

* manually upload a screenshot;
* associate a screenshot with one or more keys;
* highlight the relevant UI region;
* automatically capture screenshots through application integration.

This is not required for the first implementation.

---

# Git Integration

Git-based localisation should eventually become a major workflow.

Potential integrations include:

* GitHub;
* GitLab;
* Bitbucket.

A future workflow may be:

```text
Repository
    ↓
3Locale detects localisation files
    ↓
New or changed keys imported
    ↓
Translations updated
    ↓
3Locale creates commit or pull request
```

The exact workflow should be designed after the basic import/export system is proven.

Git integration is not required for the initial product milestone.

---

# Teams and Collaboration

3Locale Cloud should eventually support multiple users collaborating on the same project.

Potential capabilities include:

* invite users;
* assign users to projects;
* translator access;
* reviewer access;
* administrator access;
* comments;
* translation review;
* activity history.

Complex enterprise permissions should not be built before real customer requirements justify them.

---

# Localisation of 3Locale

All 3Locale user-facing text must use i18next/react-i18next from the beginning rather than hard-coded English strings. Once the core product can manage localisation projects, the 3Locale application's own translation catalogue should be managed through 3Locale where practical.

This serves several purposes:

* demonstrates that the product works;
* provides a realistic internal test project;
* prevents hard-coded English from becoming embedded in the application;
* forces support for RTL languages from the beginning.

The application should eventually be available in multiple languages.

English may be the initial source language.

---

# RTL Support

3Locale must support right-to-left languages as a first-class requirement.

Languages such as Arabic and Hebrew must render correctly.

UI development should therefore avoid assumptions about physical left/right layout.

New significant interface functionality should be tested in at least one RTL language before being considered complete once RTL testing infrastructure exists.

---

# Community Edition

3Locale Community is the open-source version.

The Community edition should provide enough functionality to be useful as a real localisation management system.

Expected Community capabilities include:

* projects;
* languages;
* translation keys;
* translation editing;
* import/export;
* validation;
* local database;
* supported machine translation providers using user credentials;
* local/self-hosted deployment.

Community should not be intentionally frustrating in order to push users toward the hosted service.

---

# 3Locale Cloud

3Locale Cloud is the managed hosted service.

Its primary value proposition is:

> Use 3Locale without deploying, maintaining, upgrading, backing up, or monitoring it yourself.

Potential Cloud capabilities include:

* managed hosting;
* automatic upgrades;
* backups;
* managed authentication;
* team collaboration;
* machine translation allowance;
* managed Git synchronisation;
* scheduled tasks;
* managed file storage;
* email notifications;
* usage reporting;
* billing.

The initial target is a low-cost plan suitable for individual developers and small teams.

A provisional target is approximately:

```text
$10/month
```

Exact pricing and included allowances are subject to validation.

---

# Free Hosted Tier

3Locale Cloud may include a limited free hosted tier.

Its purpose would be to allow developers to evaluate the product without installing it.

Possible restrictions might include:

* one project;
* limited number of keys;
* limited machine translation credits;
* limited users.

Limits should be generous enough for meaningful evaluation without eliminating the incentive to upgrade.

A free hosted tier is not required for the first release.

---

# Enterprise / Private Deployment

A future commercial self-hosted edition may be introduced if demand exists.

Potential Enterprise capabilities include:

* SSO;
* advanced RBAC;
* audit history;
* organisation management;
* support SLA;
* private deployment;
* enterprise database support;
* advanced backup/retention;
* custom integrations.

This edition should be driven by actual customer requirements rather than speculative development.

---

# API

3Locale should eventually provide a documented API so development workflows can interact with projects programmatically.

Potential use cases include:

* importing translations;
* exporting translations;
* querying missing strings;
* triggering machine translation;
* CI/CD integration;
* Git automation.

The internal UI may use the same API where practical.

API stability requirements may become stricter once the public API is released.

---

# CLI

A command-line interface may eventually complement the web application.

Potential commands might include:

```text
3locale login
3locale pull
3locale push
3locale import
3locale export
3locale validate
3locale status
```

This would allow 3Locale to fit naturally into developer workflows and CI/CD pipelines.

The CLI is not required for the initial milestone.

---

# Product Principles

## Developer First

3Locale should feel natural to software developers.

Avoid unnecessary project-management or enterprise-process complexity.

## Simple by Default

Common operations should require as few steps as possible.

Advanced capabilities should not make basic translation management difficult.

## Open Source Should Be Useful

Self-hosting must remain a legitimate product choice.

## Cloud Should Sell Convenience

Hosted customers should pay primarily because 3Locale saves them operational effort.

## Avoid Enterprise Bloat

Do not add features merely because large TMS products have them.

Features should solve demonstrated user problems.

## Automation Over Administration

Where practical, 3Locale should reduce localisation management work rather than create additional management processes.

## Interoperability

Users must be able to import and export their localisation resources.

3Locale should not attempt to lock customer translation data into a proprietary format.

## Predictable Pricing

Pricing should be easy to understand.

Avoid complicated per-seat, per-project, per-language, per-string, and per-operation charging combinations unless there is a compelling reason.

---

# Initial Product Milestone

The first milestone should prove the fundamental localisation workflow.

The user must be able to:

1. Start 3Locale locally.
2. Create a project.
3. Give the project a name.
4. Select a source language.
5. Add one target language.
6. Import a supported source resource file.
7. View the imported keys and source strings.
8. Enter translations for the target language.
9. See which strings remain untranslated.
10. Export a valid translated resource file.

The first milestone does not require:

* authentication;
* teams;
* cloud hosting;
* billing;
* Git integration;
* screenshots;
* machine translation;
* email;
* queues;
* Enterprise functionality.

The purpose of the milestone is to prove that the core localisation model and user workflow are sound.

---

# Suggested Second Milestone

Once the initial localisation workflow is working reliably, the next milestone may introduce local user authentication and project ownership.

Potential scope:

* user registration;
* sign-in;
* sign-out;
* password hashing;
* authenticated sessions;
* project ownership;
* protected application routes;
* duplicate email validation;
* authentication tests.

The exact milestone sequence may change as development progresses.

---

# Longer-Term Opportunities

Potential future capabilities include:

* translation memory;
* terminology/glossaries;
* AI translation;
* bulk translation;
* translation suggestions;
* source-string change detection;
* review workflows;
* GitHub/GitLab integrations;
* automatic pull requests;
* screenshots;
* contextual translation;
* webhooks;
* CLI;
* public API;
* CI/CD validation;
* translation analytics;
* import/export plugins;
* developer SDKs;
* VS Code integration;
* MCP integration.

These are opportunities rather than committed requirements.

They should not distract from establishing a simple, reliable core product.

---

# Success Criteria

The initial product is successful if a developer can replace manual editing of localisation resource files with 3Locale and find the resulting workflow easier.

The broader open-source/cloud experiment is successful if:

* developers choose to self-host the Community edition;
* users consider the hosted version worth paying for rather than operating it themselves;
* the same core application can support both deployment models;
* development remains manageable for a very small team;
* the project provides a useful environment for developing and evaluating agentic software-development workflows.
