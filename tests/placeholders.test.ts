import { describe, it, expect } from "vitest";
import { shieldPlaceholders } from "../src/domain/placeholders";
import { sourceCharacters } from "../src/domain/translation";
describe("placeholder shielding", () => {
  it.each([
    "Hello {name}",
    "مرحبا {{name}} {name} {name} 😀",
    "User __3LOCALE_1_0_0__ and <ph>{x}</ph> & {{x}}",
    "Control \u0000 {x} \ud800",
  ])(
    "round-trips opaque text and distinct placeholder occurrences: %s",
    (source) => {
      const shield = shieldPlaceholders(source, "1");
      expect(shield.restore(`Translated ${shield.text}`)).toBe(
        `Translated ${source}`,
      );
      expect(
        shield.protectedTokens.every((token) => !source.includes(token)),
      ).toBe(true);
    },
  );
  it("rejects missing, duplicated, changed and unexpected protection tokens", () => {
    const shield = shieldPlaceholders("{x} {{x}} {x}", "2");
    const token = shield.protectedTokens[0];
    for (const bad of [
      shield.text.replace(token, ""),
      shield.text + token,
      shield.text.replace(token, token.replace("0__", "99__")),
      shield.text + "__3LOCALE_2_0_999__",
      shield.text + "__3LOCALE_other_0_0__",
    ])
      expect(() => shield.restore(bad)).toThrow("machineInvalidResult");
  });
  it("counts Unicode code points rather than UTF-8 bytes or UTF-16 units", () => {
    expect(sourceCharacters("A😀شe\u0301")).toBe(5);
  });
});
