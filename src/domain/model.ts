export interface Project {
  id: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
}
export interface Entry {
  key: string;
  source: string;
  translation: string;
  needsReview: boolean;
}
export interface ProjectDetail extends Project {
  entries: Entry[];
}
export interface SourceEntry {
  key: string;
  value: string;
}
export interface ResourceFormat {
  parse(text: string): SourceEntry[];
  serialize(entries: SourceEntry[]): string;
  validateTranslation(source: string, translation: string): boolean;
}
export interface ProjectRepository {
  list(): Promise<Project[]>;
  create(project: Project): Promise<void>;
  get(id: string): Promise<ProjectDetail | undefined>;
  import(id: string, entries: SourceEntry[]): Promise<void>;
  saveTranslation(id: string, key: string, value: string): Promise<boolean>;
}
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
