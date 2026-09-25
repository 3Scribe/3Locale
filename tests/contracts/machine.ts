import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MachineTranslationService } from "../../src/application/machine-translation";
import { ProjectService } from "../../src/application/projects";
import { jsonResource } from "../../src/providers/json";
import { translationFor, type ProjectDetail } from "../../src/domain/model";
import type { RepositoryFixture } from "./repository";
import { FakeTranslationProvider } from "../helpers/fake-provider";
export function machineContract(
  name: string,
  create: () => Promise<RepositoryFixture>,
) {
  describe(`${name} automatic translation`, () => {
    let fixture: RepositoryFixture,
      projects: ProjectService,
      machine: MachineTranslationService,
      provider: FakeTranslationProvider,
      time: string;
    const get = () => projects.get("machine");
    const state = async () => ({
      project: await get(),
      audit: await fixture.repository.audit("machine"),
      revisions: await fixture.repository.revisions("machine"),
    });
    const fr = (project: ProjectDetail, key: string) =>
      translationFor(
        project.entries.find((entry) => entry.path[0] === key)!,
        "fr",
      );
    const apply = async () =>
      machine.apply(
        "machine",
        { language: "fr" },
        (await get()).version,
        true,
        "fake",
      );
    beforeEach(async () => {
      fixture = await create();
      provider = new FakeTranslationProvider();
      time = "2026-09-25T10:00:00.000Z";
      projects = new ProjectService(
        fixture.repository,
        jsonResource,
        () => time,
      );
      machine = new MachineTranslationService(
        fixture.repository,
        jsonResource,
        provider,
        () => time,
      );
      await projects.create({
        id: "machine",
        name: "Machine",
        baseLanguage: "en",
        targetLanguages: ["fr", "ar"],
      });
      await projects.import(
        "machine",
        JSON.stringify({
          hello: "Hello {name} {{name}} {name} 😀",
          save: "Save",
          existing: "Existing",
          empty: "   ",
        }),
      );
      const project = await get();
      await projects.translate(
        "machine",
        project.entries.find((entry) => entry.path[0] === "existing")!.id,
        "fr",
        "Human",
      );
      time = "2026-09-25T11:00:00.000Z";
    });
    afterEach(async () => {
      await fixture?.close();
    });
    it("plans locally with code-point counts and enforces selection and confirmation", async () => {
      const before = await state(),
        plan = await machine.preview("machine", { language: "fr" });
      expect(plan.summary).toEqual({
        requested: 4,
        eligible: 2,
        sourceCharacters: 34,
        skippedExisting: 1,
        ineligible: 1,
      });
      expect(provider.calls).toHaveLength(0);
      expect(await state()).toEqual(before);
      const existing = before.project.entries.find(
        (entry) => entry.path[0] === "existing",
      )!.id;
      expect(
        (
          await machine.preview("machine", {
            language: "fr",
            entryIds: [existing, 9999],
          })
        ).summary,
      ).toMatchObject({ eligible: 0, skippedExisting: 1, ineligible: 1 });
      await expect(
        machine.preview("machine", { language: "en" }),
      ).rejects.toThrow("invalidLanguages");
      await expect(
        machine.preview("machine", {
          language: "fr",
          entryIds: [existing, existing],
        }),
      ).rejects.toThrow("invalidRequest");
      await expect(
        machine.apply(
          "machine",
          { language: "fr" },
          plan.version,
          false,
          "fake",
        ),
      ).rejects.toThrow("invalidRequest");
      await expect(
        machine.apply(
          "machine",
          { language: "fr" },
          plan.version - 1,
          true,
          "fake",
        ),
      ).rejects.toThrow("stalePreview");
      expect(provider.calls).toHaveLength(0);
      provider.configured = false;
      expect(
        (await machine.preview("machine", { language: "fr" })).configured,
      ).toBe(false);
      await expect(apply()).rejects.toThrow("machineNotConfigured");
      await projects.addLanguage("machine", "zz");
      expect(
        (await machine.preview("machine", { language: "zz" })).supported,
      ).toBe(false);
    });
    it("fills only missing values, preserves placeholders and timestamps, and commits audit/checkpoints", async () => {
      const before = await state(),
        result = await apply();
      expect(result.translated).toBe(2);
      expect(result.failures).toEqual([]);
      expect(fr(result.project, "existing")).toEqual(
        fr(before.project, "existing"),
      );
      expect(fr(result.project, "hello")).toMatchObject({
        value: "Translated: Hello {name} {{name}} {name} 😀",
        origin: "machine",
        originProvider: "fake",
        originModel: null,
        needsReview: true,
        createdAt: time,
        updatedAt: time,
      });
      expect(result.project.languageMetadata.ar).toEqual(
        before.project.languageMetadata.ar,
      );
      expect(fr(result.project, "empty").value).toBe("");
      expect(
        provider.calls[0].items.every((item) => !item.text.includes("{name}")),
      ).toBe(true);
      expect((await fixture.repository.audit("machine"))[0]).toMatchObject({
        kind: "machine.translation.completed",
        provider: "fake",
        sourceLanguage: "en",
        language: "fr",
        summary: { translated: 2, failed: 0, sourceCharacters: 34 },
      });
      expect(
        (await fixture.repository.revisions("machine"))
          .slice(0, 2)
          .map((item) => item.kind),
      ).toEqual(["afterMachineTranslation", "beforeMachineTranslation"]);
      await expect(projects.export("machine", "fr")).rejects.toThrow(
        "incompleteExport",
      );
      await apply();
      expect(provider.calls).toHaveLength(1);
    });
    it("approves unchanged machine values, clears provider provenance on edits, and re-reviews base changes", async () => {
      const translate = provider.translate.bind(provider);
      provider.translate = async (request) => ({
        items: (await translate(request)).items.map((item) => ({
          ...item,
          model: "reported-test-model",
        })),
      });
      let project = (await apply()).project;
      const hello = project.entries.find((entry) => entry.path[0] === "hello")!;
      time = "2026-09-25T12:00:00.000Z";
      const revisions = await fixture.repository.revisions("machine");
      project = await machine.approve(
        "machine",
        { language: "fr", entryIds: [hello.id] },
        project.version,
        true,
      );
      expect(fr(project, "hello")).toMatchObject({
        origin: "machine",
        originProvider: "fake",
        needsReview: false,
        updatedAt: time,
        originModel: "reported-test-model",
      });
      expect(await fixture.repository.revisions("machine")).toEqual(revisions);
      expect((await fixture.repository.audit("machine"))[0].kind).toBe(
        "translation.approved",
      );
      await expect(
        machine.approve("machine", { language: "fr" }, project.version, false),
      ).rejects.toThrow("invalidRequest");
      project = await machine.approve(
        "machine",
        { language: "fr" },
        project.version,
        true,
      );
      expect(fr(project, "save").needsReview).toBe(false);
      expect((await fixture.repository.audit("machine"))[0].kind).toBe(
        "translation.approval.bulk",
      );
      project = await projects.import(
        "machine",
        JSON.stringify({ hello: "Changed {name} {{name}} {name} 😀" }),
      );
      expect(fr(project, "hello")).toMatchObject({
        origin: "machine",
        originProvider: "fake",
        needsReview: true,
      });
      project = await projects.translate(
        "machine",
        hello.id,
        "fr",
        "Manual {name} {{name}} {name}",
      );
      expect(fr(project, "hello")).toMatchObject({
        origin: "manual",
        originProvider: null,
        originModel: null,
        needsReview: false,
      });
    });
    it("rejects stale provider results without writing any state or history", async () => {
      const translate = provider.translate.bind(provider);
      let during: Awaited<ReturnType<typeof state>>;
      provider.translate = async (request) => {
        await projects.addLanguage("machine", "de");
        during = await state();
        return translate(request);
      };
      await expect(apply()).rejects.toThrow("stalePreview");
      expect(await state()).toEqual(during!);
    });
    it("rejects a writer racing the final commit and protects a newly filled target", async () => {
      const commit = fixture.repository.commit.bind(fixture.repository);
      let during: Awaited<ReturnType<typeof state>>;
      fixture.repository.commit = async (change) => {
        fixture.repository.commit = commit;
        const entry = (await get()).entries.find(
          (entry) => entry.path[0] === "save",
        )!;
        await projects.translate(
          "machine",
          entry.id,
          "fr",
          "Concurrent human value",
        );
        during = await state();
        return commit(change);
      };
      await expect(apply()).rejects.toThrow("stalePreview");
      expect(await state()).toEqual(during!);
    });
    it("commits valid partial results together and leaves invalid entries untouched", async () => {
      const translate = provider.translate.bind(provider);
      provider.translate = async (request) => {
        const result = await translate(request);
        const hello = request.items.find((item) => item.path[0] === "hello")!;
        return {
          items: result.items
            .map((item) =>
              item.id === hello.id ? { id: item.id, text: "Corrupted" } : item,
            )
            .reverse(),
        };
      };
      const result = await apply();
      expect(result.translated).toBe(1);
      expect(result.failures).toEqual([
        {
          id: result.project.entries.find((entry) => entry.path[0] === "hello")!
            .id,
          path: ["hello"],
          code: "machineInvalidResult",
        },
      ]);
      expect(fr(result.project, "hello").value).toBe("");
      expect(fr(result.project, "save").origin).toBe("machine");
    });
    it("leaves no empty history on invalid results or complete provider failure", async () => {
      const before = await state();
      provider.translate = async (request) => ({
        items: request.items.map((item) => ({
          id: item.id,
          error: "machineInvalidResult",
        })),
      });
      expect((await apply()).translated).toBe(0);
      expect(await state()).toEqual(before);
      provider.translate = async () => {
        throw new Error("credential must never escape");
      };
      await expect(apply()).rejects.toThrow("machineUnavailable");
      expect(await state()).toEqual(before);
      provider.translate = async () => ({ items: [] });
      await expect(apply()).rejects.toThrow("machineMalformedResponse");
      expect(await state()).toEqual(before);
    });
    it("rolls back machine provenance, audit, checkpoints and retention on persistence failure", async () => {
      const before = await state();
      await fixture.execute(
        "CREATE TRIGGER fail_machine BEFORE INSERT ON revisions WHEN NEW.kind = 'afterMachineTranslation' BEGIN SELECT RAISE(ABORT, 'injected machine failure'); END",
      );
      await expect(apply()).rejects.toThrow("injected machine failure");
      expect(await state()).toEqual(before);
    });
    it("restores before/after machine checkpoints and supports one-entry requests", async () => {
      const previous = await get(),
        entry = previous.entries.find((entry) => entry.path[0] === "hello")!;
      const result = await machine.apply(
        "machine",
        { language: "fr", entryIds: [entry.id] },
        previous.version,
        true,
        "fake",
      );
      expect(result.translated).toBe(1);
      expect(fr(result.project, "save").value).toBe("");
      const [after, before] = await fixture.repository.revisions("machine");
      let project = await projects.restore(
        "machine",
        before.id,
        result.project.version,
      );
      expect(fr(project, "hello").value).toBe("");
      project = await projects.restore("machine", after.id, project.version);
      expect(fr(project, "hello")).toMatchObject({
        origin: "machine",
        originProvider: "fake",
        needsReview: true,
      });
    });
  });
}
