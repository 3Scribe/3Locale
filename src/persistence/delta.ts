import type { ProjectCommit } from "../domain/model";
type Row = (string | number | null)[];
export interface TableMutation {
  table: string;
  columns: string[];
  keys: string[];
  rows: Row[];
  removed: Row[];
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function projectDelta({
  previous,
  project,
}: ProjectCommit): TableMutation[] {
  const languages: TableMutation = {
    table: "project_languages",
    columns: ["projectId", "language", "createdAt", "updatedAt", "position"],
    keys: ["projectId", "language"],
    rows: [],
    removed: [],
  };
  const entries: TableMutation = {
    table: "resource_entries",
    columns: ["projectId", "id", "path", "createdAt", "updatedAt"],
    keys: ["projectId", "id"],
    rows: [],
    removed: [],
  };
  const translations: TableMutation = {
    table: "translations",
    columns: [
      "projectId",
      "entryId",
      "language",
      "value",
      "needsReview",
      "createdAt",
      "updatedAt",
      "origin",
      "originProvider",
      "originModel",
    ],
    keys: ["projectId", "entryId", "language"],
    rows: [],
    removed: [],
  };
  for (const [position, language] of project.languages.entries()) {
    if (
      !equal(
        previous?.languageMetadata[language],
        project.languageMetadata[language],
      ) ||
      previous?.languages.indexOf(language) !== position
    ) {
      const metadata = project.languageMetadata[language];
      languages.rows.push([
        project.id,
        language,
        metadata.createdAt,
        metadata.updatedAt,
        position,
      ]);
    }
  }
  for (const language of previous?.languages ?? [])
    if (!project.languages.includes(language))
      languages.removed.push([project.id, language]);
  const oldEntries = new Map(
    previous?.entries.map((entry) => [entry.id, entry]) ?? [],
  );
  const newEntries = new Map(project.entries.map((entry) => [entry.id, entry]));
  for (const entry of previous?.entries ?? []) {
    const next = newEntries.get(entry.id);
    if (!next || !equal(next.path, entry.path))
      entries.removed.push([project.id, entry.id]);
    for (const value of entry.translations)
      if (
        !next ||
        !equal(next.path, entry.path) ||
        !next.translations.some((item) => item.language === value.language)
      )
        translations.removed.push([project.id, entry.id, value.language]);
  }
  for (const entry of project.entries) {
    const old = oldEntries.get(entry.id);
    if (
      !old ||
      !equal(old.path, entry.path) ||
      old.createdAt !== entry.createdAt ||
      old.updatedAt !== entry.updatedAt
    )
      entries.rows.push([
        project.id,
        entry.id,
        JSON.stringify(entry.path),
        entry.createdAt,
        entry.updatedAt,
      ]);
    const oldValues = new Map(
      old?.translations.map((value) => [value.language, value]) ?? [],
    );
    for (const value of entry.translations)
      if (
        !old ||
        !equal(old.path, entry.path) ||
        !equal(oldValues.get(value.language), value)
      )
        translations.rows.push([
          project.id,
          entry.id,
          value.language,
          value.value,
          Number(value.needsReview),
          value.createdAt,
          value.updatedAt,
          value.origin,
          value.originProvider ?? null,
          value.originModel ?? null,
        ]);
  }
  return [languages, entries, translations];
}
export function jsonChunks(rows: Row[]): string[] {
  const chunks: string[] = [];
  let chunk: string[] = [];
  let bytes = 2;
  for (const row of rows) {
    const json = JSON.stringify(row);
    const size = new TextEncoder().encode(json).length + 1;
    if (size > 900_000)
      throw new Error("Persistence row exceeds batch payload limit");
    if (bytes + size > 900_000) {
      chunks.push(`[${chunk.join(",")}]`);
      chunk = [];
      bytes = 2;
    }
    chunk.push(json);
    bytes += size;
  }
  if (chunk.length) chunks.push(`[${chunk.join(",")}]`);
  return chunks;
}
export function snapshotChunks(text: string): string[] {
  const result: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + 200_000, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    result.push(text.slice(offset, end));
    offset = end;
  }
  return result;
}
