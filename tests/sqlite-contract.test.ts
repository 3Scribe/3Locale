import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { SqliteProjectRepository } from "../src/persistence/sqlite";
import { repositoryContract } from "./contracts/repository";
repositoryContract("SQLite", async () => {
  const folder = mkdtempSync(join(tmpdir(), "three-locale-contract-"));
  const path = join(folder, "test.db");
  const repository = new SqliteProjectRepository(path);
  const db = new DatabaseSync(path);
  return {
    repository,
    async execute(sql) {
      db.exec(sql);
    },
    async close() {
      db.close();
      repository.close();
      rmSync(folder, { recursive: true, force: true });
    },
  };
});
