import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, migrations } from "../src/persistence/migrations";
import { SqliteProjectRepository } from "../src/persistence/sqlite";

let folder: string;
let path: string;
let db: DatabaseSync;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "three-locale-migrations-"));
  path = join(folder, "test.db");
  db = new DatabaseSync(path);
});
afterEach(() => {
  db.close();
  rmSync(folder, { recursive: true, force: true });
});
const version = () => db.prepare("PRAGMA user_version").get()?.user_version;
const seed = () => {
  db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?)").run(
    "project",
    "Existing project",
    "en",
    "fr",
  );
  db.prepare("INSERT INTO entries VALUES (?, ?, ?, ?, ?)").run(
    "project",
    "hello",
    "Hello",
    "Bonjour",
    1,
  );
};

it("creates a usable schema and preserves data when reopened", async () => {
  const repository = new SqliteProjectRepository(path);
  try {
    await repository.create({
      id: "project",
      name: "Test",
      sourceLanguage: "en",
      targetLanguage: "fr",
    });
    await repository.import("project", [{ key: "hello", value: "Hello" }]);
    await repository.saveTranslation("project", "hello", "Bonjour");
  } finally {
    repository.close();
  }
  const reopened = new SqliteProjectRepository(path);
  try {
    expect((await reopened.get("project"))?.entries).toEqual([
      {
        key: "hello",
        source: "Hello",
        translation: "Bonjour",
        needsReview: false,
      },
    ]);
    expect(version()).toBe(1);
    await expect(
      reopened.import("missing", [{ key: "x", value: "X" }]),
    ).rejects.toThrow();
    expect(await reopened.get("missing")).toBeUndefined();
  } finally {
    reopened.close();
  }
});

it("recognises the original inline version-1 schema without recreating tables or losing data", async () => {
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, sourceLanguage TEXT NOT NULL, targetLanguage TEXT NOT NULL);
    CREATE TABLE entries (projectId TEXT NOT NULL REFERENCES projects(id), key TEXT NOT NULL, source TEXT NOT NULL, translation TEXT NOT NULL DEFAULT '', needsReview INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (projectId, key));
    PRAGMA user_version = 1;
  `);
  seed();
  const repository = new SqliteProjectRepository(path);
  try {
    expect(await repository.get("project")).toEqual({
      id: "project",
      name: "Existing project",
      sourceLanguage: "en",
      targetLanguage: "fr",
      entries: [
        {
          key: "hello",
          source: "Hello",
          translation: "Bonjour",
          needsReview: true,
        },
      ],
    });
  } finally {
    repository.close();
  }
});

it("applies only pending migrations in order and does not rerun them", () => {
  migrate(db);
  seed();
  const future = [
    ...migrations,
    { version: 2, sql: "CREATE TABLE migration_probe (value TEXT NOT NULL);" },
    { version: 3, sql: "INSERT INTO migration_probe VALUES ('applied');" },
  ];
  migrate(db, future);
  migrate(db, future);
  expect(version()).toBe(3);
  expect(db.prepare("SELECT value FROM migration_probe").all()).toEqual([
    { value: "applied" },
  ]);
  expect(db.prepare("SELECT translation FROM entries").get()?.translation).toBe(
    "Bonjour",
  );
});

it("rolls back pending schema changes and the version on failure, allowing a retry", () => {
  migrate(db);
  seed();
  const second = {
    version: 2,
    sql: "CREATE TABLE migration_probe (value TEXT);",
  };
  expect(() =>
    migrate(db, [
      ...migrations,
      second,
      { version: 3, sql: "INSERT INTO nonexistent VALUES (1);" },
    ]),
  ).toThrow();
  expect(version()).toBe(1);
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'migration_probe'")
      .get(),
  ).toBeUndefined();
  expect(db.prepare("SELECT translation FROM entries").get()?.translation).toBe(
    "Bonjour",
  );
  migrate(db, [...migrations, second]);
  expect(version()).toBe(2);
});

it("refuses newer schemas and invalid migration sequences without changing the database", () => {
  migrate(db);
  seed();
  expect(() =>
    migrate(db, [...migrations, { version: 3, sql: "DROP TABLE entries;" }]),
  ).toThrow("consecutive");
  expect(version()).toBe(1);
  db.exec("PRAGMA user_version = 2");
  expect(() => migrate(db)).toThrow("newer");
  expect(version()).toBe(2);
  expect(db.prepare("SELECT translation FROM entries").get()?.translation).toBe(
    "Bonjour",
  );
});
