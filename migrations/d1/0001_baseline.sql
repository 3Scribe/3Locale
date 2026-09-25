CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, baseLanguage TEXT NOT NULL,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, version INTEGER NOT NULL,
  FOREIGN KEY (id, baseLanguage) REFERENCES project_languages(projectId, language) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE project_languages (
  projectId TEXT NOT NULL REFERENCES projects(id), language TEXT NOT NULL,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, position INTEGER NOT NULL,
  PRIMARY KEY (projectId, language)
);
CREATE TABLE resource_entries (
  projectId TEXT NOT NULL REFERENCES projects(id), id INTEGER NOT NULL, path TEXT NOT NULL,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
  PRIMARY KEY (projectId, id), UNIQUE (projectId, path)
);
CREATE TABLE translations (
  projectId TEXT NOT NULL, entryId INTEGER NOT NULL, language TEXT NOT NULL,
  value TEXT NOT NULL, needsReview INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, origin TEXT,
  PRIMARY KEY (projectId, entryId, language),
  FOREIGN KEY (projectId, entryId) REFERENCES resource_entries(projectId, id),
  FOREIGN KEY (projectId, language) REFERENCES project_languages(projectId, language)
);
CREATE INDEX translations_language ON translations(projectId, language);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, projectId TEXT NOT NULL REFERENCES projects(id),
  operationId TEXT NOT NULL, occurredAt TEXT NOT NULL, kind TEXT NOT NULL, details TEXT NOT NULL
);
CREATE INDEX audit_project_order ON audit_events(projectId, id DESC);
CREATE TABLE revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, projectId TEXT NOT NULL REFERENCES projects(id),
  createdAt TEXT NOT NULL, kind TEXT NOT NULL
);
CREATE INDEX revisions_project_order ON revisions(projectId, id DESC);
CREATE TABLE revision_chunks (
  revisionId INTEGER NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (revisionId, position)
);
-- A failed compare-and-swap aborts the entire D1 batch, including history and pruning.
CREATE TABLE commit_guard (
  projectId TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT three_locale_version_guard CHECK (valid = 1)
);
