export const dashboardPages = [
  "projects",
  "keys",
  "settings",
  "account",
] as const;
export type DashboardPage = (typeof dashboardPages)[number];

export function isDashboardPath(path: string) {
  const normalized = path.replace(/\/$/, "");
  return dashboardPages.some((page) => normalized === `/${page}`);
}

export function dashboardHref(page: DashboardPage, language: string) {
  return `/${page}?lang=${language === "ar" ? "ar" : "en"}`;
}
