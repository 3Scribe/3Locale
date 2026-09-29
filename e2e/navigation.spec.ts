import { test, expect, hydrated } from "../tests/helpers/browser-auth";
import en from "../src/i18n/en.json" with { type: "json" };
import ar from "../src/i18n/ar.json" with { type: "json" };

for (const [locale, t] of [
  ["en", en],
  ["ar", ar],
] as const) {
  for (const mobile of [false, true]) {
    test(`dashboard routes preserve project workflows (${locale}, ${mobile ? "mobile" : "desktop"})`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
      const name = `Navigation ${locale} ${Date.now()}`;
      const created = await request.post("/api/projects", {
        data: { name, baseLanguage: "en", targetLanguages: ["fr"] },
      });
      expect(created.ok()).toBe(true);
      const project = await created.json();
      expect(
        (
          await request.post(`/api/projects/${project.id}`, {
            data: { action: "import", text: '{"greeting":"Hello"}' },
          })
        ).ok(),
      ).toBe(true);
      await page.goto(`/?lang=${locale}`);
      await expect(page).toHaveURL(new RegExp(`/projects\\?lang=${locale}$`));
      await hydrated(page);
      if (!mobile) {
        const toggle = page.getByRole("button", {
          name: t.navigation.toggle,
          exact: true,
        });
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(
          page.locator('[data-slot="sidebar"][data-collapsible="icon"]'),
        ).toBeVisible();
      }
      const navigate = async (destination: "keys" | "settings" | "account") => {
        if (mobile)
          await page
            .getByRole("button", { name: t.navigation.toggle, exact: true })
            .click();
        const navigation = page.getByRole("navigation", {
          name: t.navigation.title,
        });
        await navigation
          .getByRole("link", { name: t.navigation[destination], exact: true })
          .click();
        await expect(page).toHaveURL(
          new RegExp(`/${destination}\\?lang=${locale}$`),
        );
        await hydrated(page);
      };
      await navigate("keys");
      await page
        .getByRole("button", {
          name: t.openProject.replace("{{name}}", name),
          exact: true,
        })
        .click();
      await page
        .getByLabel(t.translationFor.replace("{{key}}", '"greeting"'), {
          exact: true,
        })
        .fill("Bonjour");
      await page
        .getByRole("button", {
          name: t.saveFor.replace("{{key}}", '"greeting"'),
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toHaveText(t.saved);
      await navigate("settings");
      await expect(
        page.getByText(t.setup.storage.available, { exact: true }),
      ).toBeVisible();
      await navigate("account");
      await expect(
        page.getByRole("region", { name: t.credentials.add, exact: true }),
      ).toBeVisible();
      await page.reload();
      await hydrated(page);
      await expect(
        page.getByRole("heading", { level: 1, name: t.navigation.account }),
      ).toBeVisible();
      if (mobile) {
        const toggle = page.getByRole("button", {
          name: t.navigation.toggle,
          exact: true,
        });
        await toggle.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(toggle).toBeFocused();
      }
      await page.getByRole("combobox", { name: t.uiLanguage }).click();
      await page
        .getByRole("option", {
          name: locale === "en" ? t.arabic : t.english,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/account\\?lang=${locale === "en" ? "ar" : "en"}$`),
      );
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "en" ? "rtl" : "ltr",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
}
