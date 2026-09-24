import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteProjectRepository } from "../src/persistence/sqlite";
import { ProjectService } from "../src/application/projects";
import { jsonResource } from "../src/providers/json";
import {
  translationFor,
  languageProgress,
  type ProjectRepository,
} from "../src/domain/model";
import { handle, json, projectInput, readJson } from "../src/server/http";
let folder: string;
let repository: SqliteProjectRepository;
let service: ProjectService;
const project = {
  id: "test-project",
  name: "Translator's app",
  baseLanguage: "en",
  targetLanguages: ["fr", "de"],
};
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), "three-locale-"));
  repository = new SqliteProjectRepository(join(folder, "test.db"));
  service = new ProjectService(repository, jsonResource);
  await service.create(project);
});
afterEach(() => {
  repository.close();
  rmSync(folder, { recursive: true, force: true });
});
async function entryId(path: string[]) {
  return (await service.get(project.id)).entries.find(
    (entry) => JSON.stringify(entry.path) === JSON.stringify(path),
  )!.id;
}

describe("project languages", () => {
  it("persists multiple languages and independent translations across reopen", async () => {
    await service.import(
      project.id,
      '{"hello":"Hello {{name}}","quote":"A \\"quote\\""}',
    );
    const hello = await entryId(["hello"]);
    const quote = await entryId(["quote"]);
    await service.translate(project.id, hello, "fr", "Bonjour {{name}}");
    await service.translate(project.id, quote, "fr", "Une citation");
    await service.translate(project.id, hello, "de", "Hallo {{name}}");
    repository.close();
    repository = new SqliteProjectRepository(join(folder, "test.db"));
    service = new ProjectService(repository, jsonResource);
    expect((await service.list())[0]).toEqual({
      id: project.id,
      name: project.name,
      baseLanguage: "en",
      languages: ["en", "fr", "de"],
    });
    expect(JSON.parse(await service.export(project.id, "fr"))).toEqual({
      hello: "Bonjour {{name}}",
      quote: "Une citation",
    });
    expect(languageProgress(await service.get(project.id), "fr")).toEqual({
      total: 2,
      translated: 2,
    });
    expect(languageProgress(await service.get(project.id), "de")).toEqual({
      total: 2,
      translated: 1,
    });
    await expect(service.export(project.id, "de")).rejects.toThrow(
      "incompleteExport",
    );
  });
  it("adds a language after import without changing existing values or progress", async () => {
    await service.import(project.id, '{"hello":"Hello"}');
    const id = await entryId(["hello"]);
    await service.translate(project.id, id, "fr", "Bonjour");
    const updated = await service.addLanguage(project.id, "ar");
    expect(updated.languages).toEqual(["en", "fr", "de", "ar"]);
    expect(languageProgress(updated, "ar")).toEqual({
      total: 1,
      translated: 0,
    });
    await service.translate(project.id, id, "ar", "مرحبا");
    expect(JSON.parse(await service.export(project.id, "ar"))).toEqual({
      hello: "مرحبا",
    });
    expect(JSON.parse(await service.export(project.id, "fr"))).toEqual({
      hello: "Bonjour",
    });
  });
  it("retains absent keys, marks each existing translation for review, and clears review independently", async () => {
    await service.import(project.id, '{"hello":"Hello","bye":"Goodbye"}');
    const hello = await entryId(["hello"]);
    const bye = await entryId(["bye"]);
    for (const language of ["fr", "de"]) {
      await service.translate(project.id, hello, language, `${language} hello`);
      await service.translate(project.id, bye, language, `${language} bye`);
    }
    await service.addLanguage(project.id, "ar");
    await service.import(project.id, '{"hello":"Hello again"}');
    const detail = await service.get(project.id);
    expect(detail.entries).toHaveLength(2);
    const entry = detail.entries.find((entry) => entry.id === hello)!;
    expect(translationFor(entry, "en")).toEqual({
      language: "en",
      value: "Hello again",
      needsReview: false,
    });
    for (const language of ["fr", "de"])
      expect(translationFor(entry, language)).toEqual({
        language,
        value: `${language} hello`,
        needsReview: true,
      });
    expect(translationFor(entry, "ar").needsReview).toBe(false);
    expect(
      translationFor(
        detail.entries.find((entry) => entry.id === bye)!,
        "de",
      ).needsReview,
    ).toBe(false);
    await expect(service.export(project.id, "fr")).rejects.toThrow(
      "incompleteExport",
    );
    await service.translate(project.id, hello, "fr", "Rebonjour");
    await service.import(project.id, '{"hello":"Hello again"}');
    expect(JSON.parse(await service.export(project.id, "fr")).hello).toBe(
      "Rebonjour",
    );
    await expect(service.export(project.id, "de")).rejects.toThrow(
      "incompleteExport",
    );
  });
  it("enforces placeholders and completeness independently for each language", async () => {
    await service.import(project.id, '{"hello":"Hello {name} {{count}}"}');
    const id = await entryId(["hello"]);
    await service.translate(project.id, id, "fr", "Bonjour {name} {{count}}");
    await expect(
      service.translate(project.id, id, "de", "Hallo {name}"),
    ).rejects.toThrow("placeholders");
    await service.translate(project.id, id, "de", "  ");
    await expect(service.export(project.id, "de")).rejects.toThrow(
      "incompleteExport",
    );
    expect(JSON.parse(await service.export(project.id, "fr")).hello).toBe(
      "Bonjour {name} {{count}}",
    );
  });
  it("rejects duplicate/canonical-equivalent languages and invalid membership", async () => {
    await expect(
      service.create({
        id: "another",
        ...projectInput.parse({
          name: "Test",
          baseLanguage: "en-us",
          targetLanguages: ["en-US"],
        }),
      }),
    ).rejects.toThrow("invalidLanguages");
    await expect(
      service.create({
        ...project,
        id: "another",
        targetLanguages: ["fr", "fr"],
      }),
    ).rejects.toThrow("invalidLanguages");
    await expect(
      service.create({ ...project, id: "another", targetLanguages: [] }),
    ).rejects.toThrow("invalidLanguages");
    await expect(service.addLanguage(project.id, "en")).rejects.toThrow(
      "invalidLanguages",
    );
    await expect(service.addLanguage(project.id, "fr")).rejects.toThrow(
      "invalidLanguages",
    );
    await service.import(project.id, '{"a":"A"}');
    const id = await entryId(["a"]);
    for (const language of ["en", "ja"]) {
      await expect(
        service.translate(project.id, id, language, "X"),
      ).rejects.toThrow("invalidLanguages");
      await expect(service.export(project.id, language)).rejects.toThrow(
        "invalidLanguages",
      );
    }
    await expect(
      service.translate(project.id, 999999, "fr", "X"),
    ).rejects.toThrow("notFound");
    expect(() =>
      projectInput.parse({
        name: "Test",
        baseLanguage: "bad_tag",
        targetLanguages: ["fr"],
      }),
    ).toThrow();
  });
  it("does not interpret project names or resource paths as SQL", async () => {
    await service.import(
      project.id,
      '{"x\u0027; DROP TABLE projects;--":"Safe"}',
    );
    expect((await service.list())[0].name).toBe(project.name);
  });
});

