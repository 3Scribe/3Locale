import type { APIRoute } from "astro";
import { projects } from "../../../server/runtime";
import {
  actionInput,
  handle,
  json,
  projectId,
  readJson,
} from "../../../server/http";
export const GET: APIRoute = ({ params, url }) =>
  handle(() => {
    const id = projectId.parse(params.id);
    if (url.searchParams.get("export") === "true")
      return new Response(projects().export(id), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": 'attachment; filename="translations.json"',
          "Cache-Control": "no-store",
        },
      });
    return json(projects().get(id));
  });
export const POST: APIRoute = ({ params, request }) =>
  handle(async () => {
    const id = projectId.parse(params.id);
    const input = actionInput.parse(await readJson(request));
    return json(
      input.action === "import"
        ? projects().import(id, input.text)
        : projects().translate(id, input.key, input.value),
    );
  });
