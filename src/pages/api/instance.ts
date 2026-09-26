import type { APIRoute } from "astro";
import { z } from "zod";
import { instance } from "@runtime";
import { handle, json, readJson } from "../../server/http";
export const GET: APIRoute = () =>
  handle(async () => json(await instance().status()));
export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const input = z
      .object({
        action: z.literal("checkProvider"),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(await readJson(request));
    return json(await instance().checkProvider(input.confirmed));
  });
