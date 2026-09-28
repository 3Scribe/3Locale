import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./machine-e2e",
  workers: 1,
  metadata: { machine: true },
  use: { baseURL: "http://localhost:4324" },
  webServer: {
    command:
      "npx astro dev --config tests/runtime/astro.config.mjs --host 127.0.0.1 --port 4324",
    url: "http://localhost:4324",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      THREELOCALE_DATABASE_PATH: `data/machine-e2e-${randomUUID()}.db`,
      THREELOCALE_ORIGIN: "http://localhost:4324",
      THREELOCALE_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    },
  },
});
