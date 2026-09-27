import { describe, it, expect } from "vitest";
import type { SecurityRepository } from "../../src/domain/security";
import {
  AuthenticationService,
  type AuthenticationPrimitives,
  authorizeOwner,
} from "../../src/application/authentication";
import { CredentialService } from "../../src/application/credentials";
import {
  WebCryptoVault,
  encode,
  randomToken,
  tokenHash,
} from "../../src/providers/credential-crypto";
import { AppError } from "../../src/domain/model";
import { FakeTranslationProvider } from "../helpers/fake-provider";
type Fixture = { security: SecurityRepository; close(): Promise<void> };
const material = () => encode(crypto.getRandomValues(new Uint8Array(32)));
function primitives(): AuthenticationPrimitives {
  return {
    token: randomToken,
    hash: tokenHash,
    registration: async () => ({ challenge: randomToken(), options: {} }),
    authentication: async () => ({ challenge: randomToken(), options: {} }),
    register: async () => ({
      credentialId: randomToken(),
      publicKey: "test-public-key",
      counter: 0,
    }),
    authenticate: async () => 1,
  };
}
export function securityContract(
  name: string,
  fixture: () => Promise<Fixture>,
) {
  describe(`${name} community security`, () => {
    it("preserves secret and verification on rename and propagates a failed default check", async () => {
      const f = await fixture();
      try {
        const service = new CredentialService(
          f.security,
          new WebCryptoVault(material()),
          () => {
            const provider = new FakeTranslationProvider();
            provider.checkConfiguration = async () => {
              throw new AppError("machineCredentials");
            };
            return provider;
          },
        );
        const created = await service.save("Original", "synthetic-rename-key");
        await service.verify(created.id, true);
        const before = (await f.security.credential(created.id))!;
        const renamed = await service.save(
          "Renamed",
          undefined,
          created.id,
          created.version,
        );
        const after = (await f.security.credential(created.id))!;
        expect(after.ciphertext).toBe(before.ciphertext);
        expect(after.iv).toBe(before.iv);
        expect(renamed.status).toBe("machineCredentials");
        expect(renamed.verifiedAt).toBe(before.verifiedAt);
        await service.setDefault(created.id);
        await expect(
          (await service.provider()).checkConfiguration(),
        ).rejects.toMatchObject({ code: "machineCredentials" });
      } finally {
        await f.close();
      }
    });
    it("allows exactly one concurrent first owner and rejects subsequent registration", async () => {
      const f = await fixture();
      try {
        const auth = new AuthenticationService(f.security, primitives());
        expect(await auth.status()).toMatchObject({
          setup: true,
          authenticated: false,
        });
        const [a, b] = await Promise.all([
          auth.begin("setup", "First"),
          auth.begin("setup", "Second"),
        ]);
        const results = await Promise.allSettled([
          auth.finish(a.token, "setup", {}),
          auth.finish(b.token, "setup", {}),
        ]);
        expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((v) => v.status === "rejected")).toHaveLength(1);
        await expect(auth.begin("setup", "Third")).rejects.toMatchObject({
          code: "setupComplete",
        });
        expect(await auth.status()).toMatchObject({
          setup: false,
          authenticated: false,
        });
      } finally {
        await f.close();
      }
    });
    it("consumes challenges once, expires them, hashes sessions and revokes logout", async () => {
      const f = await fixture();
      try {
        let now = 1000;
        const auth = new AuthenticationService(
          f.security,
          primitives(),
          () => now,
        );
        const start = await auth.begin("setup", "Owner"),
          token = await auth.finish(start.token, "setup", {});
        expect(authorizeOwner(await auth.identity(token)).ownerId).toBe(
          (await f.security.owner())!.id,
        );
        expect(await f.security.findSession(token, now)).toBeUndefined();
        expect(
          await f.security.findSession(await tokenHash(token), now),
        ).toBeDefined();
        await expect(
          auth.finish(start.token, "setup", {}),
        ).rejects.toMatchObject({ code: "authenticationFailed" });
        await auth.logout(token);
        expect(await auth.identity(token)).toBeUndefined();
        expect(() => authorizeOwner(undefined)).toThrow();
        const login = await auth.begin("login"),
          signedIn = await auth.finish(login.token, "login", {});
        expect(await auth.identity(signedIn)).toBeDefined();
        const expired = await auth.begin("login");
        now += 300001;
        await expect(
          auth.finish(expired.token, "login", {}),
        ).rejects.toMatchObject({ code: "authenticationFailed" });
        now += 7 * 86400000;
        expect(await auth.identity(signedIn)).toBeUndefined();
      } finally {
        await f.close();
      }
    });
    it("never creates an owner or session when passkey verification fails", async () => {
      const f = await fixture();
      try {
        const p = primitives();
        p.register = async () => {
          throw new AppError("authenticationFailed", 401);
        };
        const auth = new AuthenticationService(f.security, p),
          start = await auth.begin("setup", "Owner");
        await expect(
          auth.finish(start.token, "setup", {}),
        ).rejects.toMatchObject({ code: "authenticationFailed" });
        expect(await f.security.owner()).toBeUndefined();
        await expect(
          auth.finish(start.token, "setup", {}),
        ).rejects.toMatchObject({ code: "authenticationFailed" });
      } finally {
        await f.close();
      }
    });
    it("isolates multiple credentials, requires an explicit default, and persists only ciphertext", async () => {
      const f = await fixture();
      try {
        const vault = new WebCryptoVault(material()),
          seen: string[] = [];
        const service = new CredentialService(
          f.security,
          vault,
          (_provider, secret) => {
            const provider = new FakeTranslationProvider();
            provider.translate = async (request) => {
              seen.push(secret!);
              return {
                items: request.items.map((v) => ({ id: v.id, text: v.text })),
              };
            };
            return provider;
          },
        );
        const a = await service.save("Company", "synthetic-company-key"),
          b = await service.save("Personal", "synthetic-personal-key");
        expect(a.id).not.toBe(b.id);
        expect((await service.list()).credentials).toHaveLength(2);
        const stored = await f.security.credential(a.id);
        expect(JSON.stringify(stored)).not.toContain("synthetic-company-key");
        expect(await vault.open(stored!)).toBe("synthetic-company-key");
        expect(JSON.stringify(await service.list())).not.toMatch(
          /ciphertext|"iv"|synthetic-/,
        );
        expect((await service.provider()).configured).toBe(false);
        const request = {
          sourceLanguage: "en",
          targetLanguage: "fr",
          items: [],
        };
        await expect(
          (await service.provider()).translate(request),
        ).rejects.toMatchObject({ code: "machineNotConfigured" });
        await service.setDefault(a.id);
        await (await service.provider()).translate(request);
        expect(seen).toEqual(["synthetic-company-key"]);
        const before = await f.security.credential(a.id);
        await Promise.all([service.setDefault(a.id), service.setDefault(b.id)]);
        expect(
          (await service.list()).credentials.filter((v) => v.isDefault),
        ).toHaveLength(1);
        expect((await f.security.credential(a.id))!.ciphertext).toBe(
          before!.ciphertext,
        );
        await service.setDefault(b.id);
        await (await service.provider()).translate(request);
        expect(seen.at(-1)).toBe("synthetic-personal-key");
        const bBefore = await f.security.credential(b.id);
        const changed = await service.save(
          "Company renamed",
          "synthetic-replaced-key",
          a.id,
          a.version,
        );
        expect(await f.security.credential(b.id)).toEqual(bBefore);
        expect(await vault.open((await f.security.credential(a.id))!)).toBe(
          "synthetic-replaced-key",
        );
        await expect(
          service.remove(a.id, a.version, true),
        ).rejects.toMatchObject({ code: "staleCredential" });
        await service.remove(a.id, changed.version, true);
        expect(await f.security.credential(b.id)).toEqual(bBefore);
        await service.remove(b.id, b.version, true);
        expect((await service.provider()).configured).toBe(false);
      } finally {
        await f.close();
      }
    });
    it("binds ciphertext to its credential and provider and fails safely with lost keys", async () => {
      const f = await fixture();
      try {
        const vault = new WebCryptoVault(material()),
          service = new CredentialService(
            f.security,
            vault,
            () => new FakeTranslationProvider(),
          );
        const created = await service.save("Key", "synthetic-secret"),
          row = (await f.security.credential(created.id))!;
        await expect(
          new WebCryptoVault(material()).open(row),
        ).rejects.toMatchObject({ code: "credentialDecryption" });
        await expect(
          vault.open({ ...row, id: crypto.randomUUID() }),
        ).rejects.toMatchObject({ code: "credentialDecryption" });
        await expect(
          vault.open({ ...row, provider: "other" }),
        ).rejects.toMatchObject({ code: "credentialDecryption" });
        await expect(new WebCryptoVault("bad").open(row)).rejects.toMatchObject(
          { code: "encryptionConfiguration" },
        );
        expect(await f.security.credential(created.id)).toEqual(row);
      } finally {
        await f.close();
      }
    });
    it("verifies only the selected version without leaking provider errors", async () => {
      const f = await fixture();
      try {
        let release: () => void = () => {};
        let pause = false;
        const seen: string[] = [];
        const service = new CredentialService(
          f.security,
          new WebCryptoVault(material()),
          (_provider, secret) => {
            const p = new FakeTranslationProvider();
            p.checkConfiguration = async () => {
              seen.push(secret!);
              if (pause)
                await new Promise<void>((resolve) => {
                  release = resolve;
                });
              if (secret === "synthetic-bad") throw new Error(secret);
            };
            return p;
          },
        );
        const a = await service.save("A", "synthetic-good"),
          b = await service.save("B", "synthetic-bad");
        expect((await service.verify(a.id, true)).status).toBe("ready");
        expect(
          (await service.list()).credentials.find((v) => v.id === b.id)!.status,
        ).toBe("unverified");
        expect((await service.verify(b.id, true)).status).toBe(
          "machineUnavailable",
        );
        expect(seen).toEqual(["synthetic-good", "synthetic-bad"]);
        pause = true;
        const pending = service.verify(a.id, true);
        await new Promise<void>((resolve) => {
          const wait = () =>
            seen.length === 3 ? resolve() : setTimeout(wait, 1);
          wait();
        });
        const updated = await service.save(
          "A",
          "synthetic-new",
          a.id,
          a.version,
        );
        release();
        await expect(pending).rejects.toMatchObject({
          code: "staleCredential",
        });
        expect(updated.status).toBe("unverified");
      } finally {
        await f.close();
      }
    });
  });
}
