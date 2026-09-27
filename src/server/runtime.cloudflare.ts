import { InstanceService } from "../application/instance";
import { MachineTranslationService } from "../application/machine-translation";
import { D1SecurityRepository } from "../persistence/security.d1";
import { composeSecurity } from "./security";
import { env } from "cloudflare:workers";
import { ProjectService } from "../application/projects";
import { D1ProjectRepository } from "../persistence/d1";
import { jsonResource } from "../providers/json";
import { zipArchive } from "../providers/zip";
export function projects() {
  return new ProjectService(
    new D1ProjectRepository(env.THREELOCALE_DB),
    jsonResource,
    undefined,
    zipArchive,
  );
}

export async function machineTranslations() {
  return new MachineTranslationService(
    new D1ProjectRepository(env.THREELOCALE_DB),
    jsonResource,
    await security().credentials.provider(),
  );
}

export async function instance() {
  return new InstanceService(
    () => new D1ProjectRepository(env.THREELOCALE_DB),
    await security().credentials.provider(),
    "cloudflare",
  );
}

export function security() {
  const settings = env as Cloudflare.Env & {
    THREELOCALE_ORIGIN?: string;
    THREELOCALE_CREDENTIAL_ENCRYPTION_KEY?: string;
  };
  return composeSecurity(
    new D1SecurityRepository(env.THREELOCALE_DB),
    settings.THREELOCALE_ORIGIN,
    settings.THREELOCALE_CREDENTIAL_ENCRYPTION_KEY,
  );
}
