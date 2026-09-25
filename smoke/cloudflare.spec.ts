import { test, expect } from "@playwright/test";
import type { ProjectDetail, Revision, AuditEvent } from "../src/domain/model";
test("built Worker serves hydrated RTL UI and persists import, edit, export and recovery through D1", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Project name", { exact: true }).fill("Worker smoke");
  await page.getByLabel("Target languages", { exact: true }).fill("fr, ar");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Worker smoke", exact: true }),
  ).toBeVisible();
  const projects = (await (
    await request.get("/api/projects")
  ).json()) as ProjectDetail[];
  const id = projects[0].id,
    endpoint = `/api/projects/${id}`;
  const machineStatus = await request.post(endpoint + "/machine", {
    data: { action: "preview", language: "fr" },
  });
  expect(machineStatus.ok()).toBe(true);
  expect(await machineStatus.json()).toMatchObject({
    provider: "deepl",
    configured: false,
    supported: true,
  });
  const files = [
    {
      name: "en.json",
      language: "en",
      confirmed: true,
      text: '{"a.b":"Hello {name}","a":{"b":"Save"}}',
    },
    {
      name: "fr.json",
      language: "fr",
      confirmed: true,
      text: '{"a.b":"Bonjour {name}","a":{"b":"Enregistrer"}}',
    },
    {
      name: "ar.json",
      language: "ar",
      confirmed: true,
      text: '{"a.b":"مرحبا {name}","a":{"b":"حفظ"}}',
    },
  ];
  const preview = await request.post(`${endpoint}/imports`, {
    data: { action: "preview", files },
  });
  expect(preview.ok()).toBe(true);
  const applied = await request.post(`${endpoint}/imports`, {
    data: {
      action: "apply",
      files,
      policy: "keepExisting",
      expectedVersion: projects[0].version,
    },
  });
  expect(applied.ok()).toBe(true);
  const imported = ((await applied.json()) as { project: ProjectDetail })
    .project;
  const revisions = (await (
    await request.get(`${endpoint}/imports?view=revisions`)
  ).json()) as Revision[];
  const edit = await request.post(endpoint, {
    data: {
      action: "translate",
      entryId: imported.entries.find((entry) => entry.path.length === 2)!.id,
      language: "fr",
      value: "Sauvegarder",
    },
  });
  expect(edit.ok()).toBe(true);
  expect(
    await (await request.get(`${endpoint}?export=true&language=fr`)).json(),
  ).toEqual({ "a.b": "Bonjour {name}", a: { b: "Sauvegarder" } });
  const zip = await request.get(`${endpoint}/imports?view=archive`);
  expect(zip.ok()).toBe(true);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  const stale = await request.post(`${endpoint}/imports`, {
    data: {
      action: "apply",
      files,
      policy: "keepExisting",
      expectedVersion: imported.version,
    },
  });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toEqual({ error: "stalePreview" });
  const current = (await edit.json()) as ProjectDetail;
  const restored = await request.post(`${endpoint}/imports`, {
    data: {
      action: "restore",
      revisionId: revisions[0].id,
      expectedVersion: current.version,
      confirmed: true,
    },
  });
  expect(restored.ok()).toBe(true);
  expect(
    await (await request.get(`${endpoint}?export=true&language=fr`)).json(),
  ).toEqual({ "a.b": "Bonjour {name}", a: { b: "Enregistrer" } });
  const audit = (await (
    await request.get(`${endpoint}/imports?view=audit`)
  ).json()) as AuditEvent[];
  expect(audit[0].kind).toBe("revision.restored");
  await page.goto("/?lang=ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "Worker smoke" }).click();
  await expect(
    page.getByRole("heading", { name: "Worker smoke", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
