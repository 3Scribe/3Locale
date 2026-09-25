import {
  AppError,
  assertCompatiblePaths,
  translationFor,
  type ProjectDetail,
  type ResourceFormat,
  type ResourceEntry,
  type Translation,
} from "../domain/model";
import { canonicalLanguage } from "../domain/languages";
export interface LocaleFile {
  name: string;
  language: string;
  confirmed: boolean;
  text: string;
}
export type ConflictPolicy = "keepExisting" | "useImported";
export interface ImportIssue {
  file: string;
  code: string;
  path?: string[];
}
export interface ImportComparison {
  language: string;
  path: string[];
  existing: string;
  imported: string;
}
export interface ImportPreview {
  version: number;
  languages: string[];
  addedLanguages: string[];
  summary: Record<string, number>;
  conflicts: ImportComparison[];
  orphans: { language: string; path: string[]; value: string }[];
  issues: ImportIssue[];
}
export function setValue(
  project: ProjectDetail,
  entry: ProjectDetail["entries"][number],
  language: string,
  value: string,
  needsReview: boolean,
  origin: string,
  now: string,
) {
  const previous = entry.translations.find(
    (item) => item.language === language,
  );
  if (
    previous &&
    previous.value === value &&
    previous.needsReview === needsReview &&
    previous.origin === origin
  )
    return;
  const next: Translation = {
    language,
    value,
    needsReview,
    origin,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  entry.translations = [
    ...entry.translations.filter((item) => item.language !== language),
    next,
  ];
  entry.updatedAt = now;
  project.updatedAt = now;
  project.languageMetadata[language].updatedAt = now;
}
export function analyseImport(
  project: ProjectDetail,
  files: LocaleFile[],
  format: ResourceFormat,
  now: string,
  policy: ConflictPolicy = "keepExisting",
): { preview: ImportPreview; next: ProjectDetail } {
  const next = structuredClone(project);
  const languages = files.map((file) => canonicalLanguage(file.language));
  if (
    !files.length ||
    files.length > 20 ||
    files.some((file) => !file.confirmed) ||
    new Set(languages).size !== languages.length
  )
    throw new AppError("invalidMappings");
  if (
    files.reduce(
      (sum, file) => sum + new TextEncoder().encode(file.text).byteLength,
      0,
    ) > 10_000_000
  )
    throw new AppError("batchTooLarge", 413);
  const addedLanguages = languages.filter(
    (language) => !project.languages.includes(language),
  );
  if (project.languages.length + addedLanguages.length > 100)
    throw new AppError("invalidLanguages");
  const summary = {
    files: files.length,
    languagesAdded: addedLanguages.length,
    baseAdded: 0,
    baseUnchanged: 0,
    baseChanged: 0,
    translationsAdded: 0,
    translationsUnchanged: 0,
    conflicts: 0,
    orphans: 0,
    reviewMarked: 0,
    emptySkipped: 0,
    invalidResources: 0,
  };
  const preview: ImportPreview = {
    version: project.version,
    languages,
    addedLanguages,
    summary,
    conflicts: [],
    orphans: [],
    issues: [],
  };
  const parsed: {
    file: LocaleFile;
    language: string;
    entries: ResourceEntry[];
  }[] = [];
  for (const [index, file] of files.entries()) {
    try {
      parsed.push({
        file,
        language: languages[index],
        entries: format.parse(file.text),
      });
    } catch (error) {
      preview.issues.push({
        file: file.name,
        code: error instanceof AppError ? error.code : "invalidResource",
      });
      summary.invalidResources++;
    }
  }
  for (const language of addedLanguages) {
    next.languages.push(language);
    next.languageMetadata[language] = { createdAt: now, updatedAt: now };
    next.updatedAt = now;
  }
  const base = parsed.find((file) => file.language === project.baseLanguage);
  const byPath = new Map(
    next.entries.map((entry) => [JSON.stringify(entry.path), entry]),
  );
  if (base) {
    try {
      assertCompatiblePaths([
        ...next.entries.map((entry) => entry.path),
        ...base.entries.map((entry) => entry.path),
      ]);
    } catch {
      preview.issues.push({ file: base.file.name, code: "pathConflict" });
    }
    let id = Math.max(0, ...next.entries.map((entry) => entry.id));
    for (const item of base.entries) {
      const key = JSON.stringify(item.path);
      let entry = byPath.get(key);
      if (!entry) {
        entry = {
          id: ++id,
          path: item.path,
          translations: [],
          createdAt: now,
          updatedAt: now,
        };
        next.entries.push(entry);
        byPath.set(key, entry);
        summary.baseAdded++;
        setValue(
          next,
          entry,
          project.baseLanguage,
          item.value,
          false,
          "import",
          now,
        );
      } else if (
        translationFor(entry, project.baseLanguage).value === item.value
      )
        summary.baseUnchanged++;
      else {
        summary.baseChanged++;
        setValue(
          next,
          entry,
          project.baseLanguage,
          item.value,
          false,
          "import",
          now,
        );
        for (const value of [...entry.translations])
          if (
            value.language !== project.baseLanguage &&
            value.value !== "" &&
            !value.needsReview
          ) {
            summary.reviewMarked++;
            setValue(
              next,
              entry,
              value.language,
              value.value,
              true,
              value.origin ?? "manual",
              now,
            );
          }
      }
    }
  }
  for (const file of parsed.filter(
    (file) => file.language !== project.baseLanguage,
  ))
    for (const item of file.entries) {
      const entry = byPath.get(JSON.stringify(item.path));
      if (!entry) {
        summary.orphans++;
        preview.orphans.push({
          language: file.language,
          path: item.path,
          value: item.value,
        });
        continue;
      }
      const previous = translationFor(entry, file.language);
      if (
        item.value.trim() &&
        !format.validateTranslation(
          translationFor(entry, project.baseLanguage).value,
          item.value,
        )
      )
        preview.issues.push({
          file: file.file.name,
          code: "placeholders",
          path: item.path,
        });
      if (previous.value === item.value) {
        summary.translationsUnchanged++;
        continue;
      }
      if (!item.value.trim()) {
        summary.emptySkipped++;
        continue;
      }
      if (previous.value.trim()) {
        summary.conflicts++;
        preview.conflicts.push({
          language: file.language,
          path: item.path,
          existing: previous.value,
          imported: item.value,
        });
        if (policy === "keepExisting") continue;
      } else summary.translationsAdded++;
      setValue(
        next,
        entry,
        file.language,
        item.value,
        previous.needsReview,
        "import",
        now,
      );
    }
  return { preview, next };
}
