import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectService } from "../../src/application/projects";
import { jsonResource } from "../../src/providers/json";
import { zipArchive } from "../../src/providers/zip";
import {
  AppError,
  translationFor,
  type ProjectRepository,
  type ProjectCommit,
  type ProjectDetail,
} from "../../src/domain/model";
export interface RepositoryFixture {
  repository: ProjectRepository;
  execute(sql: string): Promise<void>;
  close(): Promise<void>;
}
export function repositoryContract(
  name: string,
  create: () => Promise<RepositoryFixture>,
) {
  describe(`${name} repository contract`, () => {
    let fixture: RepositoryFixture,
      repository: ProjectRepository,
      service: ProjectService;
    let time: string;
    const input = {
      id: "project",
      name: "العربية",
      baseLanguage: "en",
      targetLanguages: ["fr", "ar"],
    };
    const file = (language: string, value: unknown) => ({
      name: `${language}.json`,
      language,
      confirmed: true,
      text: JSON.stringify(value),
    });
    const importFiles = async () => {
      const current = await service.get(input.id);
      return (
        await service.applyImport(
          input.id,
          [
            file("en", { "a.b": "Literal", a: { b: "Nested {name}" } }),
            file("fr", { "a.b": "Littéral", a: { b: "Imbriqué {name}" } }),
            file("ar", { "a.b": "حرفي", a: { b: "متداخل {name}" } }),
          ],
          "keepExisting",
          current.version,
        )
      ).project;
    };
    const snapshot = async () => ({
      project: await repository.get(input.id),
      audit: await repository.audit(input.id),
      revisions: await repository.revisions(input.id),
    });
    const commit = (previous: ProjectDetail, label: string): ProjectCommit => {
      const project = structuredClone(previous);
      project.version++;
      project.name = label;
      return {
        previous,
        project,
        expectedVersion: previous.version,
        occurredAt: time,
        events: [{ kind: "contract", next: label }],
        checkpoints: [{ kind: label, state: project, createdAt: time }],
        revisionLimit: 100,
      };
    };
    beforeEach(async () => {
      fixture = await create();
      repository = fixture.repository;
      time = "2026-09-25T10:00:00.000Z";
      service = new ProjectService(
        repository,
        jsonResource,
        () => time,
        zipArchive,
      );
      await service.create(input);
    });
    afterEach(async () => {
      await fixture?.close();
    });
    it("persists multilingual structural paths, lifecycle metadata, provenance and exports", async () => {
      time = "2026-09-25T11:00:00.000Z";
      const imported = await importFiles();
      expect(imported.languages).toEqual(["en", "fr", "ar"]);
      expect(imported.entries).toHaveLength(2);
      expect(imported.entries.map((entry) => entry.path)).toContainEqual([
        "a.b",
      ]);
      expect(imported.entries.map((entry) => entry.path)).toContainEqual([
        "a",
        "b",
      ]);
      const entry = imported.entries.find((entry) => entry.path.length === 1)!;
      expect(translationFor(entry, "ar")).toMatchObject({
        value: "حرفي",
        origin: "import",
        createdAt: time,
        updatedAt: time,
      });
      expect(imported.updatedAt).toBe(time);
      expect(imported.languageMetadata.fr.updatedAt).toBe(time);
      expect(imported.createdAt).toBe("2026-09-25T10:00:00.000Z");
      expect((await repository.list())[0]).toMatchObject({
        id: input.id,
        languages: imported.languages,
      });
      expect(await repository.get(input.id)).toEqual(imported);
      time = "2026-09-25T12:00:00.000Z";
      const edited = await service.translate(
        input.id,
        entry.id,
        "fr",
        "Manuel",
      );
      expect(
        translationFor(
          edited.entries.find((item) => item.id === entry.id)!,
          "fr",
        ),
      ).toMatchObject({
        origin: "manual",
        createdAt: imported.updatedAt,
        updatedAt: time,
      });
      expect(JSON.parse(await service.export(input.id, "fr"))).toEqual({
        "a.b": "Manuel",
        a: { b: "Imbriqué {name}" },
      });
      expect((await service.exportAll(input.id)).length).toBeGreaterThan(0);
      const added = await service.addLanguage(input.id, "de");
      expect(added.languages).toEqual(["en", "fr", "ar", "de"]);
      expect(added.languageMetadata.de.createdAt).toBe(time);
    });
    it("keeps previews read-only and preserves reconciliation, review and audit metadata", async () => {
      const initial = await importFiles();
      const before = await snapshot();
      const files = [
        file("en", { "a.b": "Changed" }),
        file("fr", { "a.b": "Nouveau", orphan: "Skipped" }),
      ];
      const preview = await service.previewImport(input.id, files);
      expect(preview.summary).toMatchObject({
        baseChanged: 1,
        conflicts: 1,
        orphans: 1,
        reviewMarked: 2,
      });
      expect(await snapshot()).toEqual(before);
      const result = await service.applyImport(
        input.id,
        files,
        "keepExisting",
        initial.version,
      );
      const entry = result.project.entries.find(
        (entry) => entry.path.length === 1,
      )!;
      expect(translationFor(entry, "fr")).toMatchObject({
        value: "Littéral",
        needsReview: true,
      });
      expect(translationFor(entry, "ar").needsReview).toBe(true);
      expect(result.project.entries).toHaveLength(2);
      await expect(service.exportAll(input.id)).rejects.toThrow(
        "incompleteExport",
      );
      const audit = await repository.audit(input.id);
      expect(audit[0]).toMatchObject({
        kind: "batch.imported",
        summary: preview.summary,
        policy: "keepExisting",
      });
      expect(audit.map((event) => event.id)).toEqual(
        audit.map((event) => event.id).sort((a, b) => b - a),
      );
      expect(audit).toContainEqual(
        expect.objectContaining({
          kind: "base.changed",
          path: ["a.b"],
          previous: expect.objectContaining({ value: "Literal" }),
          next: expect.objectContaining({ value: "Changed" }),
        }),
      );
    });
    it("paginates audit by ID without leaking other projects", async () => {
      const initial = await importFiles();
      await service.create({ ...input, id: "other" });
      for (let i = 0; i < 102; i++)
        await service.translate(
          input.id,
          initial.entries[0].id,
          "fr",
          `value ${i} {name}`,
        );
      const first = await repository.audit(input.id),
        second = await repository.audit(input.id, first.at(-1)!.id);
      expect(first).toHaveLength(100);
      expect(second.length).toBeGreaterThan(0);
      expect(
        second.every(
          (event) =>
            event.id < first.at(-1)!.id && event.projectId === input.id,
        ),
      ).toBe(true);
      expect(first.every((event) => event.projectId === input.id)).toBe(true);
      expect(
        (await repository.audit("other")).every(
          (event) => event.projectId === "other",
        ),
      ).toBe(true);
    });
    it("retains the newest 100 revisions independently and restores with recovery history", async () => {
      const original = await importFiles();
      const saved = (await repository.revisions(input.id))[0];
      await service.create({ ...input, id: "other" });
      await service.import("other", '{"a":"Other"}');
      const other = await repository.revisions("other");
      await service.import(input.id, '{"a.b":"Different","added":"New"}');
      await service.addLanguage(input.id, "de");
      const before = await snapshot();
      const restored = await service.restore(
        input.id,
        saved.id,
        before.project!.version,
      );
      expect(restored.languages).toEqual(original.languages);
      expect(restored.entries.map((entry) => entry.path)).toEqual(
        original.entries.map((entry) => entry.path),
      );
      expect(
        translationFor(
          restored.entries.find((entry) => entry.path.length === 1)!,
          "fr",
        ).needsReview,
      ).toBe(false);
      expect((await repository.audit(input.id)).slice(1)).toEqual(before.audit);
      expect((await repository.audit(input.id))[0]).toMatchObject({
        kind: "revision.restored",
        revisionId: saved.id,
      });
      const recovery = (await repository.revisions(input.id)).find(
        (revision) => revision.kind === "beforeRestore",
      )!;
      expect(
        (await repository.revision(input.id, recovery.id))!.languages,
      ).toContain("de");
      expect(await repository.revision("other", saved.id)).toBeUndefined();
      for (let i = 0; i < 51; i++)
        await service.import(input.id, JSON.stringify({ "a.b": String(i) }));
      const revisions = await repository.revisions(input.id);
      expect(revisions).toHaveLength(100);
      expect(await repository.revision(input.id, saved.id)).toBeUndefined();
      expect(await repository.revisions("other")).toEqual(other);
      const count = revisions.length;
      await service.translate(
        input.id,
        restored.entries[0].id,
        "fr",
        "Manuel {name}",
      );
      expect(await repository.revisions(input.id)).toHaveLength(count);
    });
    it("atomically admits exactly one concurrent writer and does not apply the loser's pruning", async () => {
      await importFiles();
      const previous = (await repository.get(input.id))!;
      const a = commit(previous, "A"),
        b = commit(previous, "B");
      const old = await snapshot();
      const results = await Promise.allSettled([
        repository.commit(a),
        repository.commit(b),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(AppError);
      expect(rejected.reason.code).toBe("stalePreview");
      const winner = (await repository.get(input.id))!;
      expect(winner.version).toBe(previous.version + 1);
      expect(["A", "B"]).toContain(winner.name);
      expect(await repository.audit(input.id)).toHaveLength(
        old.audit.length + 1,
      );
      expect(await repository.revisions(input.id)).toHaveLength(
        old.revisions.length + 1,
      );
      const stable = await snapshot();
      await expect(
        repository.commit({ ...commit(previous, "stale"), revisionLimit: 1 }),
      ).rejects.toThrow("stalePreview");
      expect(await snapshot()).toEqual(stable);
    });
    it("rolls back mutations, audit, checkpoints and retention on a late database failure", async () => {
      await importFiles();
      const previous = (await repository.get(input.id))!;
      const before = await snapshot();
      await fixture.execute(
        "CREATE TRIGGER fail_prune AFTER DELETE ON revisions BEGIN SELECT RAISE(ABORT, 'injected pruning failure'); END;",
      );
      await expect(
        repository.commit({ ...commit(previous, "fail"), revisionLimit: 1 }),
      ).rejects.toThrow("injected pruning failure");
      expect(await snapshot()).toEqual(before);
    });
    it("rejects invalid entry/language ownership and paths without partial history", async () => {
      await importFiles();
      const previous = (await repository.get(input.id))!;
      const before = await snapshot();
      const invalid = commit(previous, "invalid");
      invalid.project.entries[0].translations.push({
        ...invalid.project.entries[0].translations[0],
        language: "ja",
      });
      await expect(repository.commit(invalid)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
      const duplicate = commit(previous, "duplicate");
      duplicate.project.entries[1].path = duplicate.project.entries[0].path;
      await expect(repository.commit(duplicate)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    });
  });
}
