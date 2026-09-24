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
  db.prepare("INSERT INTO projects VALUES (?, ?, ?)").run(
    "project",
    "Existing project",
    "en",
  );
  db.prepare("INSERT INTO project_languages VALUES (?, ?)").run(
    "project",
    "en",
  );
  db.prepare("INSERT INTO project_languages VALUES (?, ?)").run(
    "project",
    "fr",
  );
  db.prepare(
    "INSERT INTO resource_entries (projectId, path) VALUES (?, ?)",
  ).run("project", '["hello"]');
  db.prepare("INSERT INTO translations VALUES (?, ?, ?, ?, ?)").run(
    "project",
    1,
    "en",
    "Hello",
    0,
  );
  db.prepare("INSERT INTO translations VALUES (?, ?, ?, ?, ?)").run(
    "project",
    1,
    "fr",
    "Bonjour",
    1,
  );
  db.exec("COMMIT");
};
it("creates and reopens the evolved schema with language membership constraints", async () => {
  migrate(db);
  seed();
  const repository = new SqliteProjectRepository(path);
  try {
    expect((await repository.get("project"))?.languages).toEqual(["en", "fr"]);
    expect(version()).toBe(2);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    await expect(
      repository.import("missing", [{ path: ["x"], value: "X" }]),
    ).rejects.toThrow();
    expect(await repository.saveTranslation("project", 1, "ja", "X")).toBe(
      false,
    );
    expect(() =>
      db
        .prepare("INSERT INTO translations VALUES (?, ?, ?, ?, ?)")
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
    expect(await repository.list()).toEqual([
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
      expect(translationFor(entry, old.sourceLanguage)).toEqual({
        language: old.sourceLanguage,
        value: old.source,
        needsReview: false,
      });
      expect(translationFor(entry, old.targetLanguage)).toEqual({
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
    { version: 3, sql: "CREATE TABLE migration_probe (value TEXT NOT NULL);" },
    { version: 4, sql: "INSERT INTO migration_probe VALUES ('applied');" },
  ];
  migrate(db, future);
  migrate(db, future);
  expect(version()).toBe(4);
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
    version: 3,
    sql: "CREATE TABLE migration_probe (value TEXT);",
  };
  expect(() =>
    migrate(db, [
      ...migrations,
      next,
      { version: 4, sql: "INSERT INTO nonexistent VALUES (1);" },
    ]),
  ).toThrow();
  expect(version()).toBe(2);
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
  expect(version()).toBe(3);
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
    migrate(db, [...migrations, { version: 3, sql: "INVALID SQL;" }]),
  ).toThrow();
  expect(version()).toBe(1);
  expect(
    db.prepare("SELECT translation, needsReview FROM entries").get(),
  ).toEqual({ translation: "Un", needsReview: 1 });
  migrate(db);
  expect(version()).toBe(2);
});
it("refuses invalid migration sequences and newer schemas without changing data", () => {
  migrate(db);
  seed();
  expect(() =>
    migrate(db, [
      ...migrations,
      { version: 4, sql: "DROP TABLE translations;" },
    ]),
  ).toThrow("consecutive");
  db.exec("PRAGMA user_version = 3");
  expect(() => migrate(db)).toThrow("newer");
  expect(version()).toBe(3);
  expect(
    db.prepare("SELECT value FROM translations WHERE language = 'fr'").get()
      ?.value,
  ).toBe("Bonjour");
});
