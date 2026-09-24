import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrations";
import {
  AppError,
  assertCompatiblePaths,
  type Entry,
  type Project,
  type ProjectRepository,
  type ResourceEntry,
  type Translation,
} from "../domain/model";

export class SqliteProjectRepository implements ProjectRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
      );
      migrate(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private languages(id: string): string[] {
    return (
      this.db
        .prepare(
          "SELECT language FROM project_languages WHERE projectId = ? ORDER BY rowid",
        )
        .all(id) as { language: string }[]
    ).map((row) => row.language);
  }
  async list(): Promise<Project[]> {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY rowid DESC")
      .all() as unknown as Omit<Project, "languages">[];
    return rows.map((row) => ({ ...row, languages: this.languages(row.id) }));
  }
  async create(project: Project): Promise<void> {
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO projects (id, name, baseLanguage) VALUES (?, ?, ?)",
        )
        .run(project.id, project.name, project.baseLanguage);
      const insert = this.db.prepare(
        "INSERT INTO project_languages (projectId, language) VALUES (?, ?)",
      );
      for (const language of project.languages)
        insert.run(project.id, language);
    });
  }
  async get(id: string) {
    const project = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as unknown as Omit<Project, "languages"> | undefined;
    if (!project) return undefined;
    const rows = this.db
      .prepare(
        "SELECT id, path FROM resource_entries WHERE projectId = ? ORDER BY path",
      )
      .all(id) as { id: number; path: string }[];
    const values = this.db
      .prepare(
        "SELECT entryId, language, value, needsReview FROM translations WHERE projectId = ?",
      )
      .all(id) as unknown as (Translation & { entryId: number })[];
    const byEntry = new Map<number, Translation[]>();
    for (const value of values) {
      const group = byEntry.get(value.entryId) ?? [];
      group.push({
        language: value.language,
        value: value.value,
        needsReview: Boolean(value.needsReview),
      });
      byEntry.set(value.entryId, group);
    }
    const entries: Entry[] = rows.map((row) => ({
      id: row.id,
      path: JSON.parse(row.path) as string[],
      translations: byEntry.get(row.id) ?? [],
    }));
    return { ...project, languages: this.languages(id), entries };
  }
  async addLanguage(id: string, language: string): Promise<void> {
    this.transaction(() => {
      const languages = this.languages(id);
      if (languages.includes(language) || languages.length >= 100)
        throw new AppError("invalidLanguages");
      this.db
        .prepare(
          "INSERT INTO project_languages (projectId, language) VALUES (?, ?)",
        )
        .run(id, language);
    });
  }
  async import(id: string, entries: ResourceEntry[]): Promise<void> {
    this.transaction(() => {
      const project = this.db
        .prepare("SELECT baseLanguage FROM projects WHERE id = ?")
        .get(id) as { baseLanguage: string } | undefined;
      if (!project) throw new AppError("notFound", 404);
      const existing = this.db
        .prepare("SELECT path FROM resource_entries WHERE projectId = ?")
        .all(id) as { path: string }[];
      assertCompatiblePaths([
        ...existing.map((row) => JSON.parse(row.path) as string[]),
        ...entries.map((entry) => entry.path),
      ]);
      const insert = this.db.prepare(
        "INSERT INTO resource_entries (projectId, path) VALUES (?, ?) ON CONFLICT(projectId, path) DO NOTHING",
      );
      const lookup = this.db.prepare(
        "SELECT id FROM resource_entries WHERE projectId = ? AND path = ?",
      );
      const previous = this.db.prepare(
        "SELECT value FROM translations WHERE projectId = ? AND entryId = ? AND language = ?",
      );
      const review = this.db.prepare(
        "UPDATE translations SET needsReview = 1 WHERE projectId = ? AND entryId = ? AND language <> ? AND value <> ''",
      );
      const save = this.db.prepare(
        "INSERT INTO translations (projectId, entryId, language, value) VALUES (?, ?, ?, ?) ON CONFLICT(projectId, entryId, language) DO UPDATE SET value = excluded.value, needsReview = 0",
      );
      for (const entry of entries) {
        const path = JSON.stringify(entry.path);
        insert.run(id, path);
        const { id: entryId } = lookup.get(id, path) as { id: number };
        const old = previous.get(id, entryId, project.baseLanguage) as
          { value: string } | undefined;
        if (old && old.value !== entry.value)
          review.run(id, entryId, project.baseLanguage);
        save.run(id, entryId, project.baseLanguage, entry.value);
      }
    });
  }
  async saveTranslation(
    id: string,
    entryId: number,
    language: string,
    value: string,
  ): Promise<boolean> {
    return (
      this.db
        .prepare(
          `INSERT INTO translations (projectId, entryId, language, value)
      SELECT r.projectId, r.id, l.language, ? FROM resource_entries r
      JOIN project_languages l ON l.projectId = r.projectId
      JOIN projects p ON p.id = r.projectId
      WHERE r.projectId = ? AND r.id = ? AND l.language = ? AND l.language <> p.baseLanguage
      ON CONFLICT(projectId, entryId, language) DO UPDATE SET value = excluded.value, needsReview = 0`,
        )
        .run(value, id, entryId, language).changes > 0
    );
  }
  close() {
    this.db.close();
  }
}
