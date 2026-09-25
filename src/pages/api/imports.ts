import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { projects } from "../../server/runtime";
import { handle, json, readJson } from "../../server/http";
import { newImportInput } from "../../server/import-http";
import { AppError } from "../../domain/model";
export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const data = newImportInput.parse(await readJson(request, 22_000_000));
    const input = {
      id: randomUUID(),
      name: data.name,
      baseLanguage: data.baseLanguage,
      targetLanguages: [],
    };
    if (data.import.action === "restore") throw new AppError("invalidRequest");
    if (data.import.action === "preview")
      return json(await projects().previewNew(input, data.import.files));
    return json(
      await projects().createImport(
        input,
        data.import.files,
        data.import.policy,
        data.import.expectedVersion,
      ),
      201,
    );
  });
