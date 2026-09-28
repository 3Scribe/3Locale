import type { APIRoute } from "astro";
import { z } from "zod";
import { security } from "@runtime";
import { handle, json, readJson } from "../../server/http";
import {
  challengeCookie,
  sessionCookie,
  cookieOptions,
} from "../../server/security";
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("begin"),
      purpose: z.enum(["setup", "login"]),
      name: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("finish"),
      purpose: z.enum(["setup", "login"]),
      response: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z.object({ action: z.literal("logout") }).strict(),
]);
export const GET: APIRoute = ({ cookies }) =>
  handle(async () =>
    json(await security().auth.status(cookies.get(sessionCookie)?.value)),
  );
export const POST: APIRoute = ({ request, cookies }) =>
  handle(async () => {
    const command = input.parse(await readJson(request, 64000));
    const { auth, origin } = security();
    if (command.action === "begin") {
      const result = await auth.begin(command.purpose, command.name);
      cookies.set(challengeCookie, result.token, cookieOptions(origin, 300));
      return json(result.options);
    }
    if (command.action === "finish") {
      const challenge = cookies.get(challengeCookie)?.value;
      cookies.delete(challengeCookie, { path: "/" });
      const token = await auth.finish(
        challenge,
        command.purpose,
        command.response,
      );
      await auth.logout(cookies.get(sessionCookie)?.value);
      cookies.set(sessionCookie, token, cookieOptions(origin, 7 * 86400));
      return json({ authenticated: true });
    }
    await auth.logout(cookies.get(sessionCookie)?.value);
    cookies.delete(sessionCookie, { path: "/" });
    return json({ authenticated: false });
  });
