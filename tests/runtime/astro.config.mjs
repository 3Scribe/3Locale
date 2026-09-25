import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "astro/config";
import base from "../../astro.config.mjs";
export default defineConfig({
  ...base,
  cacheDir: "./.astro-machine-test",
  vite: {
    ...base.vite,
    resolve: {
      alias: {
        "@runtime": fileURLToPath(new URL("./runtime.ts", import.meta.url)),
      },
    },
  },
});
