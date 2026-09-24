import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4322" },
  webServer: {
    command: "npm run dev -- --port 4322",
    url: "http://127.0.0.1:4322",
    reuseExistingServer: false,
    env: { THREELOCALE_DATABASE_PATH: "data/e2e.db" },
  },
});
