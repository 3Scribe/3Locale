import { test, expect, hydrated } from "../tests/helpers/browser-auth";
import en from "../src/i18n/en.json" with { type: "json" };
import ar from "../src/i18n/ar.json" with { type: "json" };

for (const [locale, t] of [
  ["en", en],
  ["ar", ar],
] as const)
  for (const runtime of ["node", "cloudflare"] as const)
    test(`setup identifiers wrap within mobile panels (${locale}, ${runtime})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.route("**/api/instance", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          json: { ...(await response.json()), runtime },
        });
      });
      await page.route("**/api/credentials", (route) =>
        route.fulfill({
          json: { encryptionReady: false, credentials: [] },
        }),
      );
      await page.goto(`/?lang=${locale}`);
      await hydrated(page);
      await page.getByText(t.setup.instructions, { exact: true }).click();
      await page.locator("#provider-credentials > summary").click();
      await expect(
        page.getByText(t.setup[runtime], { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(t.errors.encryptionConfiguration, { exact: true }),
      ).toBeVisible();

      // System font metrics differ between Windows and Linux CI; both must fit.
      for (const font of ["", "Arial, sans-serif"]) {
        await page.evaluate((font) => {
          document.documentElement.style.fontFamily = font;
        }, font);
        for (const text of [
          t.setup[runtime],
          t.errors.encryptionConfiguration,
        ]) {
          const overflowingLines = await page
            .getByText(text, { exact: true })
            .evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(element);
              return [...range.getClientRects()]
                .filter(
                  (rect) =>
                    rect.left < bounds.left || rect.right > bounds.right,
                )
                .map((rect) => ({
                  left: rect.left,
                  right: rect.right,
                  containerLeft: bounds.left,
                  containerRight: bounds.right,
                }));
            });
          expect(overflowingLines).toEqual([]);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
    });
