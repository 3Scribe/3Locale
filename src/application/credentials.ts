import { AppError } from "../domain/model";
import type {
  CredentialMetadata,
  ProviderCredential,
  SecretVault,
  SecurityRepository,
} from "../domain/security";
import type { TranslationProvider } from "../domain/translation";
export type ProviderFactory = (
  provider: string,
  secret?: string,
) => TranslationProvider;
export class CredentialService {
  constructor(
    private repository: SecurityRepository,
    private vault: SecretVault,
    private factory: ProviderFactory,
    private now = () => new Date().toISOString(),
  ) {}
  private metadata(v: ProviderCredential): CredentialMetadata {
    return {
      id: v.id,
      provider: v.provider,
      name: v.name,
      version: v.version,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      verifiedAt: v.verifiedAt,
      status: v.status,
      isDefault: v.isDefault,
    };
  }
  async list() {
    return {
      encryptionReady: this.vault.configured,
      credentials: (await this.repository.credentials()).map((v) =>
        this.metadata(v),
      ),
    };
  }
  private async get(id: string) {
    const value = await this.repository.credential(id);
    if (!value) throw new AppError("credentialMissing", 404);
    return value;
  }
  async save(
    name: string,
    secret: string | undefined,
    id?: string,
    version?: number,
  ) {
    if (
      !name.trim() ||
      name.trim().length > 120 ||
      (secret !== undefined &&
        (!secret.trim() || secret.length > 4096 || /[\r\n]/.test(secret)))
    )
      throw new AppError("invalidRequest");
    const previous = id ? await this.get(id) : undefined;
    if (previous && previous.version !== version)
      throw new AppError("staleCredential", 409);
    if (!previous && !secret) throw new AppError("invalidRequest");
    const credentialId = previous?.id ?? crypto.randomUUID(),
      provider = previous?.provider ?? "deepl",
      time = this.now();
    const sealed =
      secret !== undefined
        ? await this.vault.seal(secret.trim(), credentialId, provider)
        : previous!;
    const next: ProviderCredential = {
      ...sealed,
      id: credentialId,
      provider,
      name: name.trim(),
      version: (previous?.version ?? 0) + 1,
      createdAt: previous?.createdAt ?? time,
      updatedAt: time,
      verifiedAt: secret !== undefined ? null : previous!.verifiedAt,
      status: secret !== undefined ? "unverified" : previous!.status,
      isDefault: previous?.isDefault ?? false,
    };
    if (previous) await this.repository.saveCredential(next, previous.version);
    else await this.repository.saveCredential(next);
    return this.metadata(next);
  }
  async remove(id: string, version: number, confirmed: boolean) {
    if (!confirmed) throw new AppError("confirmationRequired");
    await this.repository.deleteCredential(id, version);
  }
  async setDefault(id: string) {
    await this.repository.setDefault(id);
  }
  async verify(id: string, confirmed: boolean) {
    if (!confirmed) throw new AppError("confirmationRequired");
    const value = await this.get(id);
    const secret = await this.vault.open(value);
    let status = "ready";
    try {
      await this.factory(value.provider, secret).checkConfiguration();
    } catch (error) {
      status =
        error instanceof AppError &&
        [
          "machineCredentials",
          "machineQuota",
          "machineRateLimit",
          "machineUnavailable",
          "machineMalformedResponse",
        ].includes(error.code)
          ? error.code
          : "machineUnavailable";
    }
    await this.repository.verifyCredential(
      id,
      value.version,
      status,
      this.now(),
    );
    return this.metadata(await this.get(id));
  }
  async provider() {
    const selected = (await this.repository.credentials()).find(
      (v) => v.provider === "deepl" && v.isDefault,
    );
    const offline = this.factory("deepl");
    // Preview/capability checks never decrypt a secret or contact the provider.
    return {
      id: offline.id,
      displayName: offline.displayName,
      configured: Boolean(selected),
      supports: offline.supports.bind(offline),
      checkConfiguration: async () => {
        if (!selected) throw new AppError("machineNotConfigured");
        const result = await this.verify(selected.id, true);
        if (result.status !== "ready") throw new AppError(result.status);
      },
      translate: async (
        request: Parameters<TranslationProvider["translate"]>[0],
      ) => {
        if (!selected) throw new AppError("machineNotConfigured");
        const current = await this.get(selected.id);
        if (current.version !== selected.version)
          throw new AppError("staleCredential", 409);
        return this.factory(
          current.provider,
          await this.vault.open(current),
        ).translate(request);
      },
    } satisfies TranslationProvider;
  }
}
