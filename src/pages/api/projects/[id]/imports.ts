import type { APIRoute } from "astro";
import { projects } from "../../../../server/runtime";
import { handle, json, readJson, projectId } from "../../../../server/http";
import { batchInput, beforeInput } from "../../../../server/import-http";
import { AppError } from "../../../../domain/model";
export const POST: APIRoute = ({ request, params }) =>
  handle(async () => {
    const id = projectId.parse(params.id);
    const data = batchInput.parse(await readJson(request, 22_000_000));
    if (data.action === "preview")
      return json(await projects().previewImport(id, data.files));
    if (data.action === "restore")
      return json(
        await projects().restore(id, data.revisionId, data.expectedVersion),
      );
    return json(
      await projects().applyImport(
        id,
        data.files,
        data.policy,
        data.expectedVersion,
      ),
    );
  });
export const GET: APIRoute = ({ params, url }) =>
  handle(async () => {
    const id = projectId.parse(params.id);
    const view = url.searchParams.get("view");
    if (view === "audit")
      return json(
        await projects().audit(
          id,
          url.searchParams.has("before")
            ? beforeInput.parse(url.searchParams.get("before"))
            : undefined,
        ),
      );
    if (view === "revisions") return json(await projects().revisions(id));
    if (view === "archive")
      return new Response(await projects().exportAll(id), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="translations.zip"',
          "Cache-Control": "no-store",
        },
      });
    throw new AppError("invalidRequest");
  });
