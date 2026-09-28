import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://localhost:4322" },
  webServer: {
    command: "npm run dev -- --port 4322",
    url: "http://localhost:4322",
    reuseExistingServer: false,
    env: {
      THREELOCALE_DATABASE_PATH: `data/e2e-${randomUUID()}.db`,
      THREELOCALE_ORIGIN: "http://localhost:4322",
      THREELOCALE_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    },
  },
});
