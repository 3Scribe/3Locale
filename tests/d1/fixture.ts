import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";
import { AppError, type ProjectRepository } from "../../src/domain/model";

export async function d1Fixture(migrationCount = Number.POSITIVE_INFINITY) {
  const modules: Record<string, { type: "esm"; contents: string }> = {};
  for (const name of [
    "src/persistence/d1",
    "src/persistence/delta",
    "src/domain/model",
  ]) {
    modules[name] = {
      type: "esm",
      contents: ts.transpileModule(await readFile(`${name}.ts`, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  }
  modules["index.js"] = {
    type: "esm",
    contents: `
import { D1ProjectRepository } from './src/persistence/d1';
export default {async fetch(request,env) {
 try {
  const {method,args}=await request.json();
  const repository=new D1ProjectRepository(env.THREELOCALE_DB);
  const value=method==='sql' ? await env.THREELOCALE_DB.batch(args.map(sql=>env.THREELOCALE_DB.prepare(sql))) : await repository[method](...args);
  return Response.json({value});
 }catch(error){return Response.json({error:{message:error.message,code:error.code,status:error.status}}, {status:500});}
}};`,
  };
  // Run the adapter inside workerd; Node's binding proxy is not needed for these tests.
  const mf = new Miniflare({
    cf: false,
    workers: [
      {
        config: {
          name: "contract",
          compatibilityDate: "2026-09-25",
          manifest: { mainModule: "index.js", modules },
          env: { THREELOCALE_DB: { type: "d1", id: "contract" } },
        },
      },
    ],
  });
  async function invoke<T>(method: string, args: unknown[]): Promise<T> {
    const response = await mf.dispatchFetch("http://contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, args }),
    });
    const result = (await response.json()) as {
      value: T;
      error?: { message: string; code?: string; status: number };
    };
    if (result.error) {
      if (result.error.code)
        throw new AppError(result.error.code, result.error.status);
      throw new Error(result.error.message);
    }
    return result.value;
  }
  const repository: ProjectRepository = {
    list: () => invoke("list", []),
    get: (id) => invoke("get", [id]),
    commit: (change) => invoke("commit", [change]),
    audit: (id, before) =>
      invoke("audit", before === undefined ? [id] : [id, before]),
    revisions: (id) => invoke("revisions", [id]),
    revision: (id, revision) => invoke("revision", [id, revision]),
  };
  try {
    for (const name of (await readdir("migrations/d1"))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .slice(0, migrationCount))
      await invoke(
        "sql",
        unstable_splitSqlQuery(await readFile(`migrations/d1/${name}`, "utf8")),
      );
    return {
      repository,
      async applyMigration(name: string) {
        await invoke(
          "sql",
          unstable_splitSqlQuery(
            await readFile(`migrations/d1/${name}`, "utf8"),
          ),
        );
      },
      async execute(sql: string) {
        await invoke("sql", [sql]);
      },
      async query<T>(sql: string) {
        return (await invoke<{ results: T[] }[]>("sql", [sql]))[0].results;
      },
      async close() {
        await mf.dispose();
      },
    };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
