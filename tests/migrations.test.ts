import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, migrations } from "../src/persistence/migrations";
import { SqliteProjectRepository } from "../src/persistence/sqlite";
import { ProjectService } from "../src/application/projects";
import { jsonResource } from "../src/providers/json";
import { translationFor } from "../src/domain/model";
let folder: string;
let path: string;
let db: DatabaseSync;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "three-locale-migrations-"));
  path = join(folder, "test.db");
  db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
});
afterEach(() => {
  db.close();
  rmSync(folder, { recursive: true, force: true });
});
const version = () => db.prepare("PRAGMA user_version").get()?.user_version;
const seed = () => {
  db.exec("BEGIN");
  db.prepare(
    "INSERT INTO projects (id,name,baseLanguage) VALUES (?, ?, ?)",
  ).run("project", "Existing project", "en");
  db.prepare(
    "INSERT INTO project_languages (projectId,language) VALUES (?, ?)",
  ).run("project", "en");
  db.prepare(
    "INSERT INTO project_languages (projectId,language) VALUES (?, ?)",
  ).run("project", "fr");
  db.prepare(
    "INSERT INTO resource_entries (id, projectId, path, createdAt, updatedAt) VALUES (1, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
  ).run("project", '["hello"]');
  db.prepare(
    "INSERT INTO translations (projectId,entryId,language,value,needsReview,createdAt,updatedAt) VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
  ).run("project", 1, "en", "Hello", 0);
  db.prepare(
    "INSERT INTO translations (projectId,entryId,language,value,needsReview,createdAt,updatedAt) VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
  ).run("project", 1, "fr", "Bonjour", 1);
  db.exec("COMMIT");
};
it("creates and reopens the evolved schema with language membership constraints", async () => {
  migrate(db);
  seed();
  const repository = new SqliteProjectRepository(path);
  try {
    expect((await repository.get("project"))?.languages).toEqual(["en", "fr"]);
    expect(version()).toBe(3);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const service = new ProjectService(repository, jsonResource);
    await expect(service.import("missing", '{"x":"X"}')).rejects.toThrow(
      "notFound",
    );
    await expect(service.translate("project", 1, "ja", "X")).rejects.toThrow(
      "invalidLanguages",
    );
    expect(() =>
      db
        .prepare(
          "INSERT INTO translations (projectId,entryId,language,value,needsReview,createdAt,updatedAt) VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .run("project", 1, "ja", "X", 0),
    ).toThrow();
    expect(() =>
      db
        .prepare("UPDATE projects SET baseLanguage = ? WHERE id = ?")
        .run("ja", "project"),
    ).toThrow();
  } finally {
    repository.close();
  }
});
it("migrates original version-1 projects, literal keys, values, languages and review state without loss", async () => {
  migrate(db, migrations.slice(0, 1));
  const insertProject = db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?)");
  insertProject.run("project", "Existing project", "en", "fr");
  insertProject.run("other", "مشروع", "ar", "de");
  const insert = db.prepare("INSERT INTO entries VALUES (?, ?, ?, ?, ?)");
  insert.run("project", "account.name", "Name", "Nom", 1);
  insert.run("project", "welcome", "Hello {{name}}", "Bonjour {{name}}", 0);
  insert.run("project", "missing", "", "", 0);
  insert.run("other", "__proto__", "مرحبا", "Hallo", 1);
  insert.run("other", 'quote"\nkey', "  base  ", "  value  ", 0);
  const before = db
    .prepare(
      "SELECT e.*, p.sourceLanguage, p.targetLanguage FROM entries e JOIN projects p ON p.id = e.projectId",
    )
    .all() as {
    projectId: string;
    key: string;
    source: string;
    translation: string;
    needsReview: number;
    sourceLanguage: string;
    targetLanguage: string;
  }[];
  const repository = new SqliteProjectRepository(path);
  try {
    expect(await repository.list()).toMatchObject([
      {
        id: "other",
        name: "مشروع",
        baseLanguage: "ar",
        languages: ["ar", "de"],
      },
      {
        id: "project",
        name: "Existing project",
        baseLanguage: "en",
        languages: ["en", "fr"],
      },
    ]);
    for (const old of before) {
      const detail = (await repository.get(old.projectId))!;
      const entry = detail.entries.find(
        (entry) => JSON.stringify(entry.path) === JSON.stringify([old.key]),
      )!;
      expect(translationFor(entry, old.sourceLanguage)).toMatchObject({
        language: old.sourceLanguage,
        value: old.source,
        needsReview: false,
      });
      expect(translationFor(entry, old.targetLanguage)).toMatchObject({
        language: old.targetLanguage,
        value: old.translation,
        needsReview: Boolean(old.needsReview),
      });
    }
    expect(
      db.prepare("SELECT COUNT(*) AS total FROM resource_entries").get()?.total,
    ).toBe(5);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const service = new ProjectService(repository, jsonResource);
    await service.import("project", '{"account":{"name":"Nested"}}');
    expect(
      (await service.get("project")).entries.map((entry) => entry.path),
    ).toContainEqual(["account.name"]);
    expect(
      (await service.get("project")).entries.map((entry) => entry.path),
    ).toContainEqual(["account", "name"]);
  } finally {
    repository.close();
  }
  migrate(db);
  expect(
    db.prepare("SELECT COUNT(*) AS total FROM projects").get()?.total,
  ).toBe(2);
});
it("applies pending migrations in order exactly once", () => {
  migrate(db);
  seed();
  const future = [
    ...migrations,
    { version: 4, sql: "CREATE TABLE migration_probe (value TEXT NOT NULL);" },
    { version: 5, sql: "INSERT INTO migration_probe VALUES ('applied');" },
  ];
  migrate(db, future);
  migrate(db, future);
  expect(version()).toBe(5);
  expect(db.prepare("SELECT value FROM migration_probe").all()).toEqual([
    { value: "applied" },
  ]);
  expect(
    db.prepare("SELECT value FROM translations WHERE language = 'fr'").get()
      ?.value,
  ).toBe("Bonjour");
});
it("rolls back schema changes and version on failure and allows a retry", () => {
  migrate(db);
  seed();
  const next = {
    version: 4,
    sql: "CREATE TABLE migration_probe (value TEXT);",
  };
  expect(() =>
    migrate(db, [
      ...migrations,
      next,
      { version: 5, sql: "INSERT INTO nonexistent VALUES (1);" },
    ]),
  ).toThrow();
  expect(version()).toBe(3);
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'migration_probe'")
      .get(),
  ).toBeUndefined();
  expect(
    db.prepare("SELECT value FROM translations WHERE language = 'fr'").get()
      ?.value,
  ).toBe("Bonjour");
  migrate(db, [...migrations, next]);
  expect(version()).toBe(4);
});
it("rolls back the version-1 conversion if a later migration fails", () => {
  migrate(db, migrations.slice(0, 1));
  db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?)").run(
    "old",
    "Old",
    "en",
    "fr",
  );
  db.prepare("INSERT INTO entries VALUES (?, ?, ?, ?, ?)").run(
    "old",
    "a",
    "A",
    "Un",
    1,
  );
  expect(() =>
    migrate(db, [...migrations, { version: 4, sql: "INVALID SQL;" }]),
  ).toThrow();
  expect(version()).toBe(1);
  expect(
    db.prepare("SELECT translation, needsReview FROM entries").get(),
  ).toEqual({ translation: "Un", needsReview: 1 });
  migrate(db);
  expect(version()).toBe(3);
});
it("refuses invalid migration sequences and newer schemas without changing data", () => {
  migrate(db);
  seed();
  expect(() =>
    migrate(db, [
      ...migrations,
      { version: 5, sql: "DROP TABLE translations;" },
    ]),
  ).toThrow("consecutive");
  db.exec("PRAGMA user_version = 4");
  expect(() => migrate(db)).toThrow("newer");
  expect(version()).toBe(4);
  expect(
    db.prepare("SELECT value FROM translations WHERE language = 'fr'").get()
      ?.value,
  ).toBe("Bonjour");
});

