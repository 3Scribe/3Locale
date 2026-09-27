import { AppError } from "../domain/model";
import type {
  ProviderCredential,
  SecretVault,
  SealedSecret,
} from "../domain/security";
export const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));
export const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export const randomToken = () =>
  encode(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export async function tokenHash(value: string) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export class WebCryptoVault implements SecretVault {
  readonly configured: boolean;
  constructor(private material?: string) {
    this.configured = Boolean(
      material && /^[A-Za-z0-9+/]{43}=$/.test(material),
    );
  }
  private async key() {
    if (!this.configured) throw new AppError("encryptionConfiguration", 503);
    return crypto.subtle.importKey(
      "raw",
      decode(this.material!),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
  }
  private context(id: string, provider: string) {
    return new TextEncoder().encode(
      JSON.stringify(["3Locale-community-credentials-v1", id, provider]),
    );
  }
  async seal(
    value: string,
    id: string,
    provider: string,
  ): Promise<SealedSecret> {
    const key = await this.key(),
      iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: this.context(id, provider) },
      key,
      new TextEncoder().encode(value),
    );
    return {
      ciphertext: encode(new Uint8Array(ciphertext)),
      iv: encode(iv),
      algorithm: "AES-256-GCM-v1",
    };
  }
  async open(value: ProviderCredential) {
    const key = await this.key();
    try {
      if (value.algorithm !== "AES-256-GCM-v1") throw new Error();
      return new TextDecoder().decode(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: decode(value.iv),
            additionalData: this.context(value.id, value.provider),
          },
          key,
          decode(value.ciphertext),
        ),
      );
    } catch {
      throw new AppError("credentialDecryption", 503);
    }
  }
}
