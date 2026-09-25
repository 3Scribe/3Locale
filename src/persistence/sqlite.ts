import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrations";
import {
  AppError,
  type Project,
  type ProjectDetail,
  type ProjectRepository,
  type ProjectCommit,
  type AuditEvent,
  type Revision,
  type Entry,
  type Translation,
  type Lifecycle,
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
  private project(id: string): ProjectDetail | undefined {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as unknown as
      Omit<Project, "languages" | "languageMetadata"> | undefined;
    if (!row) return undefined;
    const languages = this.db
      .prepare(
        "SELECT language, createdAt, updatedAt FROM project_languages WHERE projectId = ? ORDER BY rowid",
      )
      .all(id) as unknown as (Lifecycle & { language: string })[];
    const rows = this.db
      .prepare(
        "SELECT id, path, createdAt, updatedAt FROM resource_entries WHERE projectId = ? ORDER BY path",
      )
      .all(id) as unknown as (Lifecycle & { id: number; path: string })[];
    const values = this.db
      .prepare(
        "SELECT entryId, language, value, needsReview, createdAt, updatedAt, origin, originProvider, originModel FROM translations WHERE projectId = ?",
      )
      .all(id) as unknown as (Translation & { entryId: number })[];
    const byEntry = new Map<number, Translation[]>();
    for (const { entryId, ...value } of values) {
      const group = byEntry.get(entryId) ?? [];
      group.push({ ...value, needsReview: Boolean(value.needsReview) });
      byEntry.set(entryId, group);
    }
    const entries: Entry[] = rows.map((row) => ({
      ...row,
      path: JSON.parse(row.path) as string[],
      translations: byEntry.get(row.id) ?? [],
    }));
    return {
      ...row,
      languages: languages.map((item) => item.language),
      languageMetadata: Object.fromEntries(
        languages.map(({ language, ...metadata }) => [language, metadata]),
      ),
      entries,
    };
  }
  async list(): Promise<Project[]> {
    const rows = this.db
      .prepare("SELECT id FROM projects ORDER BY rowid DESC")
      .all() as { id: string }[];
    return rows.map((row) => {
      const project = this.project(row.id)!;
      const { entries, ...summary } = project;
      void entries;
      return summary;
    });
  }
  async get(id: string) {
    return this.project(id);
  }
  async commit(change: ProjectCommit): Promise<void> {
    const { project, expectedVersion } = change;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.db
        .prepare("SELECT version FROM projects WHERE id = ?")
        .get(project.id) as { version: number } | undefined;
      if ((old?.version ?? null) !== expectedVersion)
        throw new AppError("stalePreview", 409);
      this.db
        .prepare(
          `INSERT INTO projects (id, name, baseLanguage, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, baseLanguage=excluded.baseLanguage, createdAt=excluded.createdAt, updatedAt=excluded.updatedAt, version=excluded.version`,
        )
        .run(
          project.id,
          project.name,
          project.baseLanguage,
          project.createdAt,
          project.updatedAt,
          project.version,
        );
      this.db
        .prepare("DELETE FROM translations WHERE projectId = ?")
        .run(project.id);
      this.db
        .prepare("DELETE FROM resource_entries WHERE projectId = ?")
        .run(project.id);
      this.db
        .prepare("DELETE FROM project_languages WHERE projectId = ?")
        .run(project.id);
      const languageInsert = this.db.prepare(
        "INSERT INTO project_languages (projectId, language, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
      );
      for (const language of project.languages) {
        const metadata = project.languageMetadata[language];
        languageInsert.run(
          project.id,
          language,
          metadata.createdAt,
          metadata.updatedAt,
        );
      }
      const entryInsert = this.db.prepare(
        "INSERT INTO resource_entries (projectId, id, path, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
      );
      const valueInsert = this.db.prepare(
        "INSERT INTO translations (projectId, entryId, language, value, needsReview, createdAt, updatedAt, origin, originProvider, originModel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const entry of project.entries) {
        entryInsert.run(
          project.id,
          entry.id,
          JSON.stringify(entry.path),
          entry.createdAt,
          entry.updatedAt,
        );
        for (const value of entry.translations)
          valueInsert.run(
            project.id,
            entry.id,
            value.language,
            value.value,
            Number(value.needsReview),
            value.createdAt,
            value.updatedAt,
            value.origin,
            value.originProvider ?? null,
            value.originModel ?? null,
          );
      }
      const audit = this.db.prepare(
        "INSERT INTO audit_events (projectId, operationId, occurredAt, kind, details) VALUES (?, ?, ?, ?, ?)",
      );
      for (const { kind, ...details } of change.events)
        audit.run(
          project.id,
          `${project.id}:${project.version}`,
          change.occurredAt,
          kind,
          JSON.stringify(details),
        );
      const revision = this.db.prepare(
        "INSERT INTO revisions (projectId, createdAt, kind, state) VALUES (?, ?, ?, ?)",
      );
      for (const checkpoint of change.checkpoints)
        revision.run(
          project.id,
          checkpoint.createdAt,
          checkpoint.kind,
          JSON.stringify(checkpoint.state),
        );
      this.db
        .prepare(
          "DELETE FROM revisions WHERE projectId = ? AND id NOT IN (SELECT id FROM revisions WHERE projectId = ? ORDER BY id DESC LIMIT ?)",
        )
        .run(project.id, project.id, change.revisionLimit);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async audit(
    id: string,
    before = Number.MAX_SAFE_INTEGER,
  ): Promise<AuditEvent[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM audit_events WHERE projectId = ? AND id < ? ORDER BY id DESC LIMIT 100",
      )
      .all(id, before) as unknown as (Omit<AuditEvent, "details"> & {
      details: string;
    })[];
    return rows.map(
      ({ details, ...row }) =>
        ({ ...row, ...JSON.parse(details) }) as AuditEvent,
    );
  }
  async revisions(id: string): Promise<Revision[]> {
    return this.db
      .prepare(
        "SELECT id, projectId, createdAt, kind FROM revisions WHERE projectId = ? ORDER BY id DESC",
      )
      .all(id) as unknown as Revision[];
  }
  async revision(
    id: string,
    revisionId: number,
  ): Promise<ProjectDetail | undefined> {
    const row = this.db
      .prepare("SELECT state FROM revisions WHERE projectId = ? AND id = ?")
      .get(id, revisionId) as { state: string } | undefined;
    return row ? (JSON.parse(row.state) as ProjectDetail) : undefined;
  }
  close() {
    this.db.close();
  }
}