it("migrates a populated Milestone 2 database with stable metadata and all localisation state", async () => {
  migrate(db, migrations.slice(0, 2));
  db.exec("BEGIN");
  db.prepare("INSERT INTO projects VALUES (?,?,?)").run(
    "m2",
    "Migrated",
    "en-GB",
  );
  for (const language of ["en-GB", "fr", "ar"])
    db.prepare("INSERT INTO project_languages VALUES (?,?)").run(
      "m2",
      language,
    );
  for (const [id, path] of [
    [11, ["a.b"]],
    [12, ["a", "b"]],
  ] as const) {
    db.prepare(
      "INSERT INTO resource_entries (id,projectId,path) VALUES (?,?,?)",
    ).run(id, "m2", JSON.stringify(path));
    for (const [language, value, review] of [
      ["en-GB", "Hello {name}", 0],
      ["fr", "Bonjour {name}", 1],
      ["ar", "مرحبا {name}", 0],
    ] as const)
      db.prepare("INSERT INTO translations VALUES (?,?,?,?,?)").run(
        "m2",
        id,
        language,
        value,
        review,
      );
  }
  db.exec("COMMIT");
  const repository = new SqliteProjectRepository(path);
  try {
    const detail = (await repository.get("m2"))!;
    expect(detail.languages).toEqual(["en-GB", "fr", "ar"]);
    expect(detail.baseLanguage).toBe("en-GB");
    expect(detail.entries.map((entry) => entry.id).sort()).toEqual([11, 12]);
    expect(
      new Set(detail.entries.map((entry) => JSON.stringify(entry.path))),
    ).toEqual(new Set(['["a.b"]', '["a","b"]']));
    expect(detail.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(detail.updatedAt).toBe(detail.createdAt);
    for (const entry of detail.entries) {
      expect(entry.createdAt).toBe(detail.createdAt);
      expect(entry.updatedAt).toBe(detail.createdAt);
      expect(translationFor(entry, "fr")).toMatchObject({
        value: "Bonjour {name}",
        needsReview: true,
        origin: "manual",
        createdAt: detail.createdAt,
        updatedAt: detail.createdAt,
      });
      expect(translationFor(entry, "en-GB").origin).toBe("import");
      expect(translationFor(entry, "ar").value).toBe("مرحبا {name}");
    }
    expect(detail.languageMetadata.ar.createdAt).toBe(detail.createdAt);
    expect(await repository.audit("m2")).toEqual([]);
    expect(await repository.revisions("m2")).toEqual([]);
    migrate(db);
    expect(await repository.get("m2")).toEqual(detail);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    repository.close();
  }
});
