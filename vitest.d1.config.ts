import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/d1/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
