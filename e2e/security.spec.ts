import { test, expect, hydrated } from "../tests/helpers/browser-auth";
import en from "../src/i18n/en.json" with { type: "json" };
import ar from "../src/i18n/ar.json" with { type: "json" };
test("all data APIs require a session, CSRF is rejected, and logout revokes the cookie", async ({
  browser,
  baseURL,
  request,
  context,
  page,
}) => {
  const outsider = await browser.newContext({ baseURL });
  for (const endpoint of [
    "/api/projects",
    "/%61pi/projects",
    "/api/imports",
    "/api/credentials",
    "/api/instance",
    "/api/projects/00000000-0000-4000-8000-000000000000",
    "/api/projects/00000000-0000-4000-8000-000000000000/imports?view=audit",
    "/api/projects/00000000-0000-4000-8000-000000000000/machine",
    "/api/projects/00000000-0000-4000-8000-000000000000/manage",
  ]) {
    expect((await outsider.request.get(endpoint)).status()).toBe(401);
    expect(
      (
        await outsider.request.post(endpoint, {
          headers: { Origin: baseURL! },
          data: {},
        })
      ).status(),
    ).toBe(401);
  }
  expect(
    (
      await request.post("/api/auth", {
        data: { action: "begin", purpose: "setup", name: "Another owner" },
      })
    ).status(),
  ).toBe(409);
  for (const origin of ["https://attacker.invalid", ""])
    expect(
      (
        await request.post("/api/credentials", {
          headers: { Origin: origin },
          data: { action: "create", name: "CSRF", secret: "synthetic-csrf" },
        })
      ).status(),
    ).toBe(403);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "threeLocaleSession",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  await page.goto("/");
  await hydrated(page);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    cookie.value,
  );
  expect((await request.get("/api/projects")).ok()).toBe(true);
  await page.getByRole("button", { name: en.auth.logout, exact: true }).click();
  await expect(
    page.getByRole("button", { name: en.auth.signIn, exact: true }),
  ).toBeVisible();
  expect((await request.get("/api/projects")).status()).toBe(401);
  expect(
    (
      await outsider.request.get("/api/projects", {
        headers: { Cookie: `threeLocaleSession=${cookie.value}` },
      })
    ).status(),
  ).toBe(401);
  await outsider.close();
});
for (const [lang, t] of [
  ["en", en],
  ["ar", ar],
] as const)
  test(`manage multiple encrypted credentials (${lang})`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?lang=${lang}`);
    await hydrated(page);
    await page.getByText(t.credentials.title, { exact: true }).last().click();
    const add = page.getByRole("region", {
      name: t.credentials.add,
      exact: true,
    });
    const name = `Account ${lang}`;
    await add.getByLabel(t.credentials.name, { exact: true }).fill(name);
    await add
      .getByLabel(t.credentials.secret, { exact: true })
      .fill(`synthetic-${lang}-private`);
    await add
      .getByRole("button", { name: t.credentials.add, exact: true })
      .click();
    const account = page.getByRole("region", { name, exact: true });
    await expect(account).toBeVisible();
    expect(
      await account
        .getByLabel(t.credentials.replacement, { exact: true })
        .inputValue(),
    ).toBe("");
    const list = await request.get("/api/credentials"),
      body = await list.text();
    expect(body).not.toMatch(/synthetic-|ciphertext|"iv"/);
    await account
      .getByRole("button", { name: t.credentials.setDefault, exact: true })
      .click();
    await expect(
      account.getByRole("button", {
        name: t.credentials.setDefault,
        exact: true,
      }),
    ).toBeDisabled();
    await account
      .getByLabel(t.credentials.replacement, { exact: true })
      .fill("synthetic-new-private");
    await account
      .getByRole("button", { name: t.credentials.save, exact: true })
      .click();
    await expect(
      account.getByLabel(t.credentials.replacement, { exact: true }),
    ).toHaveValue("");
    await account
      .getByText(t.credentials.delete, { exact: true })
      .first()
      .click();
    await expect(
      account.getByRole("button", { name: t.credentials.delete, exact: true }),
    ).toBeDisabled();
    await account.getByRole("checkbox").check();
    await account
      .getByRole("button", { name: t.credentials.delete, exact: true })
      .click();
    await expect(account).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (lang === "ar")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
