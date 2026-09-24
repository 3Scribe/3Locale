export const initialSchema = {
  version: 1,
  sql: `
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, sourceLanguage TEXT NOT NULL, targetLanguage TEXT NOT NULL);
    CREATE TABLE entries (projectId TEXT NOT NULL REFERENCES projects(id), key TEXT NOT NULL, source TEXT NOT NULL, translation TEXT NOT NULL DEFAULT '', needsReview INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (projectId, key));
  `,
};
