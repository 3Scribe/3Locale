import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { SqliteProjectRepository } from "../src/persistence/sqlite";
import { ProjectService } from "../src/application/projects";
import { type LocaleFile } from "../src/application/imports";
import { translationFor, type ProjectDetail } from "../src/domain/model";
import { inferLanguage } from "../src/domain/languages";
import { jsonResource } from "../src/providers/json";
import { zipArchive } from "../src/providers/zip";
import { batchInput, newImportInput } from "../src/server/import-http";
let folder: string,
  repository: SqliteProjectRepository,
  service: ProjectService,
  db: DatabaseSync;
let now: string;
const input = {
  id: "project",
  name: "Existing",
  baseLanguage: "en",
  targetLanguages: ["fr", "de"],
};
const file = (
  language: string,
  value: unknown,
  name = `${language}.json`,
): LocaleFile => ({
  name,
  language,
  confirmed: true,
  text: JSON.stringify(value),
});
const value = (project: ProjectDetail, path: string[], language: string) =>
  translationFor(
    project.entries.find(
      (entry) => JSON.stringify(entry.path) === JSON.stringify(path),
    )!,
    language,
  );
const apply = async (
  files: LocaleFile[],
  policy: "keepExisting" | "useImported" = "keepExisting",
) =>
  service.applyImport(
    input.id,
    files,
    policy,
    (await service.get(input.id)).version,
  );
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), "three-locale-history-"));
  const path = join(folder, "db.sqlite");
  repository = new SqliteProjectRepository(path);
  db = new DatabaseSync(path);
  now = "2026-09-01T10:00:00.000Z";
  service = new ProjectService(repository, jsonResource, () => now, zipArchive);
  await service.create(input);
});
afterEach(() => {
  db.close();
  repository.close();
  rmSync(folder, { recursive: true, force: true });
});
it("suggests canonical languages without substituting for explicit confirmation", async () => {
  expect(inferLanguage("messages.en-gb.json")).toBe("en-GB");
  expect(inferLanguage("ar.json")).toBe("ar");
  expect(inferLanguage("messages.json")).toBe("");
  await expect(
    service.previewImport(input.id, [
      { ...file("fr", { a: "A" }), confirmed: false },
    ]),
  ).rejects.toThrow("invalidMappings");
  await expect(
    service.previewImport(input.id, [
      file("en-us", { a: "A" }),
      file("en-US", { a: "A" }),
    ]),
  ).rejects.toThrow("invalidMappings");
  await expect(
    service.previewImport(input.id, [file("bad_tag", { a: "A" })]),
  ).rejects.toThrow("invalidLanguages");
  expect(() =>
    batchInput.parse({
      action: "apply",
      files: [file("fr", { a: "A" })],
      expectedVersion: 1,
    }),
  ).toThrow();
  expect(() =>
    batchInput.parse({
      action: "restore",
      revisionId: 1,
      expectedVersion: 1,
      confirmed: false,
    }),
  ).toThrow();
  expect(() =>
    newImportInput.parse({
      name: "",
      baseLanguage: "en",
      import: { action: "preview", files: [file("en", { a: "A" })] },
    }),
  ).toThrow();
});
it("analyses all files without mutation, preserves structural paths, and reports authoritative-base orphans", async () => {
  const before = await service.get(input.id),
    audit = await service.audit(input.id);
  const files = [
    file("fr", { "a.b": "Littéral", a: { b: "Imbriqué" }, orphan: "Inconnu" }),
    file("en", { "a.b": "Literal", a: { b: "Nested" } }),
    file("ar", { a: { b: "مرحبا" } }),
  ];
  const preview = await service.previewImport(input.id, files);
  expect(preview.summary).toMatchObject({
    files: 3,
    languagesAdded: 1,
    baseAdded: 2,
    translationsAdded: 3,
    conflicts: 0,
    orphans: 1,
  });
  expect(preview.orphans).toEqual([
    { language: "fr", path: ["orphan"], value: "Inconnu" },
  ]);
  expect(await service.get(input.id)).toEqual(before);
  expect(await service.audit(input.id)).toEqual(audit);
  expect(await service.revisions(input.id)).toEqual([]);
  const result = await apply(files);
  expect(result.preview).toEqual(preview);
  expect(result.project.languages).toContain("ar");
  expect(result.project.entries).toHaveLength(2);
  expect(value(result.project, ["a.b"], "fr").value).toBe("Littéral");
  expect(value(result.project, ["a", "b"], "ar")).toMatchObject({
    value: "مرحبا",
    origin: "import",
  });
});
it("creates directly from files, requires a base file, and leaves no project for an invalid batch", async () => {
  const fresh = {
    id: "new",
    name: "Imported",
    baseLanguage: "en-gb",
    targetLanguages: [],
  };
  const files = [
    file("en-GB", { hello: "Hello" }),
    file("fr-FR", { hello: "Bonjour" }),
  ];
  expect((await service.previewNew(fresh, files)).version).toBe(0);
  expect(await repository.get("new")).toBeUndefined();
  await expect(
    service.createImport(fresh, [files[1]], "keepExisting", 0),
  ).rejects.toThrow("baseFileRequired");
  await expect(
    service.createImport(
      fresh,
      [files[0], { ...files[1], text: "{" }],
      "keepExisting",
      0,
    ),
  ).rejects.toThrow("invalidResource");
  expect(await repository.get("new")).toBeUndefined();
  const result = await service.createImport(fresh, files, "keepExisting", 0);
  expect(result.project.languages).toEqual(["en-GB", "fr-FR"]);
  expect(await service.revisions("new")).toHaveLength(1);
  expect(await service.audit("new")).toContainEqual(
    expect.objectContaining({ kind: "project.created" }),
  );
});
it("fills empty translations, distinguishes identical values, and applies both explicit conflict policies", async () => {
  await apply([
    file("en", {
      same: "Same",
      conflict: "Conflict",
      empty: "Empty",
      blank: "Blank",
    }),
    file("fr", { same: "Même", conflict: "Ancien", blank: "Conserver" }),
  ]);
  const files = [
    file("fr", {
      same: "Même",
      conflict: "Nouveau",
      empty: "Rempli",
      blank: "  ",
    }),
  ];
  const preview = await service.previewImport(input.id, files);
  expect(preview.summary).toMatchObject({
    translationsAdded: 1,
    translationsUnchanged: 1,
    conflicts: 1,
    emptySkipped: 1,
  });
  expect(preview.conflicts).toEqual([
    {
      language: "fr",
      path: ["conflict"],
      existing: "Ancien",
      imported: "Nouveau",
    },
  ]);
  const kept = (await apply(files)).project;
  expect(value(kept, ["conflict"], "fr").value).toBe("Ancien");
  expect(value(kept, ["empty"], "fr").value).toBe("Rempli");
  expect(value(kept, ["blank"], "fr").value).toBe("Conserver");
  const replaced = (await apply(files, "useImported")).project;
  expect(value(replaced, ["conflict"], "fr")).toMatchObject({
    value: "Nouveau",
    origin: "import",
  });
});
it("marks existing translations independently when the base changes and retains absent entries", async () => {
  await apply([
    file("en", { a: "A", keep: "Keep" }),
    file("fr", { a: "Un" }),
    file("de", { a: "Ein" }),
  ]);
  const result = await apply(
    [file("en", { a: "New A", new: "New" }), file("fr", { a: "Nouveau" })],
    "useImported",
  );
  expect(result.preview.summary).toMatchObject({
    baseChanged: 1,
    baseAdded: 1,
    reviewMarked: 2,
    conflicts: 1,
  });
  expect(result.project.entries).toHaveLength(3);
  expect(value(result.project, ["a"], "fr").needsReview).toBe(true);
  expect(value(result.project, ["a"], "de").needsReview).toBe(true);
  const id = result.project.entries.find((entry) => entry.path[0] === "a")!.id;
  const saved = await service.translate(input.id, id, "fr", "Nouveau");
  expect(value(saved, ["a"], "fr")).toMatchObject({
    needsReview: false,
    origin: "manual",
  });
  expect(value(saved, ["a"], "de").needsReview).toBe(true);
  expect(await service.audit(input.id)).toContainEqual(
    expect.objectContaining({
      kind: "review.changed",
      previous: false,
      next: true,
      language: "de",
      path: ["a"],
    }),
  );
});
it.each(["malformed", "invalidResource", "path", "placeholder"])(
  "rejects an entire invalid batch (%s) without language, audit or revision changes",
  async (kind) => {
    await apply([
      file("en", { a: "Hello {name}" }),
      file("fr", { a: "Bonjour {name}" }),
    ]);
    const before = await service.get(input.id),
      audit = await service.audit(input.id),
      revisions = await service.revisions(input.id);
    const broken =
      kind === "malformed"
        ? { ...file("de", {}), text: "{" }
        : kind === "invalidResource"
          ? file("de", { a: 42 })
          : kind === "path"
            ? file("en", { a: { nested: "Conflict" } })
            : file("de", { a: "Missing token" });
    const files = [file("ar", { a: "مرحبا {name}" }), broken];
    const preview = await service.previewImport(input.id, files);
    const resourceFailed = kind === "malformed" || kind === "invalidResource";
    expect(preview.summary.invalidResources).toBe(resourceFailed ? 1 : 0);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({
        file: broken.name,
        code: resourceFailed
          ? "invalidResource"
          : kind === "path"
            ? "pathConflict"
            : "placeholders",
      }),
    );
    await expect(apply(files)).rejects.toThrow();
    expect(await service.get(input.id)).toEqual(before);
    expect(await service.audit(input.id)).toEqual(audit);
    expect(await service.revisions(input.id)).toEqual(revisions);
  },
);
it("rolls back data, languages, audit, revisions and pruning on persistence failure", async () => {
  await apply([file("en", { a: "A" })]);
  const before = await service.get(input.id),
    audit = await service.audit(input.id),
    revisions = await service.revisions(input.id);
  db.exec(
    "CREATE TRIGGER fail_checkpoint BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
  );
  await expect(
    apply([file("en", { a: "Changed" }), file("ar", { a: "مرحبا" })]),
  ).rejects.toThrow("injected failure");
  expect(await service.get(input.id)).toEqual(before);
  expect(await service.audit(input.id)).toEqual(audit);
  expect(await service.revisions(input.id)).toEqual(revisions);
  const fresh = {
    id: "failed",
    name: "Failed",
    baseLanguage: "en",
    targetLanguages: [],
  };
  await expect(
    service.createImport(
      fresh,
      [file("en", { a: "A" }), file("fr", { a: "Un" })],
      "keepExisting",
      0,
    ),
  ).rejects.toThrow("injected failure");
  expect(await repository.get("failed")).toBeUndefined();
});
it("rejects stale previews and stale commits across repository connections", async () => {
  const files = [file("en", { a: "A" })];
  const preview = await service.previewImport(input.id, files);
  await service.addLanguage(input.id, "ar");
  await expect(
    service.applyImport(input.id, files, "keepExisting", preview.version),
  ).rejects.toThrow("stalePreview");
  const state = await service.get(input.id);
  const other = new SqliteProjectRepository(join(folder, "db.sqlite"));
  try {
    await service.addLanguage(input.id, "ja");
    await expect(
      other.commit({
        previous: state,
        project: state,
        expectedVersion: state.version,
        events: [],
        checkpoints: [],
        occurredAt: now,
        revisionLimit: 100,
      }),
    ).rejects.toThrow("stalePreview");
  } finally {
    other.close();
  }
  expect((await service.get(input.id)).languages).toContain("ja");
});
it("updates metadata only for meaningful entity changes and preserves manual/import provenance", async () => {
  const created = await service.get(input.id);
  expect(created.createdAt).toBe(now);
  now = "2026-09-02T10:00:00.000Z";
  const imported = (
    await apply([file("en", { a: "A" }), file("fr", { a: "Un" })])
  ).project;
  expect(imported.createdAt).toBe(created.createdAt);
  expect(imported.updatedAt).toBe(now);
  expect(imported.entries[0].createdAt).toBe(now);
  expect(imported.languageMetadata.fr.updatedAt).toBe(now);
  expect(imported.languageMetadata.de.updatedAt).toBe(created.createdAt);
  const original = value(imported, ["a"], "fr");
  now = "2026-09-03T10:00:00.000Z";
  expect(await service.get(input.id)).toEqual(imported);
  const unchanged = (
    await apply([file("en", { a: "A" }), file("fr", { a: "Un" })])
  ).project;
  expect(unchanged.updatedAt).toBe(imported.updatedAt);
  expect(value(unchanged, ["a"], "fr")).toEqual(original);
  const revisions = await service.revisions(input.id);
  const saved = await service.translate(
    input.id,
    imported.entries[0].id,
    "fr",
    "Une",
  );
  expect(value(saved, ["a"], "fr")).toMatchObject({
    createdAt: original.createdAt,
    updatedAt: now,
    origin: "manual",
  });
  expect(await service.revisions(input.id)).toEqual(revisions);
  const audit = await service.audit(input.id);
  now = "2026-09-04T10:00:00.000Z";
  expect(
    await service.translate(input.id, imported.entries[0].id, "fr", "Une"),
  ).toEqual(saved);
  expect(await service.audit(input.id)).toEqual(audit);
  expect(audit).toContainEqual(
    expect.objectContaining({
      kind: "translation.changed",
      language: "fr",
      path: ["a"],
      previous: expect.objectContaining({ value: "Un", origin: "import" }),
      next: expect.objectContaining({ value: "Une", origin: "manual" }),
    }),
  );
});
it("persists ordered structured audit summaries, grouped operations and paginated history", async () => {
  const files = [file("en", { a: "A" }), file("ar", { a: "مرحبا" })];
  const result = await apply(files);
  const audit = await service.audit(input.id);
  expect(audit[0]).toMatchObject({
    kind: "batch.imported",
    projectId: input.id,
    occurredAt: now,
    policy: "keepExisting",
    summary: result.preview.summary,
    files: [
      { name: "en.json", language: "en" },
      { name: "ar.json", language: "ar" },
    ],
  });
  const operation = audit.filter(
    (event) => event.operationId === audit[0].operationId,
  );
  expect(operation.some((event) => event.kind === "language.added")).toBe(true);
  expect(audit.map((event) => event.id)).toEqual(
    audit.map((event) => event.id).sort((a, b) => b - a),
  );
  const id = result.project.entries[0].id;
  for (let i = 0; i < 105; i++)
    await service.translate(input.id, id, "fr", `value ${i}`);
  const first = await service.audit(input.id),
    second = await service.audit(input.id, first.at(-1)!.id);
  expect(first).toHaveLength(100);
  expect(second.length).toBeGreaterThan(0);
  expect(second[0].id).toBeLessThan(first.at(-1)!.id);
  expect(new Set([...first, ...second].map((event) => event.id)).size).toBe(
    first.length + second.length,
  );
  repository.close();
  repository = new SqliteProjectRepository(join(folder, "db.sqlite"));
  expect(await repository.audit(input.id)).toEqual(first);
});
it("restores full checkpoints atomically, preserves history, and permits recovery of the pre-restore state", async () => {
  await apply([file("en", { a: "A" }), file("fr", { a: "Un" })]);
  const original = await service.get(input.id),
    revision = (await service.revisions(input.id))[0];
  await apply([
    file("en", { a: "Changed", b: "B" }),
    file("ar", { a: "مرحبا", b: "باء" }),
  ]);
  const beforeRestore = await service.get(input.id),
    history = await service.audit(input.id);
  now = "2026-09-05T10:00:00.000Z";
  const restored = await service.restore(
    input.id,
    revision.id,
    beforeRestore.version,
  );
  expect(restored.languages).toEqual(original.languages);
  expect(restored.entries.map((entry) => entry.path)).toEqual([["a"]]);
  expect(value(restored, ["a"], "en").value).toBe("A");
  expect(value(restored, ["a"], "fr").needsReview).toBe(false);
  expect(restored.updatedAt).toBe(now);
  expect((await service.audit(input.id)).slice(1)).toEqual(history);
  expect((await service.audit(input.id))[0]).toMatchObject({
    kind: "revision.restored",
    revisionId: revision.id,
  });
  const recovery = (await service.revisions(input.id)).find(
    (item) => item.kind === "beforeRestore",
  )!;
  const recovered = await service.restore(
    input.id,
    recovery.id,
    restored.version,
  );
  expect(recovered.languages).toEqual(beforeRestore.languages);
  expect(value(recovered, ["a"], "en").value).toBe("Changed");
  expect(recovered.entries).toHaveLength(2);
  await expect(
    service.restore(input.id, revision.id, restored.version),
  ).rejects.toThrow("stalePreview");
  await service.create({ ...input, id: "other" });
  await expect(service.restore("other", revision.id, 1)).rejects.toThrow(
    "notFound",
  );
  const before = await service.get(input.id),
    events = await service.audit(input.id),
    revisions = await service.revisions(input.id);
  db.exec(
    "CREATE TRIGGER fail_restore BEFORE INSERT ON audit_events WHEN NEW.kind = 'revision.restored' BEGIN SELECT RAISE(ABORT, 'restore failure'); END;",
  );
  await expect(
    service.restore(input.id, revision.id, before.version),
  ).rejects.toThrow("restore failure");
  expect(await service.get(input.id)).toEqual(before);
  expect(await service.audit(input.id)).toEqual(events);
  expect(await service.revisions(input.id)).toEqual(revisions);
});
it("retains exactly the latest 100 checkpoints per project and does not prune audit", async () => {
  await service.create({ ...input, id: "other" });
  await service.import("other", '{"a":"Other"}');
  const others = await service.revisions("other");
  await apply([file("en", { a: "0" })]);
  const oldest = (await service.revisions(input.id)).at(-1)!;
  for (let i = 1; i <= 51; i++) await apply([file("en", { a: String(i) })]);
  const revisions = await service.revisions(input.id);
  expect(revisions).toHaveLength(100);
  expect(revisions[0].kind).toBe("afterImport");
  expect(await repository.revision(input.id, oldest.id)).toBeUndefined();
  expect(await service.revisions("other")).toEqual(others);
  expect(
    db
      .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE projectId = ?")
      .get(input.id)?.n,
  ).toBeGreaterThan(100);
});
it("exports canonical target filenames as a ZIP and rejects the entire export if any target is incomplete or under review", async () => {
  const fresh = {
    id: "zip",
    name: "Zip",
    baseLanguage: "en",
    targetLanguages: [],
  };
  const source = { "a.b": "Literal", a: { b: "Nested" } };
  const french = { "a.b": "Littéral", a: { b: "Imbriqué" } };
  const arabic = { "a.b": "حرفي", a: { b: "متداخل" } };
  await service.createImport(
    fresh,
    [file("en", source), file("fr-fr", french), file("ar", arabic)],
    "keepExisting",
    0,
  );
  const archive = unzipSync(await service.exportAll("zip"));
  expect(Object.keys(archive).sort()).toEqual(["ar.json", "fr-FR.json"]);
  expect(JSON.parse(strFromU8(archive["ar.json"]))).toEqual(arabic);
  expect(JSON.parse(strFromU8(archive["fr-FR.json"]))).toEqual(french);
  expect(JSON.parse(await service.export("zip", "fr-FR"))).toEqual(french);
  await service.import("zip", JSON.stringify({ ...source, new: "New" }));
  await expect(service.exportAll("zip")).rejects.toThrow("incompleteExport");
});
it("restoration preserves unchanged live metadata while timestamping changed and removed language content", async () => {
  const initial = (
    await apply([
      file("en", { a: "A", b: "B" }),
      file("fr", { a: "Un", b: "Deux" }),
    ])
  ).project;
  const revision = (await service.revisions(input.id))[0];
  now = "2026-09-06T10:00:00.000Z";
  const entry = initial.entries.find((entry) => entry.path[0] === "a")!;
  await service.translate(input.id, entry.id, "fr", "Changed");
  now = "2026-09-07T10:00:00.000Z";
  const live = await service.translate(input.id, entry.id, "fr", "Un");
  now = "2026-09-08T10:00:00.000Z";
  const restored = await service.restore(input.id, revision.id, live.version);
  expect(value(restored, ["b"], "fr")).toEqual(value(live, ["b"], "fr"));
  expect(value(restored, ["a"], "en")).toEqual(value(live, ["a"], "en"));
  expect(value(restored, ["a"], "fr")).toMatchObject({
    origin: "import",
    updatedAt: now,
  });
  const sameRevision = (await service.revisions(input.id))[0];
  const same = await service.restore(
    input.id,
    sameRevision.id,
    restored.version,
  );
  expect(same.entries).toEqual(restored.entries);
  expect(same.languageMetadata).toEqual(restored.languageMetadata);
});
