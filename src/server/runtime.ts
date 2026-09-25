import { MachineTranslationService } from "../application/machine-translation";
import { DeepLProvider } from "../providers/deepl";
import { zipArchive } from "../providers/zip";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ProjectService } from "../application/projects";
import { SqliteProjectRepository } from "../persistence/sqlite";
import { jsonResource } from "../providers/json";
let repository: SqliteProjectRepository;
let service: ProjectService | undefined;
export function projects() {
  if (!service) {
    const path = resolve(
      process.env.THREELOCALE_DATABASE_PATH ?? "data/three-locale.db",
    );
    mkdirSync(dirname(path), { recursive: true });
    repository = new SqliteProjectRepository(path);
    service = new ProjectService(
      repository,
      jsonResource,
      undefined,
      zipArchive,
    );
  }
  return service;
}

export function machineTranslations() {
  projects();
  return new MachineTranslationService(
    repository,
    jsonResource,
    new DeepLProvider(process.env.THREELOCALE_DEEPL_API_KEY),
  );
}
