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
