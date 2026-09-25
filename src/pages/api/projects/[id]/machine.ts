import type { APIRoute } from "astro";
import { machineTranslations } from "@runtime";
import { handle, json, readJson, projectId } from "../../../../server/http";
import { machineInput } from "../../../../server/machine-http";
export const POST: APIRoute = ({ params, request }) =>
  handle(async () => {
    const id = projectId.parse(params.id),
      input = machineInput.parse(await readJson(request));
    const service = machineTranslations();
    if (input.action === "preview")
      return json(await service.preview(id, input));
    if (input.action === "approve")
      return json(
        await service.approve(
          id,
          input,
          input.expectedVersion,
          input.confirmed,
        ),
      );
    return json(
      await service.apply(
        id,
        input,
        input.expectedVersion,
        input.confirmed,
        input.provider,
      ),
    );
  });
