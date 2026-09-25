import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import astro from "eslint-plugin-astro";
export default defineConfig(
  {
    ignores: [
      "dist/**",
      "dist-cloudflare/**",
      ".astro-cloudflare/**",
      ".astro-machine-test/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
      ".astro/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...astro.configs.recommended,
);
