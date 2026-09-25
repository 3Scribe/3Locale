import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./smoke",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4323" },
  webServer: {
    command: "node scripts/cloudflare-smoke.mjs",
    url: "http://127.0.0.1:4323",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
