export const projectLanguages = {
  version: 2,
  sql: `
    CREATE TABLE projects_v2 (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, baseLanguage TEXT NOT NULL,
      FOREIGN KEY (id, baseLanguage) REFERENCES project_languages(projectId, language) DEFERRABLE INITIALLY DEFERRED
    );
    CREATE TABLE project_languages (
      projectId TEXT NOT NULL REFERENCES projects_v2(id), language TEXT NOT NULL,
      PRIMARY KEY (projectId, language)
    );
    CREATE TABLE resource_entries (
      id INTEGER PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects_v2(id), path TEXT NOT NULL,
      UNIQUE (projectId, path), UNIQUE (projectId, id)
    );
    CREATE TABLE translations (
      projectId TEXT NOT NULL, entryId INTEGER NOT NULL, language TEXT NOT NULL,
      value TEXT NOT NULL, needsReview INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (projectId, entryId, language),
      FOREIGN KEY (projectId, entryId) REFERENCES resource_entries(projectId, id),
      FOREIGN KEY (projectId, language) REFERENCES project_languages(projectId, language)
    );
    CREATE INDEX translations_language ON translations(projectId, language);
    INSERT INTO projects_v2 SELECT id, name, sourceLanguage FROM projects;
    INSERT INTO project_languages SELECT id, sourceLanguage FROM projects;
    INSERT INTO project_languages SELECT id, targetLanguage FROM projects;
    INSERT INTO resource_entries (projectId, path) SELECT projectId, json_array(key) FROM entries;
    INSERT INTO translations (projectId, entryId, language, value, needsReview)
      SELECT e.projectId, r.id, p.sourceLanguage, e.source, 0
      FROM entries e JOIN projects p ON p.id = e.projectId
      JOIN resource_entries r ON r.projectId = e.projectId AND r.path = json_array(e.key);
    INSERT INTO translations (projectId, entryId, language, value, needsReview)
      SELECT e.projectId, r.id, p.targetLanguage, e.translation, e.needsReview
      FROM entries e JOIN projects p ON p.id = e.projectId
      JOIN resource_entries r ON r.projectId = e.projectId AND r.path = json_array(e.key);
    DROP TABLE entries;
    DROP TABLE projects;
    ALTER TABLE projects_v2 RENAME TO projects;
  `,
};
