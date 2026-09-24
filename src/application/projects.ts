import {
  AppError,
  translationFor,
  isReady,
  type ProjectRepository,
  type ResourceFormat,
} from "../domain/model";

export class ProjectService {
  constructor(
    private repository: ProjectRepository,
    private format: ResourceFormat,
  ) {}
  async list() {
    return this.repository.list();
  }
  async create(input: {
    id: string;
    name: string;
    baseLanguage: string;
    targetLanguages: string[];
  }) {
    const languages = [input.baseLanguage, ...input.targetLanguages];
    if (
      !input.targetLanguages.length ||
      languages.length > 100 ||
      new Set(languages).size !== languages.length
    )
      throw new AppError("invalidLanguages");
    await this.repository.create({
      id: input.id,
      name: input.name,
      baseLanguage: input.baseLanguage,
      languages,
    });
    return this.get(input.id);
  }
  async get(id: string) {
    const project = await this.repository.get(id);
    if (!project) throw new AppError("notFound", 404);
    return project;
  }
  async addLanguage(id: string, language: string) {
    const project = await this.get(id);
    if (project.languages.includes(language) || project.languages.length >= 100)
      throw new AppError("invalidLanguages");
    await this.repository.addLanguage(id, language);
    return this.get(id);
  }
  async import(id: string, text: string) {
    await this.get(id);
    await this.repository.import(id, this.format.parse(text));
    return this.get(id);
  }
  async translate(
    id: string,
    entryId: number,
    language: string,
    value: string,
  ) {
    const project = await this.get(id);
    if (
      language === project.baseLanguage ||
      !project.languages.includes(language)
    )
      throw new AppError("invalidLanguages");
    const entry = project.entries.find((entry) => entry.id === entryId);
    if (!entry) throw new AppError("notFound", 404);
    if (
      value.trim() &&
      !this.format.validateTranslation(
        translationFor(entry, project.baseLanguage).value,
        value,
      )
    )
      throw new AppError("placeholders");
    if (!(await this.repository.saveTranslation(id, entryId, language, value)))
      throw new AppError("notFound", 404);
    return this.get(id);
  }
  async export(id: string, language: string) {
    const project = await this.get(id);
    if (
      language === project.baseLanguage ||
      !project.languages.includes(language)
    )
      throw new AppError("invalidLanguages");
    if (
      !project.entries.length ||
      project.entries.some((entry) => {
        const translation = translationFor(entry, language);
        return (
          !isReady(translation) ||
          !this.format.validateTranslation(
            translationFor(entry, project.baseLanguage).value,
            translation.value,
          )
        );
      })
    )
      throw new AppError("incompleteExport", 409);
    return this.format.serialize(
      project.entries.map((entry) => ({
        path: entry.path,
        value: translationFor(entry, language).value,
      })),
    );
  }
}
