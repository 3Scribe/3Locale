import { zipArchive } from "../providers/zip";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ProjectService } from "../application/projects";
import { SqliteProjectRepository } from "../persistence/sqlite";
import { jsonResource } from "../providers/json";
let service: ProjectService | undefined;
export function projects() {
  if (!service) {
    const path = resolve(
      process.env.THREELOCALE_DATABASE_PATH ?? "data/three-locale.db",
    );
    mkdirSync(dirname(path), { recursive: true });
    service = new ProjectService(
      new SqliteProjectRepository(path),
      jsonResource,
      undefined,
      zipArchive,
    );
  }
  return service;
}
