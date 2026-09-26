import { AppError, type ProjectRepository } from "../domain/model";
import type { TranslationProvider } from "../domain/translation";
export interface InstanceStatus {
  storage: "available" | "unavailable";
  runtime: "node" | "cloudflare";
  provider: {
    id: string;
    displayName: string;
    state: string;
    checkedAt?: string;
  };
}
export class InstanceService {
  constructor(
    private repository: () => Pick<ProjectRepository, "check">,
    private provider: TranslationProvider,
    private runtime: InstanceStatus["runtime"],
  ) {}
  async status(): Promise<InstanceStatus> {
    let storage: InstanceStatus["storage"] = "available";
    try {
      await this.repository().check();
    } catch {
      storage = "unavailable";
    }
    return {
      storage,
      runtime: this.runtime,
      provider: {
        id: this.provider.id,
        displayName: this.provider.displayName,
        state: this.provider.configured ? "unverified" : "missing",
      },
    };
  }
  async checkProvider(confirmed: boolean) {
    if (confirmed !== true) throw new AppError("confirmationRequired");
    const status = await this.status();
    if (!this.provider.configured) return status;
    try {
      await this.provider.checkConfiguration();
      status.provider.state = "ready";
    } catch (error) {
      const allowed = [
        "machineCredentials",
        "machineQuota",
        "machineRateLimit",
        "machineUnavailable",
        "machineMalformedResponse",
      ];
      status.provider.state =
        error instanceof AppError && allowed.includes(error.code)
          ? error.code
          : "machineUnavailable";
    }
    status.provider.checkedAt = new Date().toISOString();
    return status;
  }
}
