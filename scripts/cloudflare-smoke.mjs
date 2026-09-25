import process from "node:process";
import { spawnSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
// A fresh database for every smoke run; use the same persistence directory for both commands.
await mkdir(resolve(".wrangler"), { recursive: true });
const persistence = await mkdtemp(resolve(".wrangler/smoke-"));
const cli = resolve("node_modules/wrangler/bin/wrangler.js");
const migration = spawnSync(
  process.execPath,
  [
    cli,
    "d1",
    "migrations",
    "apply",
    "THREELOCALE_DB",
    "--local",
    "--persist-to",
    persistence,
  ],
  { stdio: "inherit" },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const server = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--config",
    "dist-cloudflare/server/wrangler.json",
    "--local",
    "--persist-to",
    persistence,
    "--ip",
    "127.0.0.1",
    "--port",
    "4323",
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("exit", async (code) => {
  if (!persistence.startsWith(resolve(".wrangler") + sep))
    throw new Error("Unexpected smoke database path");
  await rm(persistence, { recursive: true, force: true });
  process.exit(code ?? 0);
});
