import {
  AppError,
  type ProjectRepository,
  type ProjectCommit,
  type Project,
  type ProjectDetail,
  type Entry,
  type Translation,
  type Lifecycle,
  type AuditEvent,
  type Revision,
} from "../domain/model";
import { projectDelta, jsonChunks, snapshotChunks } from "./delta";
type ProjectRow = Omit<Project, "languages" | "languageMetadata">;
type LanguageRow = Lifecycle & { projectId: string; language: string };
function projectFrom(row: ProjectRow, languages: LanguageRow[]): Project {
  return {
    ...row,
    languages: languages.map((item) => item.language),
    languageMetadata: Object.fromEntries(
      languages.map((item) => [
        item.language,
        { createdAt: item.createdAt, updatedAt: item.updatedAt },
      ]),
    ),
  };
}
export class D1ProjectRepository implements ProjectRepository {
  constructor(private db: D1Database) {}
  async list(): Promise<Project[]> {
    const [projects, languages] = await this.db.batch([
      this.db.prepare("SELECT * FROM projects ORDER BY rowid DESC"),
      this.db.prepare(
        "SELECT projectId,language,createdAt,updatedAt FROM project_languages ORDER BY position",
      ),
    ]);
    return (projects.results as unknown as ProjectRow[]).map((row) =>
      projectFrom(
        row,
        (languages.results as unknown as LanguageRow[]).filter(
          (language) => language.projectId === row.id,
        ),
      ),
    );
  }
  async get(id: string): Promise<ProjectDetail | undefined> {
    const [projects, languages, entries, translations] = await this.db.batch([
      this.db.prepare("SELECT * FROM projects WHERE id=?").bind(id),
      this.db
        .prepare(
          "SELECT projectId,language,createdAt,updatedAt FROM project_languages WHERE projectId=? ORDER BY position",
        )
        .bind(id),
      this.db
        .prepare(
          "SELECT id,path,createdAt,updatedAt FROM resource_entries WHERE projectId=? ORDER BY path",
        )
        .bind(id),
      this.db
        .prepare(
          "SELECT entryId,language,value,needsReview,createdAt,updatedAt,origin FROM translations WHERE projectId=? ORDER BY entryId,language",
        )
        .bind(id),
    ]);
    const row = projects.results[0] as unknown as ProjectRow | undefined;
    if (!row) return undefined;
    const values = new Map<number, Translation[]>();
    for (const {
      entryId,
      ...translation
    } of translations.results as unknown as (Translation & {
      entryId: number;
    })[]) {
      const group = values.get(entryId) ?? [];
      group.push({
        ...translation,
        needsReview: Boolean(translation.needsReview),
      });
      values.set(entryId, group);
    }
    return {
      ...projectFrom(row, languages.results as unknown as LanguageRow[]),
      entries: (
        entries.results as unknown as (Omit<Entry, "path" | "translations"> & {
          path: string;
        })[]
      ).map((entry) => ({
        ...entry,
        path: JSON.parse(entry.path),
        translations: values.get(entry.id) ?? [],
      })),
    };
  }
  async commit(change: ProjectCommit): Promise<void> {
    const { project, previous, expectedVersion } = change;
    if (
      (previous?.version ?? null) !== expectedVersion ||
      (previous && previous.id !== project.id) ||
      project.version !== (expectedVersion ?? 0) + 1
    )
      throw new AppError("invalidRequest");
    const statements: D1PreparedStatement[] = [];
    const add = (sql: string, ...params: (string | number | null)[]) =>
      statements.push(this.db.prepare(sql).bind(...params));
    // CHECK failure rolls the batch back; a zero-row UPDATE alone would not guard later writes.
    add(
      "INSERT INTO commit_guard (projectId,valid) VALUES (?, CASE WHEN (? IS NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id=?)) OR EXISTS (SELECT 1 FROM projects WHERE id=? AND version=?) THEN 1 ELSE 0 END)",
      project.id,
      expectedVersion,
      project.id,
      project.id,
      expectedVersion,
    );
    add(
      "INSERT INTO projects (id,name,baseLanguage,createdAt,updatedAt,version) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,baseLanguage=excluded.baseLanguage,createdAt=excluded.createdAt,updatedAt=excluded.updatedAt,version=excluded.version",
      project.id,
      project.name,
      project.baseLanguage,
      project.createdAt,
      project.updatedAt,
      project.version,
    );
    const delta = projectDelta(change);
    for (const table of [...delta].reverse())
      for (const chunk of jsonChunks(table.removed))
        add(
          `DELETE FROM ${table.table} WHERE (${table.keys.join(",")}) IN (SELECT ${table.keys.map((_, index) => `json_extract(value,'$[${index}]')`).join(",")} FROM json_each(?))`,
          chunk,
        );
    for (const table of delta)
      for (const chunk of jsonChunks(table.rows))
        add(
          `INSERT INTO ${table.table} (${table.columns.join(",")}) SELECT ${table.columns.map((_, index) => `json_extract(value,'$[${index}]')`).join(",")} FROM json_each(?) WHERE true ON CONFLICT(${table.keys.join(",")}) DO UPDATE SET ${table.columns
            .filter((column) => !table.keys.includes(column))
            .map((column) => `${column}=excluded.${column}`)
            .join(",")}`,
          chunk,
        );
    const events = change.events.map(({ kind, ...details }) => [
      project.id,
      `${project.id}:${project.version}`,
      change.occurredAt,
      kind,
      JSON.stringify(details),
    ]);
    for (const chunk of jsonChunks(events))
      add(
        "INSERT INTO audit_events (projectId,operationId,occurredAt,kind,details) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]') FROM json_each(?)",
        chunk,
      );
    for (const checkpoint of change.checkpoints) {
      add(
        "INSERT INTO revisions (projectId,createdAt,kind) VALUES (?,?,?)",
        project.id,
        checkpoint.createdAt,
        checkpoint.kind,
      );
      // MAX is scoped to this project and executed in the same transaction, before the next checkpoint.
      for (const [position, text] of snapshotChunks(
        JSON.stringify(checkpoint.state),
      ).entries())
        add(
          "INSERT INTO revision_chunks (revisionId,position,text) VALUES ((SELECT MAX(id) FROM revisions WHERE projectId=?),?,?)",
          project.id,
          position,
          text,
        );
    }
    if (change.checkpoints.length)
      add(
        "DELETE FROM revisions WHERE projectId=? AND id NOT IN (SELECT id FROM revisions WHERE projectId=? ORDER BY id DESC LIMIT ?)",
        project.id,
        project.id,
        change.revisionLimit,
      );
    add("DELETE FROM commit_guard WHERE projectId=?", project.id);
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("three_locale_version_guard")
      )
        throw new AppError("stalePreview", 409);
      throw error;
    }
  }
  async audit(
    id: string,
    before = Number.MAX_SAFE_INTEGER,
  ): Promise<AuditEvent[]> {
    const rows = await this.db
      .prepare(
        "SELECT * FROM audit_events WHERE projectId=? AND id<? ORDER BY id DESC LIMIT 100",
      )
      .bind(id, before)
      .all<{
        id: number;
        projectId: string;
        operationId: string;
        occurredAt: string;
        kind: string;
        details: string;
      }>();
    return rows.results.map(
      ({ details, ...row }) =>
        ({ ...row, ...JSON.parse(details) }) as AuditEvent,
    );
  }
  async revisions(id: string): Promise<Revision[]> {
    return (
      await this.db
        .prepare(
          "SELECT id,projectId,createdAt,kind FROM revisions WHERE projectId=? ORDER BY id DESC",
        )
        .bind(id)
        .all<Revision>()
    ).results;
  }
  async revision(
    id: string,
    revisionId: number,
  ): Promise<ProjectDetail | undefined> {
    const result = await this.db
      .prepare(
        "SELECT c.text FROM revision_chunks c JOIN revisions r ON r.id=c.revisionId WHERE r.projectId=? AND r.id=? ORDER BY c.position",
      )
      .bind(id, revisionId)
      .all<{ text: string }>();
    return result.results.length
      ? (JSON.parse(
          result.results.map((row) => row.text).join(""),
        ) as ProjectDetail)
      : undefined;
  }
}
