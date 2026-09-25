import type { APIRoute } from "astro";
import { projects } from "@runtime";
import { handle, json, projectInput, readJson } from "../../../server/http";
export const GET: APIRoute = () =>
  handle(async () => json(await projects().list()));
export const POST: APIRoute = ({ request }) =>
  handle(async () =>
    json(
      await projects().create({
        id: crypto.randomUUID(),
        ...projectInput.parse(await readJson(request)),
      }),
      201,
    ),
  );
