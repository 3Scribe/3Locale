import { AppError } from "./model";
export function canonicalLanguage(value: string): string {
  try {
    return Intl.getCanonicalLocales(value.trim())[0] || fail();
  } catch {
    return fail();
  }
}
function fail(): never {
  throw new AppError("invalidLanguages");
}
export function inferLanguage(filename: string): string {
  const candidate =
    filename
      .replace(/\.json$/i, "")
      .split(".")
      .at(-1) ?? "";
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(candidate)) return "";
  try {
    return canonicalLanguage(candidate);
  } catch {
    return "";
  }
}
