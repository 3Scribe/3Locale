import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { ProjectService } from "../../src/application/projects";
import { jsonResource } from "../../src/providers/json";
import { zipArchive } from "../../src/providers/zip";
import type { RepositoryFixture } from "./repository";
export function housekeepingContract(
  name: string,
  create: () => Promise<RepositoryFixture>,
) {
  describe(`${name} housekeeping and draft exports`, () => {
    let fixture: RepositoryFixture, service: ProjectService;
    const state = async () => ({
      project: await fixture.repository.get("p"),
      audit: await fixture.repository.audit("p"),
      revisions: await fixture.repository.revisions("p"),
    });
    beforeEach(async () => {
      fixture = await create();
      service = new ProjectService(
        fixture.repository,
        jsonResource,
        () => "2026-09-26T10:00:00.000Z",
        zipArchive,
      );
      await service.create({
        id: "p",
        name: "Project",
        baseLanguage: "en",
        targetLanguages: ["fr", "ar"],
      });
      await service.import(
        "p",
        '{"literal.key":"Hello {name}","nested":{"key":"Save"}}',
      );
      const p = await service.get("p");
      await service.translate(
        "p",
        p.entries.find((e) => e.path.length === 2)!.id,
        "fr",
        "Enregistrer",
      );
    });
    afterEach(async () => {
      await fixture?.close();
    });
    it("renames without touching translations and restoration retains the current name", async () => {
      const before = await state();
      const renamed = await service.rename(
        "p",
        " Renamed ",
        before.project!.version,
      );
      expect(renamed.name).toBe("Renamed");
      expect(renamed.entries).toEqual(before.project!.entries);
      expect((await fixture.repository.audit("p"))[0].kind).toBe(
        "project.renamed",
      );
      expect(await fixture.repository.revisions("p")).toEqual(before.revisions);
      const restored = await service.restore(
        "p",
        before.revisions[0].id,
        renamed.version,
      );
      expect(restored.name).toBe("Renamed");
      await expect(
        service.rename("p", "oops", before.project!.version),
      ).rejects.toThrow("stalePreview");
      await expect(service.rename("p", " ", restored.version)).rejects.toThrow(
        "invalidRequest",
      );
    });
    it("removes only the selected language and can recover its values from a checkpoint", async () => {
      const before = await state(),
        version = before.project!.version;
      await expect(
        service.removeLanguage("p", "fr", version, false),
      ).rejects.toThrow("confirmationRequired");
      await expect(
        service.removeLanguage("p", "en", version, true),
      ).rejects.toThrow("invalidLanguages");
      const removed = await service.removeLanguage("p", "fr", version, true);
      expect(removed.languages).toEqual(["en", "ar"]);
      expect(
        removed.entries.every((e) =>
          e.translations.every((v) => v.language !== "fr"),
        ),
      ).toBe(true);
      expect(removed.languageMetadata.ar).toEqual(
        before.project!.languageMetadata.ar,
      );
      await expect(
        service.removeLanguage("p", "ar", removed.version, true),
      ).rejects.toThrow("lastTargetLanguage");
      const revisions = await fixture.repository.revisions("p");
      expect(revisions[1].kind).toBe("beforeLanguageRemoval");
      const restored = await service.restore(
        "p",
        revisions[1].id,
        removed.version,
      );
      expect(restored.entries.map((e) => e.translations)).toEqual(
        before.project!.entries.map((e) => e.translations),
      );
    });
    it("deletes all project-owned rows and history, without affecting another project", async () => {
      await service.create({
        id: "other",
        name: "Other",
        baseLanguage: "en",
        targetLanguages: ["fr"],
      });
      const before = await state();
      await expect(
        service.delete("p", before.project!.version, "wrong"),
      ).rejects.toThrow("confirmationRequired");
      await expect(
        fixture.repository.delete("p", before.project!.version - 1),
      ).rejects.toThrow("stalePreview");
      expect(await state()).toEqual(before);
      await service.delete("p", before.project!.version, "Project");
      expect(await state()).toEqual({
        project: undefined,
        audit: [],
        revisions: [],
      });
      expect((await service.list()).map((p) => p.id)).toEqual(["other"]);
      // Reusing the same identity would expose any leftover per-project rows or history.
      const recreated = await service.create({
        id: "p",
        name: "Fresh",
        baseLanguage: "en",
        targetLanguages: ["de"],
      });
      expect(recreated.entries).toEqual([]);
      expect(await fixture.repository.revisions("p")).toEqual([]);
      expect(await fixture.repository.audit("p")).toHaveLength(3);
    });
    it("rolls back a deletion failure after child rows have been removed", async () => {
      const before = await state();
      await fixture.execute(
        "CREATE TRIGGER fail_delete BEFORE DELETE ON projects WHEN OLD.id='p' BEGIN SELECT RAISE(ABORT,'delete failed'); END",
      );
      await expect(
        service.delete("p", before.project!.version, "Project"),
      ).rejects.toThrow("delete failed");
      expect(await state()).toEqual(before);
    });
    it("guards a deletion racing another project write", async () => {
      const before = await state(),
        remove = fixture.repository.delete.bind(fixture.repository);
      fixture.repository.delete = async (id, version) => {
        await service.rename(id, "Concurrent", version);
        return remove(id, version);
      };
      await expect(
        service.delete("p", before.project!.version, "Project"),
      ).rejects.toThrow("stalePreview");
      expect((await service.get("p")).name).toBe("Concurrent");
      expect((await service.get("p")).entries).toEqual(before.project!.entries);
    });
    it("exports an explicit draft with empty incomplete values and a structural manifest without mutating history", async () => {
      const before = await state(),
        version = before.project!.version;
      await expect(service.export("p", "fr")).rejects.toThrow(
        "incompleteExport",
      );
      await expect(
        service.exportDraft("p", "fr", version, false),
      ).rejects.toThrow("confirmationRequired");
      await expect(
        service.exportDraft("p", "fr", version - 1, true),
      ).rejects.toThrow("stalePreview");
      const files = unzipSync(
        await service.exportDraft("p", "fr", version, true),
      );
      expect(JSON.parse(strFromU8(files["fr.draft.json"]))).toEqual({
        "literal.key": "",
        nested: { key: "Enregistrer" },
      });
      expect(JSON.parse(strFromU8(files["DRAFT-manifest.json"]))).toMatchObject(
        {
          draft: true,
          ready: 1,
          total: 2,
          issues: [{ path: ["literal.key"], reason: "missing" }],
        },
      );
      expect(await state()).toEqual(before);
    });
    it("never includes unreviewed or placeholder-invalid text in a draft", async () => {
      const previous = await service.get("p"),
        next = structuredClone(previous);
      next.version++;
      const entry = next.entries.find((e) => e.path.length === 1)!;
      entry.translations.push({
        language: "fr",
        value: "Invalid without placeholder",
        needsReview: false,
        origin: "manual",
        createdAt: "now",
        updatedAt: "now",
      });
      next.entries
        .find((e) => e.path.length === 2)!
        .translations.find((v) => v.language === "fr")!.needsReview = true;
      await fixture.repository.commit({
        previous,
        project: next,
        expectedVersion: previous.version,
        occurredAt: "now",
        events: [],
        checkpoints: [],
        revisionLimit: 100,
      });
      const files = unzipSync(
        await service.exportDraft("p", "fr", next.version, true),
      );
      expect(JSON.parse(strFromU8(files["fr.draft.json"]))).toEqual({
        "literal.key": "",
        nested: { key: "" },
      });
      const manifest = JSON.parse(strFromU8(files["DRAFT-manifest.json"]));
      expect(
        manifest.issues.map((i: { reason: string }) => i.reason).sort(),
      ).toEqual(["invalidPlaceholders", "needsReview"]);
    });
  });
}
