import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("create, import, translate, reload, filter, and export", async ({
  page,
}) => {
  await page.goto("/");
  const name = `Browser project ${Date.now()}`;
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByLabel("Target language", { exact: true }).fill("fr");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByLabel("Source JSON file").setInputFiles({
    name: "en.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":"Hello {{name}}","bye":"Goodbye"}'),
  });
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  await expect(page.getByText("0 of 2 strings ready to export")).toBeVisible();
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Translate every string");
  await page
    .getByLabel("Translation for hello", { exact: true })
    .fill("Bonjour {{name}}");
  await page
    .getByRole("button", { name: "Save translation for hello", exact: true })
    .click();
  await expect(page.getByText("1 of 2 strings ready to export")).toBeVisible();
  await page.getByLabel("Show unfinished strings only").check();
  await expect(
    page.getByLabel("Translation for hello", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Translation for bye", { exact: true })
    .fill("Au revoir");
  await page
    .getByRole("button", { name: "Save translation for bye", exact: true })
    .click();
  await expect(page.getByText("2 of 2 strings ready to export")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  await expect(
    page.getByLabel("Translation for hello", { exact: true }),
  ).toHaveValue("Bonjour {{name}}");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const result = await download;
  expect(JSON.parse(await readFile((await result.path())!, "utf8"))).toEqual({
    bye: "Au revoir",
    hello: "Bonjour {{name}}",
  });
});

test("Arabic interface and translated text work in RTL at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const name = `مشروع ${Date.now()}`;
  await page.getByLabel("اسم المشروع", { exact: true }).fill(name);
  await page.getByLabel("اللغة المستهدفة", { exact: true }).fill("ar");
  await page.getByRole("button", { name: "إنشاء مشروع", exact: true }).click();
  await page.getByLabel("ملف JSON المصدر").setInputFiles({
    name: "en.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":"Hello"}'),
  });
  await page.getByRole("button", { name: "استيراد JSON", exact: true }).click();
  await page.getByLabel("ترجمة hello", { exact: true }).fill("مرحبا");
  await page
    .getByRole("button", { name: "حفظ ترجمة hello", exact: true })
    .click();
  await expect(page.getByText("1 من 1 نصوص جاهزة للتصدير")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("API validates requests and keeps one project isolated from another", async ({
  request,
}) => {
  const invalid = await request.post("/api/projects", {
    data: { name: "", sourceLanguage: "en", targetLanguage: "fr" },
  });
  expect(invalid.status()).toBe(400);
  const missing = await request.get("/api/projects/invalid");
  expect(missing.status()).toBe(400);
  const create = async () =>
    (
      await request.post("/api/projects", {
        data: {
          name: "API project",
          sourceLanguage: "en",
          targetLanguage: "fr",
        },
      })
    ).json();
  const first = await create();
  const second = await create();
  await request.post(`/api/projects/${first.id}`, {
    data: { action: "import", text: '{"a":"A"}' },
  });
  const detail = await request.get(`/api/projects/${second.id}`);
  expect((await detail.json()).entries).toEqual([]);
  const unknown = await request.post(`/api/projects/${first.id}`, {
    data: { action: "translate", key: "missing", value: "x" },
  });
  expect(unknown.status()).toBe(404);
});

test("project creation stays disabled before client hydration", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Project name", { exact: true })).toBeDisabled();
  await context.close();
});
