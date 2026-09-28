import { InstanceService } from "../../src/application/instance";
import { SqliteSecurityRepository } from "../../src/persistence/security.sqlite";
import { composeSecurity } from "../../src/server/security";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ProjectService } from "../../src/application/projects";
import { MachineTranslationService } from "../../src/application/machine-translation";
import { SqliteProjectRepository } from "../../src/persistence/sqlite";
import { jsonResource } from "../../src/providers/json";
import { zipArchive } from "../../src/providers/zip";
import { FakeTranslationProvider } from "../helpers/fake-provider";
const path = resolve(
  process.env.THREELOCALE_DATABASE_PATH ?? "data/machine-e2e.db",
);
mkdirSync(dirname(path), { recursive: true });
const repository = new SqliteProjectRepository(path),
  provider = new FakeTranslationProvider();
const projectService = new ProjectService(
  repository,
  jsonResource,
  undefined,
  zipArchive,
);
export const projects = () => projectService;
const securityRepository = new SqliteSecurityRepository(path);
export const security = () =>
  composeSecurity(
    securityRepository,
    process.env.THREELOCALE_ORIGIN,
    process.env.THREELOCALE_CREDENTIAL_ENCRYPTION_KEY,
    () => provider,
  );
export const machineTranslations = async () =>
  new MachineTranslationService(
    repository,
    jsonResource,
    await security().credentials.provider(),
  );

export const instance = async () =>
  new InstanceService(
    () => repository,
    await security().credentials.provider(),
    "node",
  );
