import type { APIRoute } from "astro";
import { z } from "zod";
import { security } from "@runtime";
import { handle, json, readJson } from "../../server/http";
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      name: z.string().trim().min(1).max(120),
      secret: z.string().min(1).max(4096),
    })
    .strict(),
  z
    .object({
      action: z.literal("replace"),
      id: z.uuid(),
      version: z.number().int().positive(),
      name: z.string().trim().min(1).max(120),
      secret: z.string().min(1).max(4096).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      id: z.uuid(),
      version: z.number().int().positive(),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      id: z.uuid(),
      confirmed: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal("default"), id: z.uuid() }).strict(),
]);
export const GET: APIRoute = () =>
  handle(async () => json(await security().credentials.list()));
export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const command = input.parse(await readJson(request, 12000)),
      service = security().credentials;
    switch (command.action) {
      case "create":
        await service.save(command.name, command.secret);
        break;
      case "replace":
        await service.save(
          command.name,
          command.secret,
          command.id,
          command.version,
        );
        break;
      case "delete":
        await service.remove(command.id, command.version, command.confirmed);
        break;
      case "verify":
        await service.verify(command.id, command.confirmed);
        break;
      case "default":
        await service.setDefault(command.id);
        break;
    }
    return json(await service.list());
  });
