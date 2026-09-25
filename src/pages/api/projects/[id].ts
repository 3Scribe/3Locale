import type { APIRoute } from "astro";
import { projects } from "@runtime";
import {
  actionInput,
  handle,
  json,
  projectId,
  readJson,
  language,
} from "../../../server/http";
export const GET: APIRoute = ({ params, url }) =>
  handle(async () => {
    const id = projectId.parse(params.id);
    if (url.searchParams.get("export") === "true")
      return new Response(
        await projects().export(
          id,
          language.parse(url.searchParams.get("language")),
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="translations.json"',
            "Cache-Control": "no-store",
          },
        },
      );
    return json(await projects().get(id));
  });
export const POST: APIRoute = ({ params, request }) =>
  handle(async () => {
    const id = projectId.parse(params.id);
    const input = actionInput.parse(await readJson(request));
    if (input.action === "addLanguage")
      return json(await projects().addLanguage(id, input.language));
    return json(
      input.action === "import"
        ? await projects().import(id, input.text)
        : await projects().translate(
            id,
            input.entryId,
            input.language,
            input.value,
          ),
    );
  });
