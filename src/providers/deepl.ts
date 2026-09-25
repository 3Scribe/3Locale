import { SaxesParser } from "saxes";
import { z } from "zod";
import { AppError } from "../domain/model";
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
  TranslationItem,
} from "../domain/translation";
// Offline catalogue keeps capability checks and previews free of provider requests.
// Verified against DeepL's supported language types on 2026-09-25; see deployment references.
const common = new Set(
  "ace af an ar as ay az ba be bg bho bn br bs ca ceb ckb cs cy da de el eo es et eu fa fi fr ga gl gn gom gu ha he hi hr ht hu hy id ig is it ja jv ka kk kmr ko ky la lb lmo ln lt lv mai mg mi mk ml mn mr ms mt my nb ne nl oc om pa pag pam pl prs ps qu ro ru sa scn sk sl sq sr st su sv sw ta te tg th tk tl tn tr ts tt uk ur uz vi wo xh yi yue zh zu".split(
    " ",
  ),
);
export function deeplLanguage(
  tag: string,
  target: boolean,
): string | undefined {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(tag);
  } catch {
    return undefined;
  }
  const base = locale.language;
  if (!common.has(base) && base !== "en" && base !== "pt") return undefined;
  if (!target) return base.toUpperCase();
  if (base === "en")
    return !locale.region || locale.region === "US"
      ? "EN-US"
      : locale.region === "GB"
        ? "EN-GB"
        : undefined;
  if (base === "pt")
    return !locale.region || locale.region === "PT"
      ? "PT-PT"
      : locale.region === "BR"
        ? "PT-BR"
        : undefined;
  if (base === "zh") {
    if (locale.script && !["Hans", "Hant"].includes(locale.script))
      return undefined;
    return locale.script === "Hant" ||
      (!locale.script && ["TW", "HK", "MO"].includes(locale.region ?? ""))
      ? "ZH-HANT"
      : "ZH-HANS";
  }
  if (base === "es" && locale.region === "419") return "ES-419";
  if (locale.script) return undefined;
  return base.toUpperCase();
}
const escapeXml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
function xmlItem(item: TranslationItem) {
  let text = escapeXml(item.text);
  for (const token of item.protectedTokens)
    text = text.replaceAll(escapeXml(token), `<ph id="${escapeXml(token)}"/>`);
  return `<text id="${escapeXml(item.id)}">${text}</text>`;
}
function readXml(xml: string, id: string, tokens: string[]) {
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0,
    text = "",
    root = false;
  const invalid = () => {
    throw new AppError("machineInvalidResult");
  };
  parser.on("error", invalid);
  parser.on("doctype", invalid);
  parser.on("processinginstruction", invalid);
  parser.on("comment", invalid);
  parser.on("opentag", (tag) => {
    if (depth === 0) {
      if (root || tag.name !== "text") invalid();
      root = true;
      if (tag.attributes.id !== id)
        throw new AppError("machineMalformedResponse", 502);
      if (Object.keys(tag.attributes).length !== 1) invalid();
    } else {
      if (
        depth !== 1 ||
        tag.name !== "ph" ||
        Object.keys(tag.attributes).length !== 1 ||
        !tokens.includes(String(tag.attributes.id))
      )
        invalid();
      text += String(tag.attributes.id);
    }
    depth++;
  });
  parser.on("closetag", () => {
    depth--;
  });
  parser.on("text", (value) => {
    if (depth === 2) invalid();
    if (depth === 1) text += value;
    else if (value.trim()) invalid();
  });
  parser.on("cdata", invalid);
  parser.write(xml).close();
  if (!root || depth) invalid();
  return text;
}
const responseSchema = z.object({
  translations: z.array(
    z.object({
      text: z.string().max(2_000_000),
      model_type_used: z
        .enum(["quality_optimized", "latency_optimized"])
        .optional(),
      billed_characters: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
    }),
  ),
});
async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("machineMalformedResponse", 502);
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4_000_000) {
        await reader.cancel();
        throw new AppError("machineMalformedResponse", 502);
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
export class DeepLProvider implements TranslationProvider {
  readonly id = "deepl";
  readonly displayName = "DeepL";
  readonly configured: boolean;
  constructor(
    private key?: string,
    private send: typeof fetch = fetch,
  ) {
    this.key = key?.trim();
    this.configured = Boolean(this.key);
  }
  supports(source: string, target: string) {
    return Boolean(deeplLanguage(source, false) && deeplLanguage(target, true));
  }
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.configured) throw new AppError("machineNotConfigured", 503);
    const source = deeplLanguage(request.sourceLanguage, false),
      target = deeplLanguage(request.targetLanguage, true);
    if (!source || !target) throw new AppError("machineUnsupported");
    const body = (items: TranslationItem[]) =>
      JSON.stringify({
        text: items.map(xmlItem),
        source_lang: source,
        target_lang: target,
        tag_handling: "xml",
        tag_handling_version: "v2",
        ignore_tags: ["ph"],
        non_splitting_tags: ["ph"],
        preserve_formatting: true,
        show_billed_characters: true,
      });
    const batches: TranslationItem[][] = [];
    let batch: TranslationItem[] = [];
    for (const item of request.items) {
      const candidate = [...batch, item];
      if (
        candidate.length > 50 ||
        new TextEncoder().encode(body(candidate)).length > 120_000
      ) {
        if (batch.length) batches.push(batch);
        batch = [];
      }
      batch.push(item);
      if (new TextEncoder().encode(body(batch)).length > 120_000)
        throw new AppError("machineRequestTooLarge", 413);
    }
    if (batch.length) batches.push(batch);
    const result: TranslationResult = { items: [] };
    let billed = 0,
      hasBilling = true;
    for (const items of batches) {
      let response: Response;
      try {
        response = await this.send(
          `https://${this.key!.endsWith(":fx") ? "api-free" : "api"}.deepl.com/v2/translate`,
          {
            method: "POST",
            headers: {
              Authorization: `DeepL-Auth-Key ${this.key}`,
              "Content-Type": "application/json",
            },
            body: body(items),
            signal: AbortSignal.timeout(30_000),
            redirect: "error",
          },
        );
      } catch {
        throw new AppError("machineUnavailable", 502);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(
          response.status === 403
            ? "machineCredentials"
            : response.status === 429
              ? "machineRateLimit"
              : response.status === 456
                ? "machineQuota"
                : response.status === 413
                  ? "machineRequestTooLarge"
                  : response.status === 400
                    ? "machineUnsupported"
                    : "machineUnavailable",
          502,
        );
      }
      let data: z.infer<typeof responseSchema>;
      try {
        data = responseSchema.parse(await readResponse(response));
      } catch {
        throw new AppError("machineMalformedResponse", 502);
      }
      if (data.translations.length !== items.length)
        throw new AppError("machineMalformedResponse", 502);
      for (const [index, value] of data.translations.entries()) {
        if (value.billed_characters === undefined) hasBilling = false;
        else billed += value.billed_characters;
        const item = items[index];
        try {
          result.items.push({
            id: item.id,
            text: readXml(value.text, item.id, item.protectedTokens),
            ...(value.model_type_used ? { model: value.model_type_used } : {}),
          });
        } catch (error) {
          if (
            error instanceof AppError &&
            error.code === "machineMalformedResponse"
          )
            throw error;
          result.items.push({ id: item.id, error: "machineInvalidResult" });
        }
      }
    }
    if (hasBilling) result.billedCharacters = billed;
    return result;
  }
}
