import {
  AppError,
  translationFor,
  isReady,
  revisionLimit,
  type ProjectRepository,
  type ResourceFormat,
  type ProjectDetail,
  type AuditRecord,
  type ArchiveProvider,
} from "../domain/model";
import { canonicalLanguage } from "../domain/languages";
import {
  analyseImport,
  setValue,
  type LocaleFile,
  type ConflictPolicy,
} from "./imports";
import { changes } from "./audit";
export interface NewProject {
  id: string;
  name: string;
  baseLanguage: string;
  targetLanguages: string[];
}
export class ProjectService {
  constructor(
    private repository: ProjectRepository,
    private format: ResourceFormat,
    private clock: () => string = () => new Date().toISOString(),
    private archive?: ArchiveProvider,
  ) {}
  async list() {
    return this.repository.list();
  }
  private seed(input: NewProject): ProjectDetail {
    const baseLanguage = canonicalLanguage(input.baseLanguage);
    const languages = [
      baseLanguage,
      ...input.targetLanguages.map(canonicalLanguage),
    ];
    if (languages.length > 100 || new Set(languages).size !== languages.length)
      throw new AppError("invalidLanguages");
    const now = this.clock();
    return {
      id: input.id,
      name: input.name,
      baseLanguage,
      languages,
      entries: [],
      createdAt: now,
      updatedAt: now,
      version: 0,
      languageMetadata: Object.fromEntries(
        languages.map((language) => [
          language,
          { createdAt: now, updatedAt: now },
        ]),
      ),
    };
  }
  private async save(
    previous: ProjectDetail | undefined,
    next: ProjectDetail,
    event?: AuditRecord,
    checkpoints = false,
  ) {
    const now = this.clock();
    next.version = (previous?.version ?? 0) + 1;
    const events = changes(previous, next);
    if (event) events.push(event);
    await this.repository.commit({
      previous,
      project: next,
      expectedVersion: previous?.version ?? null,
      occurredAt: now,
      events,
      revisionLimit,
      checkpoints: checkpoints
        ? [
            ...(previous
              ? [{ kind: "beforeImport", state: previous, createdAt: now }]
              : []),
            { kind: "afterImport", state: next, createdAt: now },
          ]
        : [],
    });
    return this.get(next.id);
  }
  async create(input: NewProject) {
    if (!input.targetLanguages.length) throw new AppError("invalidLanguages");
    return this.save(undefined, this.seed(input));
  }
  async get(id: string) {
    const project = await this.repository.get(id);
    if (!project) throw new AppError("notFound", 404);
    return project;
  }
  async addLanguage(id: string, language: string) {
    language = canonicalLanguage(language);
    const previous = await this.get(id);
    if (
      previous.languages.includes(language) ||
      previous.languages.length >= 100
    )
      throw new AppError("invalidLanguages");
    const next = structuredClone(previous);
    const now = this.clock();
    next.languages.push(language);
    next.languageMetadata[language] = { createdAt: now, updatedAt: now };
    next.updatedAt = now;
    return this.save(previous, next);
  }
  async previewImport(id: string, files: LocaleFile[]) {
    return analyseImport(await this.get(id), files, this.format, this.clock())
      .preview;
  }
  async previewNew(input: NewProject, files: LocaleFile[]) {
    const project = this.seed(input);
    if (
      !files.some(
        (file) => canonicalLanguage(file.language) === project.baseLanguage,
      )
    )
      throw new AppError("baseFileRequired");
    const plan = analyseImport(project, files, this.format, this.clock());
    if (plan.next.languages.length < 2) throw new AppError("invalidLanguages");
    return plan.preview;
  }
  private async apply(
    previous: ProjectDetail | undefined,
    initial: ProjectDetail,
    files: LocaleFile[],
    policy: ConflictPolicy,
    expectedVersion: number,
  ) {
    if (initial.version !== expectedVersion)
      throw new AppError("stalePreview", 409);
    if (policy !== "keepExisting" && policy !== "useImported")
      throw new AppError("conflictPolicyRequired");
    const { preview, next } = analyseImport(
      initial,
      files,
      this.format,
      this.clock(),
      policy,
    );
    if (preview.issues.length) throw new AppError(preview.issues[0].code);
    const project = await this.save(
      previous,
      next,
      {
        kind:
          files.length === 1 && preview.languages[0] === initial.baseLanguage
            ? "base.imported"
            : "batch.imported",
        summary: preview.summary,
        policy,
        files: files.map((file, index) => ({
          name: file.name,
          language: preview.languages[index],
        })),
      },
      true,
    );
    return { project, preview };
  }
  async applyImport(
    id: string,
    files: LocaleFile[],
    policy: ConflictPolicy,
    expectedVersion: number,
  ) {
    const previous = await this.get(id);
    return this.apply(previous, previous, files, policy, expectedVersion);
  }
  async createImport(
    input: NewProject,
    files: LocaleFile[],
    policy: ConflictPolicy,
    expectedVersion: number,
  ) {
    await this.previewNew(input, files);
    return this.apply(
      undefined,
      this.seed(input),
      files,
      policy,
      expectedVersion,
    );
  }
  async import(id: string, text: string) {
    const previous = await this.get(id);
    return (
      await this.apply(
        previous,
        previous,
        [
          {
            name: `${previous.baseLanguage}.json`,
            language: previous.baseLanguage,
            confirmed: true,
            text,
          },
        ],
        "keepExisting",
        previous.version,
      )
    ).project;
  }
  async translate(
    id: string,
    entryId: number,
    language: string,
    value: string,
  ) {
    const previous = await this.get(id);
    if (
      language === previous.baseLanguage ||
      !previous.languages.includes(language)
    )
      throw new AppError("invalidLanguages");
    const next = structuredClone(previous);
    const entry = next.entries.find((entry) => entry.id === entryId);
    if (!entry) throw new AppError("notFound", 404);
    if (
      value.trim() &&
      !this.format.validateTranslation(
        translationFor(entry, next.baseLanguage).value,
        value,
      )
    )
      throw new AppError("placeholders");
    const old = translationFor(entry, language);
    if (old.value === value && !old.needsReview) return previous;
    setValue(next, entry, language, value, false, "manual", this.clock());
    return this.save(previous, next);
  }
  private exportProject(project: ProjectDetail, language: string) {
    if (
      language === project.baseLanguage ||
      !project.languages.includes(language)
    )
      throw new AppError("invalidLanguages");
    if (
      !project.entries.length ||
      project.entries.some(
        (entry) =>
          !isReady(translationFor(entry, language)) ||
          !this.format.validateTranslation(
            translationFor(entry, project.baseLanguage).value,
            translationFor(entry, language).value,
          ),
      )
    )
      throw new AppError("incompleteExport", 409);
    return this.format.serialize(
      project.entries.map((entry) => ({
        path: entry.path,
        value: translationFor(entry, language).value,
      })),
    );
  }
  async export(id: string, language: string) {
    return this.exportProject(await this.get(id), language);
  }
  async exportAll(id: string) {
    const project = await this.get(id);
    const files = project.languages
      .filter((language) => language !== project.baseLanguage)
      .map((language) => ({
        name: `${language}.json`,
        text: this.exportProject(project, language),
      }));
    if (!this.archive) throw new Error("Archive provider required");
    return this.archive.pack(files);
  }
  async audit(id: string, before?: number) {
    await this.get(id);
    return this.repository.audit(id, before);
  }
  async revisions(id: string) {
    await this.get(id);
    return this.repository.revisions(id);
  }
  async restore(id: string, revisionId: number, expectedVersion: number) {
    const previous = await this.get(id);
    if (previous.version !== expectedVersion)
      throw new AppError("stalePreview", 409);
    const state = await this.repository.revision(id, revisionId);
    if (!state) throw new AppError("notFound", 404);
    if (state.id !== id || state.baseLanguage !== previous.baseLanguage)
      throw new AppError("invalidRequest");
    const now = this.clock();
    const next = structuredClone(state);
    next.version = previous.version + 1;
    next.updatedAt = now;
    next.createdAt = previous.createdAt;
    for (const language of next.languages) {
      const prior = previous.languageMetadata[language];
      if (prior) next.languageMetadata[language] = { ...prior };
      const values = (project: ProjectDetail) =>
        project.entries
          .map((entry) => ({
            path: entry.path,
            translation: entry.translations
              .filter((value) => value.language === language)
              .map(({ value, needsReview, origin }) => ({
                value,
                needsReview,
                origin,
              })),
          }))
          .sort((a, b) =>
            JSON.stringify(a.path).localeCompare(JSON.stringify(b.path)),
          );
      if (
        !prior ||
        JSON.stringify(values(previous)) !== JSON.stringify(values(next))
      )
        next.languageMetadata[language].updatedAt = now;
    }
    for (const entry of next.entries) {
      const old = previous.entries.find(
        (item) => JSON.stringify(item.path) === JSON.stringify(entry.path),
      );
      let changed =
        !old || old.translations.length !== entry.translations.length;
      entry.createdAt = old?.createdAt ?? entry.createdAt;
      for (const value of entry.translations) {
        const prior = old?.translations.find(
          (item) => item.language === value.language,
        );
        const same =
          prior &&
          prior.value === value.value &&
          prior.needsReview === value.needsReview &&
          prior.origin === value.origin;
        value.createdAt = prior?.createdAt ?? value.createdAt;
        value.updatedAt = same ? prior.updatedAt : now;
        if (!same) changed = true;
      }
      entry.updatedAt = changed ? now : old!.updatedAt;
    }
    await this.repository.commit({
      previous,
      project: next,
      expectedVersion: previous.version,
      occurredAt: now,
      events: [{ kind: "revision.restored", revisionId }],
      checkpoints: [
        { kind: "beforeRestore", state: previous, createdAt: now },
        { kind: "afterRestore", state: next, createdAt: now },
      ],
      revisionLimit,
    });
    return this.get(id);
  }
}
