export interface Project {
  id: string;
  name: string;
  baseLanguage: string;
  languages: string[];
}
export interface Translation {
  language: string;
  value: string;
  needsReview: boolean;
}
export interface Entry {
  id: number;
  path: string[];
  translations: Translation[];
}
export interface ProjectDetail extends Project {
  entries: Entry[];
}
export interface ResourceEntry {
  path: string[];
  value: string;
}
export interface ResourceFormat {
  parse(text: string): ResourceEntry[];
  serialize(entries: ResourceEntry[]): string;
  validateTranslation(base: string, translation: string): boolean;
}
export interface ProjectRepository {
  list(): Promise<Project[]>;
  create(project: Project): Promise<void>;
  get(id: string): Promise<ProjectDetail | undefined>;
  addLanguage(id: string, language: string): Promise<void>;
  import(id: string, entries: ResourceEntry[]): Promise<void>;
  saveTranslation(
    id: string,
    entryId: number,
    language: string,
    value: string,
  ): Promise<boolean>;
}
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function translationFor(entry: Entry, language: string): Translation {
  return (
    entry.translations.find((value) => value.language === language) ?? {
      language,
      value: "",
      needsReview: false,
    }
  );
}
export function isReady(translation: Translation): boolean {
  return Boolean(translation.value.trim()) && !translation.needsReview;
}
export function languageProgress(project: ProjectDetail, language: string) {
  return {
    total: project.entries.length,
    translated: project.entries.filter((entry) =>
      isReady(translationFor(entry, language)),
    ).length,
  };
}

// Retaining absent entries must never create a path that is both a string and an object.
export function assertCompatiblePaths(paths: string[][]): void {
  const leaves = new Set(paths.map((path) => JSON.stringify(path)));
  for (const path of paths) {
    for (let length = 1; length < path.length; length++) {
      if (leaves.has(JSON.stringify(path.slice(0, length))))
        throw new AppError("pathConflict", 409);
    }
  }
}
