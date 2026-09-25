import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./machine-e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4324" },
  webServer: {
    command:
      "npx astro dev --config tests/runtime/astro.config.mjs --host 127.0.0.1 --port 4324",
    url: "http://127.0.0.1:4324",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
