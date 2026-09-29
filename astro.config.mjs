import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  output: "server",
  devToolbar: { enabled: process.env.THREELOCALE_BROWSER_TEST !== "1" },
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwind()],
    resolve: {
      alias: {
        "@runtime": fileURLToPath(
          new URL("./src/server/runtime.ts", import.meta.url),
        ),
      },
    },
  },
});
