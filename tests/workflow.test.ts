import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteProjectRepository } from "../src/persistence/sqlite";
import { ProjectService } from "../src/application/projects";
import { flatJson } from "../src/providers/flat-json";
import { handle, json, projectInput, readJson } from "../src/server/http";
let folder: string;
let repository: SqliteProjectRepository;
let service: ProjectService;
const project = {
  id: "test-project",
  name: "Translator's app",
  sourceLanguage: "en",
  targetLanguage: "fr",
};
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "three-locale-"));
  repository = new SqliteProjectRepository(join(folder, "test.db"));
  service = new ProjectService(repository, flatJson);
  service.create(project);
});
afterEach(() => {
  repository.close();
  rmSync(folder, { recursive: true, force: true });
});
describe("localisation workflow", () => {
  it("persists projects and translations across database reopen and exports valid JSON", () => {
    service.import(
      project.id,
      '{"hello":"Hello {{name}}","quote":"A \\"quote\\""}',
    );
    service.translate(project.id, "hello", "Bonjour {{name}}");
    service.translate(project.id, "quote", "Une citation");
    repository.close();
    repository = new SqliteProjectRepository(join(folder, "test.db"));
    service = new ProjectService(repository, flatJson);
    expect(service.list()).toEqual([project]);
    expect(JSON.parse(service.export(project.id))).toEqual({
      hello: "Bonjour {{name}}",
      quote: "Une citation",
    });
  });
  it("retains absent keys and translations on reimport and requires review when source changes", () => {
    service.import(project.id, '{"hello":"Hello","bye":"Goodbye"}');
    service.translate(project.id, "hello", "Bonjour");
    service.translate(project.id, "bye", "Au revoir");
    service.import(project.id, '{"hello":"Hello again"}');
    expect(service.get(project.id).entries).toEqual([
      {
        key: "bye",
        source: "Goodbye",
        translation: "Au revoir",
        needsReview: false,
      },
      {
        key: "hello",
        source: "Hello again",
        translation: "Bonjour",
        needsReview: true,
      },
    ]);
    expect(() => service.export(project.id)).toThrow("incompleteExport");
    service.translate(project.id, "hello", "Rebonjour");
    expect(JSON.parse(service.export(project.id)).hello).toBe("Rebonjour");
  });
  it("blocks missing translations and mismatched placeholders", () => {
    service.import(project.id, '{"hello":"Hello {name}"}');
    expect(() => service.export(project.id)).toThrow("incompleteExport");
    expect(() => service.translate(project.id, "hello", "Bonjour")).toThrow(
      "placeholders",
    );
    service.translate(project.id, "hello", "  ");
    expect(() => service.export(project.id)).toThrow("incompleteExport");
    expect(() => service.translate(project.id, "missing", "x")).toThrow(
      "notFound",
    );
  });
  it("rejects duplicate keys and invalid values without partially applying an import", () => {
    service.import(project.id, '{"old":"Keep me"}');
    for (const invalid of [
      '{"a":"x","a":"y"}',
      '{"a":"x","\\u0061":"y"}',
      '{"good":"x","bad":5}',
      '{"a":{}}',
      "[]",
      "{}",
      '{"a":"x",}',
      '{/*comment*/"a":"x"}',
    ])
      expect(() => service.import(project.id, invalid)).toThrow(
        "invalidResource",
      );
    expect(service.get(project.id).entries.map((entry) => entry.key)).toEqual([
      "old",
    ]);
  });
  it("preserves literal keys, Unicode, whitespace, and escaped values", () => {
    const input =
      '{"__proto__":"مرحبا","a.b":"Line 1\\nLine 2","constructor":"  spaces  "}';
    expect(JSON.parse(flatJson.serialize(flatJson.parse(input)))).toEqual(
      JSON.parse(input),
    );
  });
  it("does not interpret project names or resource keys as SQL", () => {
    service.import(project.id, '{"x\u0027; DROP TABLE projects;--":"Safe"}');
    expect(service.list()).toEqual([project]);
  });
  it("rejects equivalent source and target languages after canonicalisation", () => {
    expect(() =>
      service.create({
        id: "another",
        ...projectInput.parse({
          name: "Test",
          sourceLanguage: "en-us",
          targetLanguage: "en-US",
        }),
      }),
    ).toThrow("sameLanguage");
    expect(() =>
      projectInput.parse({
        name: " ",
        sourceLanguage: "en",
        targetLanguage: "bad_tag",
      }),
    ).toThrow();
  });
});
it("enforces the resource size limit in bytes for Unicode content", () => {
  expect(() =>
    flatJson.parse(JSON.stringify({ text: "界".repeat(340000) })),
  ).toThrow("tooLarge");
});
describe("HTTP boundary", () => {
  it("returns a safe validation response for malformed JSON", async () => {
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
