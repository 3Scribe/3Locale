import { DatabaseSync } from "node:sqlite";
import type {
  Entry,
  Project,
  ProjectRepository,
  SourceEntry,
} from "../domain/model";

export class SqliteProjectRepository implements ProjectRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    );
    const version = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (version.user_version < 1) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, sourceLanguage TEXT NOT NULL, targetLanguage TEXT NOT NULL);
        CREATE TABLE entries (projectId TEXT NOT NULL REFERENCES projects(id), key TEXT NOT NULL, source TEXT NOT NULL, translation TEXT NOT NULL DEFAULT '', needsReview INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (projectId, key));
        PRAGMA user_version = 1;
        COMMIT;`);
    }
  }
  list(): Project[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY rowid DESC")
      .all() as unknown as Project[];
  }
  create(project: Project) {
    this.db
      .prepare(
        "INSERT INTO projects (id, name, sourceLanguage, targetLanguage) VALUES (?, ?, ?, ?)",
      )
      .run(
        project.id,
        project.name,
        project.sourceLanguage,
        project.targetLanguage,
      );
  }
  get(id: string) {
    const project = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as unknown as Project | undefined;
    if (!project) return undefined;
    const entries = this.db
      .prepare(
        "SELECT key, source, translation, needsReview FROM entries WHERE projectId = ? ORDER BY key",
      )
      .all(id) as unknown as Entry[];
    return {
      ...project,
      entries: entries.map((entry) => ({
        ...entry,
        needsReview: Boolean(entry.needsReview),
      })),
    };
  }
  import(id: string, entries: SourceEntry[]) {
    const statement = this.db
      .prepare(`INSERT INTO entries (projectId, key, source) VALUES (?, ?, ?)
      ON CONFLICT(projectId, key) DO UPDATE SET
      needsReview = CASE WHEN entries.source <> excluded.source AND entries.translation <> '' THEN 1 ELSE entries.needsReview END,
      source = excluded.source`);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const entry of entries) statement.run(id, entry.key, entry.value);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  saveTranslation(id: string, key: string, value: string) {
    return (
      this.db
        .prepare(
          "UPDATE entries SET translation = ?, needsReview = 0 WHERE projectId = ? AND key = ?",
        )
        .run(value, id, key).changes > 0
    );
  }
  close() {
    this.db.close();
  }
}
