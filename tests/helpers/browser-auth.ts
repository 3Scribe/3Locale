import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type CDPSession,
} from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
export type { Page } from "@playwright/test";
type Passkey = {
  credentialId: string;
  isResidentCredential: boolean;
  rpId?: string;
  privateKey: string;
  userHandle?: string;
  signCount: number;
};
type OwnerFixture = { credential: Passkey; file: string };
export async function virtualAuthenticator(
  context: BrowserContext,
  page: Page,
  credential?: Passkey,
) {
  const client = await context.newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  if (credential)
    await client.send("WebAuthn.addCredential", {
      authenticatorId,
      credential,
    });
  return { client, authenticatorId };
}
export async function hydrated(page: Page) {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}
async function readCredential(
  client: CDPSession,
  authenticatorId: string,
): Promise<Passkey> {
  return (await client.send("WebAuthn.getCredentials", { authenticatorId }))
    .credentials[0];
}
export const test = base.extend<object, { owner: OwnerFixture }>({
  owner: [
    async ({ browser }, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL!;
      const file = `data/test-passkey-${new URL(baseURL).port}.json`;
      const context = await browser.newContext({
        baseURL,
        extraHTTPHeaders: { Origin: baseURL },
      });
      if (!(await (await context.request.get("/api/auth")).json()).setup) {
        const owner = {
          credential: JSON.parse(await readFile(file, "utf8")) as Passkey,
          file,
        };
        await context.close();
        await use(owner);
        return;
      }
      const page = await context.newPage(),
        virtual = await virtualAuthenticator(context, page);
      expect((await context.request.get("/api/projects")).status()).toBe(401);
      await page.goto("/");
      await hydrated(page);
      await expect(
        page.getByRole("heading", { name: "Set up the owner", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Owner name", { exact: true })
        .fill("Community owner");
      await page
        .getByRole("button", { name: "Create owner with passkey", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeVisible();
      if (workerInfo.project.metadata.machine) {
        const response = await context.request.post("/api/credentials", {
          data: {
            action: "create",
            name: "Test account",
            secret: "synthetic-browser-secret",
          },
        });
        expect(response.ok()).toBe(true);
        const { credentials } = await response.json();
        expect(
          (
            await context.request.post("/api/credentials", {
              data: { action: "default", id: credentials[0].id },
            })
          ).ok(),
        ).toBe(true);
      }
      const owner = {
        credential: await readCredential(
          virtual.client,
          virtual.authenticatorId,
        ),
        file,
      };
      await mkdir("data", { recursive: true });
      await writeFile(file, JSON.stringify(owner.credential));
      await context.close();
      await use(owner);
    },
    { scope: "worker" },
  ],
  context: async ({ browser, owner, baseURL }, use) => {
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    const page = await context.newPage(),
      virtual = await virtualAuthenticator(context, page, owner.credential);
    await page.goto("/");
    await hydrated(page);
    await page
      .getByRole("button", { name: "Sign in with passkey", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    await use(context);
    owner.credential = await readCredential(
      virtual.client,
      virtual.authenticatorId,
    );
    await writeFile(owner.file, JSON.stringify(owner.credential));
    await context.close();
  },
  request: async ({ context }, use) => {
    await use(context.request);
  },
});
export { expect };
