import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const labelPath = (path: string[]) =>
  path.map((segment) => JSON.stringify(segment)).join(" › ");
async function translate(page: Page, path: string[], value: string) {
  await page
    .getByLabel(`Translation for ${labelPath(path)}`, { exact: true })
    .fill(value);
  await page
    .getByRole("button", {
      name: `Save translation for ${labelPath(path)}`,
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toHaveText("Translation saved.");
}
async function upload(page: Page, text: string) {
  await page.getByLabel("Base Language JSON file").setInputFiles({
    name: "en.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Base Language strings imported.",
  );
}
async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await pending;
  return {
    name: file.suggestedFilename(),
    data: JSON.parse(await readFile((await file.path())!, "utf8")),
  };
}

test("multiple languages, nested and literal paths, drafts, progress, review and selected exports", async ({
  page,
}) => {
  await page.goto("/");
  const name = `Languages ${Date.now()}`;
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByLabel("Target languages", { exact: true }).fill("fr, de");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await upload(
    page,
    '{"account.name":"Name {{name}}","account":{"name":"Account"}}',
  );
  await expect(
    page.getByText("fr: 0 of 2 strings ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("de: 0 of 2 strings ready", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Translate every string");
  await page
    .getByLabel('Translation for "account.name"', { exact: true })
    .fill("Bonjour {{name}}");
  await page.getByLabel("Editing language").selectOption("de");
  await expect(
    page.getByLabel('Translation for "account.name"', { exact: true }),
  ).toHaveValue("");
  await page.getByLabel("Editing language").selectOption("fr");
  await expect(
    page.getByLabel('Translation for "account.name"', { exact: true }),
  ).toHaveValue("Bonjour {{name}}");
  await translate(page, ["account.name"], "Bonjour {{name}}");
  await page.getByLabel("Show unfinished strings only").check();
  await expect(
    page.getByLabel('Translation for "account.name"', { exact: true }),
  ).toHaveCount(0);
  await translate(page, ["account", "name"], "Compte");
  expect(await download(page)).toEqual({
    name: "fr.json",
    data: { "account.name": "Bonjour {{name}}", account: { name: "Compte" } },
  });
  await page.getByLabel("Editing language").selectOption("de");
  await expect(
    page.getByLabel('Translation for "account.name"', { exact: true }),
  ).toBeVisible();
  await translate(page, ["account.name"], "Hallo {{name}}");
  await translate(page, ["account", "name"], "Konto");
  expect(await download(page)).toEqual({
    name: "de.json",
    data: { "account.name": "Hallo {{name}}", account: { name: "Konto" } },
  });
  await page.getByLabel("New target language", { exact: true }).fill("ar");
  await page.getByRole("button", { name: "Add language", exact: true }).click();
  await expect(
    page.getByText("ar: 0 of 2 strings ready", { exact: true }),
  ).toBeVisible();
  await upload(page, '{"account.name":"New name {{name}}"}');
  await expect(
    page.getByText("fr: 1 of 2 strings ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("de: 1 of 2 strings ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Base text changed — review and save", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Editing language").selectOption("fr");
  await translate(page, ["account.name"], "Nouveau nom {{name}}");
  await expect(
    page.getByText("fr: 2 of 2 strings ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("de: 1 of 2 strings ready", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  await expect(
    page.getByLabel('Translation for "account.name"', { exact: true }),
  ).toHaveValue("Nouveau nom {{name}}");
  await page.getByLabel("Editing language").selectOption("de");
  await expect(
    page.getByLabel('Translation for "account.name"', { exact: true }),
  ).toHaveValue("Hallo {{name}}");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Translate every string");
});

test("Arabic nested editor, language switching and export remain RTL at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page
    .getByLabel("اسم المشروع", { exact: true })
    .fill(`مشروع ${Date.now()}`);
  await page.getByLabel("اللغات المستهدفة", { exact: true }).fill("ar, fr");
  await page.getByRole("button", { name: "إنشاء مشروع", exact: true }).click();
  await page.getByLabel("ملف JSON للغة الأساسية").setInputFiles({
    name: "en.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"رسالة":{"hello":"Hello"}}'),
  });
  await page.getByRole("button", { name: "استيراد JSON", exact: true }).click();
  await page
    .getByLabel('ترجمة "رسالة" › "hello"', { exact: true })
    .fill("مرحبا");
  await page
    .getByRole("button", { name: 'حفظ ترجمة "رسالة" › "hello"', exact: true })
    .click();
  await expect(
    page.getByText("1 من 1 نصوص جاهزة للتصدير", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("لغة التحرير").selectOption("fr");
  await expect(
    page.getByLabel('ترجمة "رسالة" › "hello"', { exact: true }),
  ).toHaveValue("");
  await page.getByLabel("لغة التحرير").selectOption("ar");
  await expect(
    page.getByLabel('ترجمة "رسالة" › "hello"', { exact: true }),
  ).toHaveValue("مرحبا");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
  expect(
    JSON.parse(await readFile((await (await pending).path())!, "utf8")),
  ).toEqual({ رسالة: { hello: "مرحبا" } });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("API validates language membership, entry ownership, and export language", async ({
  request,
}) => {
  const create = async () =>
    (
      await request.post("/api/projects", {
        data: {
          name: "API project",
          baseLanguage: "en",
          targetLanguages: ["fr", "de"],
        },
      })
    ).json();
  const invalid = await request.post("/api/projects", {
    data: { name: "", baseLanguage: "en", targetLanguages: ["fr"] },
  });
  expect(invalid.status()).toBe(400);
  const duplicate = await request.post("/api/projects", {
    data: { name: "Test", baseLanguage: "en", targetLanguages: ["fr", "FR"] },
  });
  expect(duplicate.status()).toBe(400);
  expect((await request.get("/api/projects/invalid")).status()).toBe(400);
  const first = await create();
  const second = await create();
  const imported = await (
    await request.post(`/api/projects/${first.id}`, {
      data: { action: "import", text: '{"a":"A"}' },
    })
  ).json();
  expect(
    (await (await request.get(`/api/projects/${second.id}`)).json()).entries,
  ).toEqual([]);
  const entryId = imported.entries[0].id;
  expect(
    (
      await request.post(`/api/projects/${second.id}`, {
        data: { action: "translate", entryId, language: "fr", value: "X" },
      })
    ).status(),
  ).toBe(404);
  for (const language of ["en", "ja"])
    expect(
      (
        await request.post(`/api/projects/${first.id}`, {
          data: { action: "translate", entryId, language, value: "X" },
        })
      ).status(),
    ).toBe(400);
  expect(
    (await request.get(`/api/projects/${first.id}?export=true`)).status(),
  ).toBe(400);
  expect(
    (
      await request.get(
        `/api/projects/${first.id}?export=true&language=bad_tag`,
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`/api/projects/${first.id}`, {
        data: { action: "addLanguage", language: "fr" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`/api/projects/${first.id}`, {
        data: { action: "addLanguage", language: "ar" },
      })
    ).status(),
  ).toBe(200);
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
  await expect(
    page.getByLabel("Imported project name", { exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Locale files", { exact: true })).toBeDisabled();
  await context.close();
});

for (const locale of ["en", "ar"] as const) {
  test(`multi-file creation, explicit mappings, reconciliation, audit and ZIP (${locale})`, async ({
    page,
  }) => {
    const ar = locale === "ar";
    await page.goto(`/?lang=${locale}`);
    const name = `Batch ${locale} ${Date.now()}`;
    await page
      .getByLabel(ar ? "اسم المشروع المستورد" : "Imported project name", {
        exact: true,
      })
      .fill(name);
    await page
      .getByLabel(ar ? "ملفات الترجمة" : "Locale files", { exact: true })
      .setInputFiles([
        {
          name: "messages.en-gb.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({ "a.b": "Literal", a: { b: "Nested" } }),
          ),
        },
        {
          name: "fr.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({
              "a.b": "Littéral",
              a: { b: "Imbriqué" },
              orphan: "Skip",
            }),
          ),
        },
        {
          name: "ar.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({ "a.b": "حرفي", a: { b: "متداخل" } }),
          ),
        },
      ]);
    await page
      .getByLabel(
        ar
          ? "اللغة الأساسية للمشروع المستورد"
          : "Base Language for imported project",
        { exact: true },
      )
      .fill("en-GB");
    const analyse = page.getByRole("button", {
      name: ar ? "تحليل الملفات" : "Analyse files",
      exact: true,
    });
    await expect(analyse).toBeDisabled();
    for (const file of ["messages.en-gb.json", "fr.json", "ar.json"])
      await page
        .getByLabel(ar ? `تأكيد لغة ${file}` : `Confirm language for ${file}`, {
          exact: true,
        })
        .check();
    await analyse.click();
    const preview = page.getByLabel(
      ar ? "معاينة الاستيراد" : "Import preview",
      { exact: true },
    );
    await expect(preview).toBeVisible();
    await preview
      .getByText(
        ar ? "ترجمات غير مطابقة سيتم تخطيها" : "Unmatched translations to skip",
        { exact: true },
      )
      .click();
    await expect(preview.getByText(/orphan/)).toBeVisible();
    const create = page.getByRole("button", {
      name: ar ? "إنشاء المشروع والاستيراد" : "Create project and import",
      exact: true,
    });
    await expect(create).toBeDisabled();
    await page
      .getByRole("combobox", {
        name: ar ? "سياسة التعارض" : "Conflict policy",
        exact: true,
      })
      .selectOption("keepExisting");
    await create.click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: ar ? "اكتمل الاستيراد" : "Import complete",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel(ar ? 'ترجمة "a.b"' : 'Translation for "a.b"', {
        exact: true,
      }),
    ).toHaveValue("Littéral");
    await page
      .getByRole("region", {
        name: ar ? "سجل المشروع والتصدير" : "Project history and export",
        exact: true,
      })
      .getByRole("button", { name: ar ? "سجل النشاط" : "Audit", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: ar ? "تم استيراد ملفات الترجمة" : "Locale files imported",
        exact: true,
      }),
    ).toBeVisible();
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: ar
          ? "تصدير جميع اللغات الهدف (ZIP)"
          : "Export all target languages (ZIP)",
        exact: true,
      })
      .click();
    expect((await pending).suggestedFilename()).toBe("translations.zip");
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      ar ? "rtl" : "ltr",
    );
  });
}

test("batch API rejects invalid mappings and stale writes, exposes audit, and restores a checkpoint", async ({
  request,
}) => {
  const created = await request.post("/api/projects", {
    data: { name: "Batch API", baseLanguage: "en", targetLanguages: ["fr"] },
  });
  const project = await created.json();
  const endpoint = `/api/projects/${project.id}/imports`;
  const files = [
    { name: "en.json", language: "en", confirmed: true, text: '{"a":"A"}' },
    { name: "fr.json", language: "fr", confirmed: true, text: '{"a":"Un"}' },
  ];
  expect(
    (
      await request.post(endpoint, {
        data: { action: "preview", files: [{ ...files[0], confirmed: false }] },
      })
    ).status(),
  ).toBe(400);
  const preview = await (
    await request.post(endpoint, { data: { action: "preview", files } })
  ).json();
  expect(preview.summary.baseAdded).toBe(1);
  expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(200);
  expect(
    (
      await request.post(endpoint, {
        data: { action: "apply", files, expectedVersion: preview.version },
      })
    ).status(),
  ).toBe(400);
  const applied = await (
    await request.post(endpoint, {
      data: {
        action: "apply",
        files,
        policy: "keepExisting",
        expectedVersion: preview.version,
      },
    })
  ).json();
  expect(applied.project.entries).toHaveLength(1);
  expect(
    (
      await request.post(endpoint, {
        data: {
          action: "apply",
          files,
          policy: "useImported",
          expectedVersion: preview.version,
        },
      })
    ).status(),
  ).toBe(409);
  const events = await (await request.get(`${endpoint}?view=audit`)).json();
  expect(events[0].kind).toBe("batch.imported");
  const revisions = await (
    await request.get(`${endpoint}?view=revisions`)
  ).json();
  const before = revisions.find(
    (revision: { kind: string }) => revision.kind === "beforeImport",
  );
  expect(
    (
      await request.post(endpoint, {
        data: {
          action: "restore",
          revisionId: before.id,
          expectedVersion: applied.project.version,
          confirmed: false,
        },
      })
    ).status(),
  ).toBe(400);
  const restored = await (
    await request.post(endpoint, {
      data: {
        action: "restore",
        revisionId: before.id,
        expectedVersion: applied.project.version,
        confirmed: true,
      },
    })
  ).json();
  expect(restored.entries).toEqual([]);
  expect(
    (await (await request.get(`${endpoint}?view=audit`)).json())[0].kind,
  ).toBe("revision.restored");
  expect(
    (await request.get(`${endpoint}?view=audit&before=invalid`)).status(),
  ).toBe(400);
});
