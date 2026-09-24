export interface Lifecycle {
  createdAt: string;
  updatedAt: string;
}
export interface Project extends Lifecycle {
  id: string;
  name: string;
  baseLanguage: string;
  languages: string[];
  languageMetadata: Record<string, Lifecycle>;
  version: number;
}
export interface Translation extends Lifecycle {
  origin: string | null;
  language: string;
  value: string;
  needsReview: boolean;
}
export interface Entry extends Lifecycle {
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
export interface AuditRecord {
  kind: string;
  language?: string;
  path?: string[];
  previous?: unknown;
  next?: unknown;
  summary?: Record<string, number>;
  policy?: string;
  revisionId?: number;
  files?: { name: string; language: string }[];
}
export interface AuditEvent extends AuditRecord {
  id: number;
  projectId: string;
  operationId: string;
  occurredAt: string;
}
export interface Revision {
  id: number;
  projectId: string;
  createdAt: string;
  kind: string;
}
export interface Checkpoint {
  kind: string;
  state: ProjectDetail;
  createdAt: string;
}
export interface ProjectCommit {
  project: ProjectDetail;
  expectedVersion: number | null;
  occurredAt: string;
  events: AuditRecord[];
  checkpoints: Checkpoint[];
  revisionLimit: number;
}
export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<ProjectDetail | undefined>;
  commit(change: ProjectCommit): Promise<void>;
  audit(id: string, before?: number): Promise<AuditEvent[]>;
  revisions(id: string): Promise<Revision[]>;
  revision(id: string, revisionId: number): Promise<ProjectDetail | undefined>;
}
export interface ArchiveProvider {
  pack(
    files: { name: string; text: string }[],
  ): Promise<Uint8Array<ArrayBuffer>>;
}
export const revisionLimit = 100;
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
      createdAt: "",
      updatedAt: "",
      origin: null,
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
