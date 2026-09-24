import { historyMetadata } from "./migrations/003-history-metadata";
import type { DatabaseSync } from "node:sqlite";
import { initialSchema } from "./migrations/001-initial-schema";
import { projectLanguages } from "./migrations/002-project-languages";

export interface Migration {
  readonly version: number;
  readonly sql: string;
}
export const migrations: readonly Migration[] = [
  initialSchema,
  projectLanguages,
  historyMetadata,
];

export function migrate(
  db: DatabaseSync,
  steps: readonly Migration[] = migrations,
): void {
  for (const [index, step] of steps.entries()) {
    if (step.version !== index + 1)
      throw new Error(
        "Migrations must have consecutive versions starting at 1",
      );
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const { user_version: version } = db
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    if (version > steps.length)
      throw new Error("Database schema is newer than this application");
    for (const step of steps.slice(version)) {
      db.exec(step.sql);
      // SQLite PRAGMA does not accept bound parameters; versions are validated integers from code.
      db.exec(`PRAGMA user_version = ${step.version}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
