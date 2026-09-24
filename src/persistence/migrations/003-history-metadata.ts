export const historyMetadata = {
  version: 3,
  sql: `
    CREATE TEMP TABLE migration_timestamp (value TEXT NOT NULL);
    INSERT INTO migration_timestamp VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    ALTER TABLE projects ADD COLUMN createdAt TEXT NOT NULL DEFAULT '';
    ALTER TABLE projects ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '';
    ALTER TABLE projects ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    UPDATE projects SET createdAt = (SELECT value FROM migration_timestamp), updatedAt = (SELECT value FROM migration_timestamp);
    ALTER TABLE project_languages ADD COLUMN createdAt TEXT NOT NULL DEFAULT '';
    ALTER TABLE project_languages ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '';
    UPDATE project_languages SET createdAt = (SELECT value FROM migration_timestamp), updatedAt = (SELECT value FROM migration_timestamp);
    CREATE TABLE resource_entries_v3 (
      id INTEGER NOT NULL, projectId TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, PRIMARY KEY (projectId, id), UNIQUE (projectId, path)
    );
    INSERT INTO resource_entries_v3 SELECT id, projectId, path, (SELECT value FROM migration_timestamp), (SELECT value FROM migration_timestamp) FROM resource_entries;
    CREATE TABLE translations_v3 (
      projectId TEXT NOT NULL, entryId INTEGER NOT NULL, language TEXT NOT NULL, value TEXT NOT NULL, needsReview INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, origin TEXT,
      PRIMARY KEY (projectId, entryId, language),
      FOREIGN KEY (projectId, entryId) REFERENCES resource_entries_v3(projectId, id),
      FOREIGN KEY (projectId, language) REFERENCES project_languages(projectId, language)
    );
    INSERT INTO translations_v3 SELECT t.projectId, t.entryId, t.language, t.value, t.needsReview, (SELECT value FROM migration_timestamp), (SELECT value FROM migration_timestamp), CASE WHEN t.language = p.baseLanguage THEN 'import' ELSE 'manual' END FROM translations t JOIN projects p ON p.id = t.projectId;
    DROP TABLE translations;
    DROP TABLE resource_entries;
    ALTER TABLE resource_entries_v3 RENAME TO resource_entries;
    ALTER TABLE translations_v3 RENAME TO translations;
    CREATE INDEX translations_language ON translations(projectId, language);
    CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, projectId TEXT NOT NULL REFERENCES projects(id), operationId TEXT NOT NULL, occurredAt TEXT NOT NULL, kind TEXT NOT NULL, details TEXT NOT NULL);
    CREATE INDEX audit_project_order ON audit_events(projectId, id DESC);
    CREATE TABLE revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, projectId TEXT NOT NULL REFERENCES projects(id), createdAt TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL);
    CREATE INDEX revisions_project_order ON revisions(projectId, id DESC);
    DROP TABLE migration_timestamp;
  `,
};
