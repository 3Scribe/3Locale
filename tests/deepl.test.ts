import { expect, it, vi } from "vitest";
import { DeepLProvider, deeplLanguage } from "../src/providers/deepl";
import type { TranslationRequest } from "../src/domain/translation";
import { shieldPlaceholders } from "../src/domain/placeholders";
const input = (count = 1, text = "Hello {name}"): TranslationRequest => ({
  sourceLanguage: "en-GB",
  targetLanguage: "fr",
  items: Array.from({ length: count }, (_, index) => {
    const shield = shieldPlaceholders(text, String(index));
    return {
      id: String(index),
      path: [String(index)],
      text: shield.text,
      protectedTokens: shield.protectedTokens,
    };
  }),
});
const echo = (init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  return Response.json({
    translations: body.text.map((text: string) => ({
      text,
      model_type_used: "quality_optimized",
      billed_characters: 10,
    })),
  });
};
it("maps language tags offline without silently selecting a different regional English/Portuguese variant", () => {
  expect(deeplLanguage("en-GB", false)).toBe("EN");
  expect(deeplLanguage("en-GB", true)).toBe("EN-GB");
  expect(deeplLanguage("en-AU", true)).toBeUndefined();
  expect(deeplLanguage("fr-CA", true)).toBe("FR");
  expect(deeplLanguage("zh-TW", true)).toBe("ZH-HANT");
  expect(deeplLanguage("zh-Hans", true)).toBe("ZH-HANS");
  expect(deeplLanguage("pt-BR", true)).toBe("PT-BR");
  expect(deeplLanguage("zz", true)).toBeUndefined();
});
it("uses server-side Free/Pro authentication, XML protection and ID-checked responses", async () => {
  for (const [key, host] of [
    ["test-credential:fx", "api-free"],
    ["test-credential", "api"],
  ]) {
    const send = vi.fn<typeof fetch>(async (_url, init) => echo(init));
    const provider = new DeepLProvider(key, send);
    expect(provider.supports("en", "fr")).toBe(true);
    expect(send).not.toHaveBeenCalled();
    const result = await provider.translate(input());
    expect(send.mock.calls[0][0]).toBe(
      `https://${host}.deepl.com/v2/translate`,
    );
    const options = send.mock.calls[0][1]!;
    expect(options.headers).toMatchObject({
      Authorization: `DeepL-Auth-Key ${key}`,
    });
    expect(JSON.parse(String(options.body))).toMatchObject({
      source_lang: "EN",
      target_lang: "FR",
      tag_handling: "xml",
      tag_handling_version: "v2",
      ignore_tags: ["ph"],
    });
    expect(result).toMatchObject({
      items: [
        { id: "0", text: input().items[0].text, model: "quality_optimized" },
      ],
      billedCharacters: 10,
    });
    expect(JSON.stringify(result)).not.toContain(key);
  }
});
it("batches thousands of texts within item and UTF-8 request limits", async () => {
  const send = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.text.length).toBeLessThanOrEqual(50);
    expect(
      new TextEncoder().encode(String(init?.body)).length,
    ).toBeLessThanOrEqual(120000);
    return echo(init);
  });
  const provider = new DeepLProvider("test", send);
  expect((await provider.translate(input(1001))).items).toHaveLength(1001);
  expect(send).toHaveBeenCalledTimes(21);
  send.mockClear();
  expect(
    (await provider.translate(input(9, "مرحبا😀".repeat(2000)))).items,
  ).toHaveLength(9);
  expect(send.mock.calls.length).toBeGreaterThan(1);
});
it.each([
  [403, "machineCredentials"],
  [429, "machineRateLimit"],
  [456, "machineQuota"],
  [500, "machineUnavailable"],
  [413, "machineRequestTooLarge"],
])("maps HTTP %s without leaking provider bodies", async (status, code) => {
  const provider = new DeepLProvider(
    "secret",
    async () =>
      new Response("secret internal body", { status: Number(status) }),
  );
  await expect(provider.translate(input())).rejects.toMatchObject({
    code,
    message: code,
  });
});
it("handles network failure, malformed JSON and incomplete/incorrect associations safely", async () => {
  const cases = [
    async () => {
      throw new Error("secret socket error");
    },
    async () => new Response("secret"),
    async () => Response.json({ translations: [] }),
    async () =>
      Response.json({
        translations: [{ text: '<text id="wrong">Hello</text>' }],
      }),
  ];
  for (const send of cases) {
    const provider = new DeepLProvider("secret", send);
    try {
      await provider.translate(input());
      throw new Error("must reject");
    } catch (error) {
      expect(String(error)).not.toContain("secret");
      expect(String(error)).toMatch(
        /machineUnavailable|machineMalformedResponse/,
      );
    }
  }
});
it("rejects unsafe/malformed XML individually and preserves literal user markup", async () => {
  const source = "<ph>literal</ph> & {x}";
  const provider = new DeepLProvider("test", async (_url, init) => echo(init));
  const result = await provider.translate(input(1, source));
  expect(
    shieldPlaceholders(source, "0").restore(
      (result.items[0] as { text: string }).text,
    ),
  ).toBe(source);
  for (const text of [
    '<!DOCTYPE text [<!ENTITY x SYSTEM "file:///secret">]><text id="0">&x;</text>',
    '<text id="0"><bad>oops</bad></text>',
    '<text id="0">broken',
  ]) {
    const bad = new DeepLProvider("test", async () =>
      Response.json({ translations: [{ text }] }),
    );
    expect((await bad.translate(input())).items).toEqual([
      { id: "0", error: "machineInvalidResult" },
    ]);
  }
});
it("does not return partial success when a later HTTP batch fails", async () => {
  let calls = 0;
  const provider = new DeepLProvider("test", async (_url, init) =>
    ++calls === 1 ? echo(init) : new Response("failure", { status: 503 }),
  );
  await expect(provider.translate(input(51))).rejects.toThrow(
    "machineUnavailable",
  );
});
it("rejects unconfigured, unsupported and oversized requests without network calls", async () => {
  const send = vi.fn<typeof fetch>();
  await expect(
    new DeepLProvider(undefined, send).translate(input()),
  ).rejects.toThrow("machineNotConfigured");
  await expect(
    new DeepLProvider("test", send).translate({
      ...input(),
      targetLanguage: "zz",
    }),
  ).rejects.toThrow("machineUnsupported");
  await expect(
    new DeepLProvider("test", send).translate(input(1, "x".repeat(130000))),
  ).rejects.toThrow("machineRequestTooLarge");
  expect(send).not.toHaveBeenCalled();
});

it("bounds provider response bodies before parsing", async () => {
  let cancelled = false;
  const provider = new DeepLProvider(
    "test",
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(1_000_001));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await expect(provider.translate(input())).rejects.toThrow(
    "machineMalformedResponse",
  );
  expect(cancelled).toBe(true);
});
