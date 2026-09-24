import { parseTree, type ParseError } from "jsonc-parser";
import {
  AppError,
  type ResourceFormat,
  type SourceEntry,
} from "../domain/model";

export const flatJson: ResourceFormat = {
  parse(text) {
    if (new TextEncoder().encode(text).byteLength > 1_000_000)
      throw new AppError("tooLarge", 413);
    const errors: ParseError[] = [];
    const root = parseTree(text, errors, {
      allowTrailingComma: false,
      disallowComments: true,
    });
    if (errors.length || root?.type !== "object")
      throw new AppError("invalidResource");
    const seen = new Set<string>();
    const entries: SourceEntry[] = [];
    for (const property of root.children ?? []) {
      const [keyNode, valueNode] = property.children ?? [];
      const key = keyNode?.value as string;
      if (
        !key?.trim() ||
        key.length > 500 ||
        valueNode?.type !== "string" ||
        valueNode.value.length > 20000 ||
        seen.has(key)
      )
        throw new AppError("invalidResource");
      seen.add(key);
      entries.push({ key, value: valueNode.value as string });
    }
    if (!entries.length || entries.length > 5000)
      throw new AppError("invalidResource");
    return entries;
  },
  serialize(entries) {
    return (
      JSON.stringify(
        Object.fromEntries(entries.map(({ key, value }) => [key, value])),
        null,
        2,
      ) + "\n"
    );
  },
  validateTranslation(source, translation) {
    const tokens = (value: string) =>
      (value.match(/\{\{[^{}]+\}\}|\{[^{}]+\}/g) ?? []).sort();
    return (
      JSON.stringify(tokens(source)) === JSON.stringify(tokens(translation))
    );
  },
};
