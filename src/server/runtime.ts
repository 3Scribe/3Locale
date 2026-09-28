import { InstanceService } from "../application/instance";
import { MachineTranslationService } from "../application/machine-translation";
import { SqliteSecurityRepository } from "../persistence/security.sqlite";
import { composeSecurity } from "./security";
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

export async function machineTranslations() {
  projects();
  return new MachineTranslationService(
    repository,
    jsonResource,
    await security().credentials.provider(),
  );
}

export async function instance() {
  return new InstanceService(
    () => {
      projects();
      return repository;
    },
    await security().credentials.provider(),
    "node",
  );
}

let securityRepository: SqliteSecurityRepository;
export function security() {
  if (!securityRepository) {
    const path = resolve(
      process.env.THREELOCALE_DATABASE_PATH ?? "data/three-locale.db",
    );
    mkdirSync(dirname(path), { recursive: true });
    securityRepository = new SqliteSecurityRepository(path);
  }
  return composeSecurity(
    securityRepository,
    process.env.THREELOCALE_ORIGIN,
    process.env.THREELOCALE_CREDENTIAL_ENCRYPTION_KEY,
  );
}
