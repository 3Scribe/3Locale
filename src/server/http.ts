import { z } from "zod";
import { AppError } from "../domain/model";
export const language = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .transform((value, context) => {
    try {
      return Intl.getCanonicalLocales(value)[0];
    } catch {
      context.addIssue({ code: "custom", message: "invalidRequest" });
      return z.NEVER;
    }
  });
export const projectInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    baseLanguage: language,
    targetLanguages: z.array(language).min(1).max(99),
  })
  .strict();
export const projectId = z.uuid();
export const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addLanguage"), language }).strict(),
  z
    .object({ action: z.literal("import"), text: z.string().max(1_000_000) })
    .strict(),
  z
    .object({
      action: z.literal("translate"),
      entryId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      language,
      value: z.string().max(20000),
    })
    .strict(),
]);
export async function readJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new AppError("invalidRequest", 415);
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    throw new AppError("invalidRequest", 403);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("invalidRequest");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2_000_000) {
      await reader.cancel();
      throw new AppError("tooLarge", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AppError("invalidRequest");
  }
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export async function handle(action: () => Response | Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "invalidRequest" }, 400);
    if (error instanceof AppError)
      return json({ error: error.code }, error.status);
    console.error("Request failed", error);
    return json({ error: "unexpected" }, 500);
  }
}
