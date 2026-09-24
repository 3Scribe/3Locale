import { parseTree, visit, type Node, type ParseError } from "jsonc-parser";
import {
  AppError,
  assertCompatiblePaths,
  type ResourceFormat,
  type ResourceEntry,
} from "../domain/model";

export const jsonResource: ResourceFormat = {
  parse(text) {
    if (new TextEncoder().encode(text).byteLength > 1_000_000)
      throw new AppError("tooLarge", 413);
    const options = { allowTrailingComma: false, disallowComments: true };
    let depth = 0;
    // Stop before the parser can recurse beyond the supported path depth.
    visit(
      text,
      {
        onObjectBegin() {
          if (++depth > 32) throw new AppError("invalidResource");
        },
        onObjectEnd() {
          depth--;
        },
        onArrayBegin() {
          throw new AppError("invalidResource");
        },
      },
      options,
    );
    const errors: ParseError[] = [];
    const root = parseTree(text, errors, options);
    if (errors.length || root?.type !== "object")
      throw new AppError("invalidResource");
    const entries: ResourceEntry[] = [];
    function walk(node: Node, path: string[]) {
      if (node.type === "string") {
        if (node.value.length > 20000 || entries.length >= 5000)
          throw new AppError("invalidResource");
        entries.push({ path, value: node.value as string });
        return;
      }
      if (node.type !== "object" || !node.children?.length)
        throw new AppError("invalidResource");
      const seen = new Set<string>();
      for (const property of node.children) {
        const [keyNode, value] = property.children!;
        const key = keyNode.value as string;
        if (!key.trim() || key.length > 500 || seen.has(key))
          throw new AppError("invalidResource");
        seen.add(key);
        walk(value, [...path, key]);
      }
    }
    walk(root, []);
    return entries;
  },
  serialize(entries) {
    assertCompatiblePaths(entries.map((entry) => entry.path));
    const root: Record<string, unknown> = Object.create(null);
    for (const { path, value } of entries) {
      let parent = root;
      for (const segment of path.slice(0, -1)) {
        if (!Object.hasOwn(parent, segment))
          parent[segment] = Object.create(null);
        parent = parent[segment] as Record<string, unknown>;
      }
      parent[path[path.length - 1]] = value;
    }
    return JSON.stringify(root, null, 2) + "\n";
  },
  validateTranslation(base, translation) {
    const tokens = (value: string) =>
      (value.match(/\{\{[^{}]+\}\}|\{[^{}]+\}/g) ?? []).sort();
    return JSON.stringify(tokens(base)) === JSON.stringify(tokens(translation));
  },
};
