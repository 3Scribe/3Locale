import { test, expect } from "@playwright/test";
import type { ProjectDetail } from "../src/domain/model";
for (const locale of ["en", "ar"])
  test(`automatic translation confirmation, provenance and approval (${locale})`, async ({
    page,
    request,
  }) => {
    const created = await request.post("/api/projects", {
      data: {
        name: `Automatic ${locale} ${Date.now()}`,
        baseLanguage: "en",
        targetLanguages: ["fr"],
      },
    });
    const project = (await created.json()) as ProjectDetail;
    const endpoint = `/api/projects/${project.id}`;
    await request.post(endpoint, {
      data: {
        action: "import",
        text: '{"hello":"Hello {name}","save":"Save"}',
      },
    });
    await page.goto(`/?lang=${locale}`);
    await page
      .getByRole("button", {
        name: `${locale === "en" ? "Open" : "فتح"} ${project.name}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: locale === "en" ? "Automatic translation" : "الترجمة الآلية",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: locale === "en" ? "Translate missing" : "ترجمة النصوص الناقصة",
        exact: true,
      })
      .click();
    const confirm = page.getByRole("button", {
      name:
        locale === "en"
          ? "Confirm automatic translation"
          : "تأكيد الترجمة الآلية",
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    expect(
      (
        (await (await request.get(endpoint)).json()) as ProjectDetail
      ).entries.every((entry) =>
        entry.translations.every((value) => value.language !== "fr"),
      ),
    ).toBe(true);
    await page
      .getByRole("checkbox", {
        name:
          locale === "en"
            ? "I confirm sending this text to the provider"
            : "أؤكد إرسال هذه النصوص إلى المزوّد",
        exact: true,
      })
      .check();
    await confirm.click();
    await expect(
      page.getByText(
        locale === "en" ? "Machine translated · fake" : "ترجمة آلية · fake",
        { exact: true },
      ),
    ).toHaveCount(2);
    await expect(
      page
        .getByRole("region", {
          name: locale === "en" ? "Automatic translation" : "الترجمة الآلية",
          exact: true,
        })
        .getByRole("status"),
    ).toContainText(locale === "en" ? "Translated: 2" : "تمت ترجمة: 2");
    expect(
      (await request.get(`${endpoint}?export=true&language=fr`)).status(),
    ).toBe(409);
    await page
      .getByRole("button", {
        name:
          locale === "en"
            ? 'Approve translation for "hello"'
            : 'اعتماد الترجمة للمفتاح "hello"',
        exact: true,
      })
      .click();
    const bulk = page.getByRole("button", {
      name:
        locale === "en"
          ? "Approve all machine translations"
          : "اعتماد جميع الترجمات الآلية",
      exact: true,
    });
    await expect(bulk).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name:
          locale === "en"
            ? /I have reviewed these 1 machine translations/
            : /راجعت هذه الترجمات الآلية وعددها 1/,
      })
      .check();
    await bulk.click();
    await expect
      .poll(async () =>
        (await request.get(`${endpoint}?export=true&language=fr`)).status(),
      )
      .toBe(200);
    const saved = (await (await request.get(endpoint)).json()) as ProjectDetail;
    expect(
      saved.entries
        .flatMap((entry) => entry.translations)
        .filter((value) => value.language === "fr")
        .every(
          (value) =>
            value.origin === "machine" &&
            value.originProvider === "fake" &&
            !value.needsReview,
        ),
    ).toBe(true);
    const label = locale === "en" ? 'Translation for "hello"' : 'ترجمة "hello"';
    // The editor's accessible labels are localised independently of the provider.
    const editor = page.getByLabel(label, { exact: true });
    await editor.fill("Manual {name}");
    await page
      .getByRole("button", {
        name:
          locale === "en"
            ? 'Save translation for "hello"'
            : 'حفظ ترجمة "hello"',
        exact: true,
      })
      .click();
    await expect
      .poll(async () => {
        const p = (await (await request.get(endpoint)).json()) as ProjectDetail;
        return p.entries
          .find((entry) => entry.path[0] === "hello")!
          .translations.find((value) => value.language === "fr")!.origin;
      })
      .toBe("manual");
    if (locale === "ar")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
test("HTTP validates explicit confirmation and selection without exposing provider configuration", async ({
  request,
}) => {
  const p = (await (
    await request.post("/api/projects", {
      data: { name: "HTTP", baseLanguage: "en", targetLanguages: ["fr"] },
    })
  ).json()) as ProjectDetail;
  const root = `/api/projects/${p.id}`,
    endpoint = `${root}/machine`;
  await request.post(root, {
    data: { action: "import", text: '{"a":"Hello"}' },
  });
  const current = (await (await request.get(root)).json()) as ProjectDetail;
  const preview = await request.post(endpoint, {
    data: { action: "preview", language: "fr" },
  });
  expect(preview.ok()).toBe(true);
  expect(await preview.json()).toMatchObject({
    provider: "fake",
    configured: true,
    summary: { eligible: 1 },
  });
  for (const data of [
    {
      action: "apply",
      language: "fr",
      expectedVersion: current.version,
      provider: "fake",
    },
    {
      action: "apply",
      language: "fr",
      expectedVersion: current.version,
      provider: "fake",
      confirmed: false,
    },
    { action: "approve", language: "fr", expectedVersion: current.version },
    { action: "preview", language: "fr", entryIds: [1, 1] },
    { action: "preview", language: "en" },
    { action: "preview", language: "fr", apiKey: "must-not-be-accepted" },
  ])
    expect((await request.post(endpoint, { data })).status()).toBe(400);
  const translated = await request.post(endpoint, {
    data: {
      action: "apply",
      language: "fr",
      entryIds: [current.entries[0].id],
      expectedVersion: current.version,
      provider: "fake",
      confirmed: true,
    },
  });
  expect(translated.ok()).toBe(true);
  const next = ((await translated.json()) as { project: ProjectDetail })
    .project;
  expect(
    (
      await request.post(endpoint, {
        data: {
          action: "approve",
          language: "fr",
          entryIds: [next.entries[0].id],
          expectedVersion: next.version,
          confirmed: true,
        },
      })
    ).ok(),
  ).toBe(true);
  const body = await (await request.get(`${root}/imports?view=audit`)).text();
  expect(body).toContain("machine.translation.completed");
  expect(body).not.toContain("API_KEY");
});