describe("nested resources", () => {
  it("round-trips nested Unicode, dotted keys, escaped keys, and prototype property names independently", async () => {
    const input = {
      "account.name": "Literal",
      account: { name: "Nested", "a.b": "Other" },
      العربية: { عنوان: "مرحبا" },
      constructor: { prototype: "Safe" },
      ["__proto__"]: { polluted: "Still safe" },
      "line\nkey": "Line 1\nLine 2",
    };
    const parsed = jsonResource.parse(JSON.stringify(input));
    expect(JSON.parse(jsonResource.serialize(parsed))).toEqual(input);
    await service.import(project.id, JSON.stringify(input));
    const detail = await service.get(project.id);
    expect(await entryId(["account.name"])).not.toBe(
      await entryId(["account", "name"]),
    );
    for (const entry of detail.entries)
      await service.translate(
        project.id,
        entry.id,
        "fr",
        translationFor(entry, "en").value,
      );
    expect(JSON.parse(await service.export(project.id, "fr"))).toEqual(input);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
  it.each([
    '{"a":{"x":"A","x":"B"}}',
    '{"a":{"x":"A","\\u0078":"B"}}',
    '{"new":"valid","a":{"b":5}}',
    '{"a":[]}',
    '{"a":null}',
    '{"a":true}',
    '{"a":{}}',
    "[]",
    "{}",
    '{"a":"x",}',
    '{/*comment*/"a":"x"}',
    '{"a":{"b":"x"}',
  ])(
    "rejects malformed or unsupported resources atomically: %s",
    async (input) => {
      await service.import(project.id, '{"old":"Keep me"}');
      const before = await service.get(project.id);
      await expect(service.import(project.id, input)).rejects.toThrow(
        "invalidResource",
      );
      expect(await service.get(project.id)).toEqual(before);
    },
  );
  it.each([
    ['{"a":"Old"}', '{"new":"New","a":{"b":"Nested"}}'],
    ['{"a":{"b":"Old"}}', '{"new":"New","a":"Flat"}'],
  ])(
    "rejects retained string/object conflicts transactionally",
    async (original, incoming) => {
      await service.import(project.id, original);
      const before = await service.get(project.id);
      await expect(service.import(project.id, incoming)).rejects.toThrow(
        "pathConflict",
      );
      expect(await service.get(project.id)).toEqual(before);
    },
  );
  it("enforces byte, path-depth, key, leaf-count, and value limits while accepting the maximum depth", () => {
    const nested = (depth: number) =>
      '{"a":'.repeat(depth) + '"x"' + "}".repeat(depth);
    expect(jsonResource.parse(nested(32))[0].path).toHaveLength(32);
    expect(() => jsonResource.parse(nested(33))).toThrow("invalidResource");
    expect(() => jsonResource.parse(nested(20000))).toThrow("invalidResource");
    expect(() =>
      jsonResource.parse(JSON.stringify({ text: "界".repeat(340000) })),
    ).toThrow("tooLarge");
    expect(() =>
      jsonResource.parse(JSON.stringify({ ["x".repeat(501)]: "x" })),
    ).toThrow("invalidResource");
    expect(() =>
      jsonResource.parse(JSON.stringify({ a: "x".repeat(20001) })),
    ).toThrow("invalidResource");
    expect(() =>
      jsonResource.parse(
        JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 5001 }, (_, i) => [String(i), "x"]),
          ),
        ),
      ),
    ).toThrow("invalidResource");
  });
});

