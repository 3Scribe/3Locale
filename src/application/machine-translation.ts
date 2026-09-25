import {
  AppError,
  translationFor,
  revisionLimit,
  type ProjectRepository,
  type ResourceFormat,
  type ProjectDetail,
  type AuditRecord,
} from "../domain/model";
import {
  sourceCharacters,
  type TranslationProvider,
} from "../domain/translation";
import { shieldPlaceholders } from "../domain/placeholders";
import { setValue } from "./imports";
import { changes } from "./audit";
export interface MachineSelection {
  language: string;
  entryIds?: number[];
}
export interface MachinePlan {
  version: number;
  provider: string;
  displayName: string;
  configured: boolean;
  supported: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  entryIds?: number[];
  summary: {
    requested: number;
    eligible: number;
    sourceCharacters: number;
    skippedExisting: number;
    ineligible: number;
  };
}
export interface MachineOutcome {
  project: ProjectDetail;
  plan: MachinePlan;
  translated: number;
  failures: { id: number; path: string[]; code: string }[];
  billedCharacters?: number;
}
export class MachineTranslationService {
  constructor(
    private repository: ProjectRepository,
    private format: ResourceFormat,
    private provider: TranslationProvider,
    private clock: () => string = () => new Date().toISOString(),
  ) {}
  private async get(id: string) {
    const project = await this.repository.get(id);
    if (!project) throw new AppError("notFound", 404);
    return project;
  }
  private analyse(project: ProjectDetail, selection: MachineSelection) {
    const { language, entryIds } = selection;
    if (
      language === project.baseLanguage ||
      !project.languages.includes(language)
    )
      throw new AppError("invalidLanguages");
    if (
      entryIds &&
      (!entryIds.length ||
        entryIds.length > 5000 ||
        entryIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
        new Set(entryIds).size !== entryIds.length)
    )
      throw new AppError("invalidRequest");
    const ids = entryIds ?? project.entries.map((entry) => entry.id),
      byId = new Map(project.entries.map((entry) => [entry.id, entry]));
    let skippedExisting = 0,
      ineligible = 0;
    const entries: ProjectDetail["entries"] = [];
    for (const id of ids) {
      const entry = byId.get(id);
      if (!entry) {
        ineligible++;
        continue;
      }
      if (translationFor(entry, language).value.trim()) {
        skippedExisting++;
        continue;
      }
      if (!translationFor(entry, project.baseLanguage).value.trim()) {
        ineligible++;
        continue;
      }
      entries.push(entry);
    }
    const supported = this.provider.supports(project.baseLanguage, language);
    const plan: MachinePlan = {
      version: project.version,
      provider: this.provider.id,
      displayName: this.provider.displayName,
      configured: this.provider.configured,
      supported,
      sourceLanguage: project.baseLanguage,
      targetLanguage: language,
      ...(entryIds ? { entryIds: [...entryIds] } : {}),
      summary: {
        requested: ids.length,
        eligible: supported ? entries.length : 0,
        sourceCharacters: supported
          ? entries.reduce(
              (sum, entry) =>
                sum +
                sourceCharacters(
                  translationFor(entry, project.baseLanguage).value,
                ),
              0,
            )
          : 0,
        skippedExisting,
        ineligible: ineligible + (supported ? 0 : entries.length),
      },
    };
    return { plan, entries };
  }
  async preview(id: string, selection: MachineSelection) {
    return this.analyse(await this.get(id), selection).plan;
  }
  async apply(
    id: string,
    selection: MachineSelection,
    expectedVersion: number,
    confirmed: boolean,
    providerId: string,
  ): Promise<MachineOutcome> {
    if (confirmed !== true || providerId !== this.provider.id)
      throw new AppError("invalidRequest");
    const previous = await this.get(id);
    if (previous.version !== expectedVersion)
      throw new AppError("stalePreview", 409);
    const { plan, entries } = this.analyse(previous, selection);
    if (!plan.configured) throw new AppError("machineNotConfigured", 503);
    if (!plan.supported) throw new AppError("machineUnsupported");
    if (!entries.length)
      return { project: previous, plan, translated: 0, failures: [] };
    const shields = new Map(
      entries.map((entry) => [
        String(entry.id),
        shieldPlaceholders(
          translationFor(entry, previous.baseLanguage).value,
          String(entry.id),
        ),
      ]),
    );
    const result = await this.provider
      .translate({
        sourceLanguage: previous.baseLanguage,
        targetLanguage: selection.language,
        items: entries.map((entry) => ({
          id: String(entry.id),
          path: entry.path,
          text: shields.get(String(entry.id))!.text,
          protectedTokens: shields.get(String(entry.id))!.protectedTokens,
        })),
      })
      .catch((error: unknown) => {
        if (error instanceof AppError) throw error;
        throw new AppError("machineUnavailable", 502);
      });
    if (
      !result ||
      !Array.isArray(result.items) ||
      result.items.length !== entries.length ||
      new Set(result.items.map((item) => item.id)).size !== entries.length ||
      result.items.some((item) => !shields.has(item.id))
    )
      throw new AppError("machineMalformedResponse", 502);
    if ((await this.get(id)).version !== expectedVersion)
      throw new AppError("stalePreview", 409);
    const next = structuredClone(previous),
      byId = new Map(next.entries.map((entry) => [entry.id, entry])),
      now = this.clock();
    const failures: MachineOutcome["failures"] = [];
    let translated = 0;
    for (const item of result.items) {
      const entry = byId.get(Number(item.id))!;
      try {
        if ("error" in item || typeof item.text !== "string")
          throw new AppError("machineInvalidResult");
        const text = shields.get(item.id)!.restore(item.text);
        if (
          !text.trim() ||
          text.length > 20000 ||
          !this.format.validateTranslation(
            translationFor(entry, next.baseLanguage).value,
            text,
          )
        )
          throw new AppError("machineInvalidResult");
        setValue(
          next,
          entry,
          selection.language,
          text,
          true,
          "machine",
          now,
          this.provider.id,
          item.model ?? null,
        );
        translated++;
      } catch {
        failures.push({
          id: entry.id,
          path: entry.path,
          code: "machineInvalidResult",
        });
      }
    }
    if (translated)
      await this.commit(
        previous,
        next,
        [
          {
            kind: "machine.translation.completed",
            provider: this.provider.id,
            sourceLanguage: previous.baseLanguage,
            language: selection.language,
            summary: {
              requested: plan.summary.requested,
              translated,
              failed: failures.length,
              sourceCharacters: plan.summary.sourceCharacters,
            },
          },
        ],
        true,
        now,
      );
    return {
      project: translated ? await this.get(id) : previous,
      plan,
      translated,
      failures,
      ...(result.billedCharacters !== undefined
        ? { billedCharacters: result.billedCharacters }
        : {}),
    };
  }
  async approve(
    id: string,
    selection: MachineSelection,
    expectedVersion: number,
    confirmed: boolean,
  ) {
    if (confirmed !== true) throw new AppError("invalidRequest");
    const previous = await this.get(id);
    if (previous.version !== expectedVersion)
      throw new AppError("stalePreview", 409);
    this.analyse(previous, selection);
    const next = structuredClone(previous),
      now = this.clock(),
      events: AuditRecord[] = [];
    for (const entry of next.entries) {
      if (selection.entryIds && !selection.entryIds.includes(entry.id))
        continue;
      const value = translationFor(entry, selection.language);
      if (
        value.origin !== "machine" ||
        !value.needsReview ||
        !value.value.trim()
      )
        continue;
      if (
        !this.format.validateTranslation(
          translationFor(entry, next.baseLanguage).value,
          value.value,
        )
      )
        throw new AppError("placeholders");
      setValue(
        next,
        entry,
        selection.language,
        value.value,
        false,
        "machine",
        now,
        value.originProvider ?? null,
        value.originModel ?? null,
      );
      events.push({
        kind: "translation.approved",
        path: entry.path,
        language: selection.language,
        provider: value.originProvider ?? undefined,
      });
    }
    if (!events.length) return previous;
    if (!selection.entryIds)
      events.push({
        kind: "translation.approval.bulk",
        language: selection.language,
        summary: { approved: events.length },
      });
    await this.commit(previous, next, events, false, now);
    return this.get(id);
  }
  private async commit(
    previous: ProjectDetail,
    next: ProjectDetail,
    events: AuditRecord[],
    checkpoints: boolean,
    now: string,
  ) {
    next.version = previous.version + 1;
    await this.repository.commit({
      previous,
      project: next,
      expectedVersion: previous.version,
      occurredAt: now,
      events: [...changes(previous, next), ...events],
      checkpoints: checkpoints
        ? [
            {
              kind: "beforeMachineTranslation",
              createdAt: now,
              state: previous,
            },
            { kind: "afterMachineTranslation", createdAt: now, state: next },
          ]
        : [],
      revisionLimit,
    });
  }
}
