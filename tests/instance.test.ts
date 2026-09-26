import { handle } from "../src/server/http";
import { expect, it, vi } from "vitest";
import { InstanceService } from "../src/application/instance";
import { FakeTranslationProvider } from "./helpers/fake-provider";
import { AppError } from "../src/domain/model";
it("reports storage and optional provider state without contacting the provider", async () => {
  const provider = new FakeTranslationProvider(),
    check = vi.spyOn(provider, "checkConfiguration");
  const service = new InstanceService(
    () => ({ check: async () => {} }),
    provider,
    "node",
  );
  expect(await service.status()).toMatchObject({
    storage: "available",
    provider: { state: "unverified" },
  });
  expect(check).not.toHaveBeenCalled();
  await expect(service.checkProvider(false)).rejects.toThrow(
    "confirmationRequired",
  );
  expect(check).not.toHaveBeenCalled();
  expect(await service.checkProvider(true)).toMatchObject({
    provider: { state: "ready" },
  });
  provider.configured = false;
  expect(await service.checkProvider(true)).toMatchObject({
    provider: { state: "missing" },
  });
  expect(check).toHaveBeenCalledTimes(1);
});
it("reports migration/setup failures without leaking exception details", async () => {
  const provider = new FakeTranslationProvider();
  const service = new InstanceService(
    () => {
      throw new Error("secret database path");
    },
    provider,
    "cloudflare",
  );
  expect(await service.status()).toMatchObject({ storage: "unavailable" });
  provider.checkConfiguration = async () => {
    throw new Error("secret API key");
  };
  const result = await service.checkProvider(true);
  expect(result.provider.state).toBe("machineUnavailable");
  expect(JSON.stringify(result)).not.toContain("secret");
  provider.checkConfiguration = async () => {
    throw new AppError("machineCredentials");
  };
  expect((await service.checkProvider(true)).provider.state).toBe(
    "machineCredentials",
  );
});

it("unknown HTTP failures never expose raw exception payloads in responses or logs", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await handle(() => {
      throw new Error("private credential detail");
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "unexpected" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private credential");
  } finally {
    log.mockRestore();
  }
});
