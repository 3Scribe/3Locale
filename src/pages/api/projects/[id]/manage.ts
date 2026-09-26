import type { APIRoute } from "astro";
import { z } from "zod";
import { projects } from "@runtime";
import {
  handle,
  json,
  readJson,
  projectId,
  language,
} from "../../../../server/http";
import { versionInput } from "../../../../server/import-http";
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("rename"),
      name: z.string().trim().min(1).max(120),
      expectedVersion: versionInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      confirmedName: z.string().min(1).max(120),
      expectedVersion: versionInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("removeLanguage"),
      language,
      confirmed: z.literal(true),
      expectedVersion: versionInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("exportDraft"),
      language,
      confirmed: z.literal(true),
      expectedVersion: versionInput,
    })
    .strict(),
]);
export const POST: APIRoute = ({ params, request }) =>
  handle(async () => {
    const id = projectId.parse(params.id),
      input = command.parse(await readJson(request)),
      service = projects();
    if (input.action === "rename")
      return json(await service.rename(id, input.name, input.expectedVersion));
    if (input.action === "delete") {
      await service.delete(id, input.expectedVersion, input.confirmedName);
      return json({ deleted: true });
    }
    if (input.action === "removeLanguage")
      return json(
        await service.removeLanguage(
          id,
          input.language,
          input.expectedVersion,
          input.confirmed,
        ),
      );
    const zip = await service.exportDraft(
      id,
      input.language,
      input.expectedVersion,
      input.confirmed,
    );
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${input.language}.draft.zip"`,
        "Cache-Control": "no-store",
      },
    });
  });
