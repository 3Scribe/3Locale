import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  output: "server",
  outDir: "./dist-cloudflare",
  cacheDir: "./.astro-cloudflare",
  session: false,
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [react()],
  vite: {
    plugins: [tailwind()],
    resolve: {
      alias: {
        "@runtime": fileURLToPath(
          new URL("./src/server/runtime.cloudflare.ts", import.meta.url),
        ),
      },
    },
  },
});
