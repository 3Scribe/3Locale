import { test, expect } from "../tests/helpers/browser-auth";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import en from "../src/i18n/en.json" with { type: "json" };
import ar from "../src/i18n/ar.json" with { type: "json" };
import type { ProjectDetail } from "../src/domain/model";
for (const [locale, t] of [
  ["en", en],
  ["ar", ar],
] as const)
  test(`setup, draft export and housekeeping (${locale})`, async ({
    page,
    request,
  }) => {
    if (locale === "ar")
      await page.setViewportSize({ width: 390, height: 844 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const created = await request.post("/api/projects", {
      data: {
        name: `Housekeeping ${locale} ${Date.now()}`,
        baseLanguage: "en",
        targetLanguages: ["fr", "ar"],
      },
    });
    let project = (await created.json()) as ProjectDetail;
    const endpoint = `/api/projects/${project.id}`;
    project = await (
      await request.post(endpoint, {
        data: {
          action: "import",
          text: '{"greeting":"Hello {name}","save":"Save"}',
        },
      })
    ).json();
    await page.goto(`/?lang=${locale}`);
    await expect(
      page.getByText(t.setup.storage.available, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        t.machine.provider.replace("{{provider}}", "DeepL") +
          " · " +
          t.setup.states.missing,
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByText(t.setup.instructions, { exact: true }).click();
    await expect(
      page.getByRole("button", { name: t.setup.check, exact: true }),
    ).toBeDisabled();
    await expect(page.getByText(t.setup.node, { exact: true })).toBeVisible();
    await page
      .getByRole("button", {
        name: t.openProject.replace("{{name}}", project.name),
        exact: true,
      })
      .click();
    await page
      .getByLabel(t.translationFor.replace("{{key}}", '"save"'), {
        exact: true,
      })
      .fill("Enregistrer");
    await page
      .getByRole("button", {
        name: t.saveFor.replace("{{key}}", '"save"'),
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toHaveText(t.saved);
    await page.getByText(t.draft.title, { exact: true }).click();
    const draft = page.getByRole("button", {
      name: t.draft.download,
      exact: true,
    });
    await expect(draft).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: t.draft.confirm.replace("{{language}}", "fr"),
        exact: true,
      })
      .check();
    const pending = page.waitForEvent("download");
    await draft.click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("fr.draft.zip");
    const files = unzipSync(await readFile((await download.path())!));
    expect(JSON.parse(strFromU8(files["fr.draft.json"]))).toEqual({
      greeting: "",
      save: "Enregistrer",
    });
    expect(JSON.parse(strFromU8(files["DRAFT-manifest.json"]))).toMatchObject({
      draft: true,
      ready: 1,
      total: 2,
    });
    await page.getByText(t.manage.title, { exact: true }).click();
    await page.screenshot({
      path: test.info().outputPath("housekeeping.png"),
      fullPage: true,
    });
    const newName = project.name + " renamed";
    await page.getByLabel(t.manage.name, { exact: true }).fill(newName);
    await page
      .getByRole("button", { name: t.manage.rename, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: newName, exact: true }),
    ).toBeVisible();
    await page.getByText(t.manage.title, { exact: true }).click();
    await page
      .getByRole("combobox", { name: t.manage.language, exact: true })
      .selectOption("fr");
    const remove = page.getByRole("button", {
      name: t.manage.remove,
      exact: true,
    });
    await expect(remove).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: t.manage.removeConfirm.replace("{{language}}", "fr"),
        exact: true,
      })
      .check();
    await remove.click();
    await expect(
      page.getByRole("combobox", { name: t.editingLanguage, exact: true }),
    ).toHaveValue("ar");
    await page.getByText(t.manage.title, { exact: true }).click();
    await expect(
      page.getByText(t.errors.lastTargetLanguage, { exact: true }),
    ).toBeVisible();
    const deletion = page.getByRole("button", {
      name: t.manage.delete,
      exact: true,
    });
    await expect(deletion).toBeDisabled();
    await page
      .getByLabel(t.manage.typeName.replace("{{name}}", newName), {
        exact: true,
      })
      .fill(newName);
    await deletion.click();
    await expect(page.getByRole("status")).toHaveText(t.manage.deleted);
    expect((await request.get(endpoint)).status()).toBe(404);
    if (locale === "ar") {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    expect(pageErrors).toEqual([]);
  });
test("housekeeping HTTP rejects stale, unconfirmed and cross-origin requests", async ({
  request,
}) => {
  const p = (await (
    await request.post("/api/projects", {
      data: {
        name: "Guarded",
        baseLanguage: "en",
        targetLanguages: ["fr", "ar"],
      },
    })
  ).json()) as ProjectDetail;
  const endpoint = `/api/projects/${p.id}/manage`;
  for (const data of [
    { action: "delete", expectedVersion: p.version },
    { action: "delete", expectedVersion: p.version, confirmedName: "wrong" },
    {
      action: "removeLanguage",
      language: "fr",
      expectedVersion: p.version,
      confirmed: false,
    },
    { action: "exportDraft", language: "fr", expectedVersion: p.version },
    { action: "rename", name: " ", expectedVersion: p.version },
  ])
    expect((await request.post(endpoint, { data })).status()).toBe(400);
  expect(
    (
      await request.post(endpoint, {
        data: {
          action: "delete",
          expectedVersion: p.version - 1,
          confirmedName: p.name,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(endpoint, {
        headers: { Origin: "https://untrusted.example" },
        data: {
          action: "delete",
          expectedVersion: p.version,
          confirmedName: p.name,
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/instance", {
        data: { action: "checkProvider", confirmed: false },
      })
    ).status(),
  ).toBe(400);
  const status = await (
    await request.post("/api/instance", {
      data: { action: "checkProvider", confirmed: true },
    })
  ).json();
  expect(status.provider.state).toBe("missing");
  expect(JSON.stringify(status)).not.toContain("API_KEY");
});
