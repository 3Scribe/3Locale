import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { projects } from "../../../server/runtime";
import { handle, json, projectInput, readJson } from "../../../server/http";
export const GET: APIRoute = () => handle(() => json(projects().list()));
export const POST: APIRoute = ({ request }) =>
  handle(async () =>
    json(
      projects().create({
        id: randomUUID(),
        ...projectInput.parse(await readJson(request)),
      }),
      201,
    ),
  );