it("waits for deferred persistence before returning results", async () => {
  const later = async <T>(operation: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return operation();
  };
  const deferred: ProjectRepository = {
    list: () => later(() => repository.list()),
    get: (id) => later(() => repository.get(id)),
    create: (value) => later(() => repository.create(value)),
    addLanguage: (id, language) =>
      later(() => repository.addLanguage(id, language)),
    import: (id, entries) => later(() => repository.import(id, entries)),
    saveTranslation: (id, entryId, language, value) =>
      later(() => repository.saveTranslation(id, entryId, language, value)),
  };
  const asyncService = new ProjectService(deferred, jsonResource);
  const created = await asyncService.create({ ...project, id: "deferred" });
  expect(created.entries).toEqual([]);
  expect(
    (await asyncService.list()).some((project) => project.id === "deferred"),
  ).toBe(true);
  expect(
    (await asyncService.addLanguage(created.id, "ar")).languages,
  ).toContain("ar");
  const imported = await asyncService.import(
    created.id,
    '{"a":{"hello":"Hello"}}',
  );
  expect(
    (
      await asyncService.translate(
        created.id,
        imported.entries[0].id,
        "fr",
        "Bonjour",
      )
    ).entries[0].translations,
  ).toContainEqual({ language: "fr", value: "Bonjour", needsReview: false });
  expect(JSON.parse(await asyncService.export(created.id, "fr"))).toEqual({
    a: { hello: "Bonjour" },
  });
  await expect(asyncService.get("missing")).rejects.toThrow("notFound");
  await expect(
    asyncService.create({ ...project, id: "deferred" }),
  ).rejects.toThrow();
});

describe("HTTP boundary", () => {
  it("returns safe validation errors for malformed JSON", async () => {
    const response = await handle(async () =>
      json(
        await readJson(
          new Request("http://localhost/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          }),
        ),
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalidRequest" });
  });
  it("rejects cross-origin mutations and oversized bodies", async () => {
    for (const [headers, body, status] of [
      [
        { "Content-Type": "application/json", Origin: "https://other.example" },
        "{}",
        403,
      ],
      [{ "Content-Type": "application/json" }, "x".repeat(2_000_001), 413],
    ] as const) {
      const response = await handle(async () =>
        json(
          await readJson(
            new Request("http://localhost/api/projects", {
              method: "POST",
              headers,
              body,
            }),
          ),
        ),
      );
      expect(response.status).toBe(status);
    }
  });
});
