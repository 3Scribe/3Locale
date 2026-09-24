import {
  AppError,
  type Project,
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
  async create(project: Project) {
    if (project.sourceLanguage === project.targetLanguage)
      throw new AppError("sameLanguage");
    await this.repository.create(project);
    return this.get(project.id);
  }
  async get(id: string) {
    const project = await this.repository.get(id);
    if (!project) throw new AppError("notFound", 404);
    return project;
  }
  async import(id: string, text: string) {
    await this.get(id);
    await this.repository.import(id, this.format.parse(text));
    return this.get(id);
  }
  async translate(id: string, key: string, value: string) {
    const entry = (await this.get(id)).entries.find(
      (entry) => entry.key === key,
    );
    if (!entry) throw new AppError("notFound", 404);
    if (value.trim() && !this.format.validateTranslation(entry.source, value))
      throw new AppError("placeholders");
    if (!(await this.repository.saveTranslation(id, key, value)))
      throw new AppError("notFound", 404);
    return this.get(id);
  }
  async export(id: string) {
    const project = await this.get(id);
    if (
      !project.entries.length ||
      project.entries.some(
        (entry) =>
          !entry.translation.trim() ||
          entry.needsReview ||
          !this.format.validateTranslation(entry.source, entry.translation),
      )
    )
      throw new AppError("incompleteExport", 409);
    return this.format.serialize(
      project.entries.map((entry) => ({
        key: entry.key,
        value: entry.translation,
      })),
    );
  }
}
