import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ProjectService } from "../../src/application/projects";
import { MachineTranslationService } from "../../src/application/machine-translation";
import { SqliteProjectRepository } from "../../src/persistence/sqlite";
import { jsonResource } from "../../src/providers/json";
import { zipArchive } from "../../src/providers/zip";
import { FakeTranslationProvider } from "../helpers/fake-provider";
const path = resolve("data/machine-e2e.db");
mkdirSync(dirname(path), { recursive: true });
const repository = new SqliteProjectRepository(path),
  provider = new FakeTranslationProvider();
const projectService = new ProjectService(
  repository,
  jsonResource,
  undefined,
  zipArchive,
);
const machineService = new MachineTranslationService(
  repository,
  jsonResource,
  provider,
);
export const projects = () => projectService;
export const machineTranslations = () => machineService;
