import { securityContract } from "../contracts/security";
import { d1Fixture } from "./fixture";
securityContract("D1", d1Fixture);
import { expect, it } from "vitest";
import { WebCryptoVault, encode } from "../../src/providers/credential-crypto";
it("encrypts and decrypts compatibly across Node and real workerd", async () => {
  const f = await d1Fixture();
  try {
    const key = encode(crypto.getRandomValues(new Uint8Array(32))),
      id = crypto.randomUUID(),
      provider = "deepl",
      secret = "synthetic-interoperability-key";
    const metadata = {
      id,
      provider,
      name: "Key",
      createdAt: "2026",
      updatedAt: "2026",
      verifiedAt: null,
      status: "unverified",
      isDefault: false,
      version: 1,
    };
    const node = new WebCryptoVault(key),
      workerSealed = await f.crypto.seal(key, secret, id, provider);
    expect(await node.open({ ...metadata, ...workerSealed })).toBe(secret);
    const nodeSealed = await node.seal(secret, id, provider);
    expect(await f.crypto.open(key, { ...metadata, ...nodeSealed })).toBe(
      secret,
    );
    await expect(
      f.crypto.open(key, {
        ...metadata,
        ...nodeSealed,
        id: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "credentialDecryption" });
  } finally {
    await f.close();
  }
});
