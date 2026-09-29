import { useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { FolderOpen, KeyRound, Settings, UserRound } from "lucide-react";
import { createI18n } from "../i18n";
import { dashboardHref, type DashboardPage } from "../lib/navigation";
import App from "./App";
import { InstancePanel } from "./InstancePanel";
import { CredentialPanel } from "./CredentialPanel";
import { OwnerSession } from "./OwnerAccess";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export default function Dashboard({
  language,
  page,
  sidebarOpen,
}: {
  language: string;
  page: DashboardPage;
  sidebarOpen: boolean;
}) {
  const [i18n] = useState(() => createI18n(language));
  return (
    <I18nextProvider i18n={i18n}>
      <DashboardShell page={page} sidebarOpen={sidebarOpen} />
    </I18nextProvider>
  );
}

function DashboardShell({
  page,
  sidebarOpen,
}: {
  page: DashboardPage;
  sidebarOpen: boolean;
}) {
  const { t, i18n } = useTranslation();
  const items = [
    { page: "projects", icon: FolderOpen },
    { page: "keys", icon: KeyRound },
    { page: "settings", icon: Settings },
    { page: "account", icon: UserRound },
  ] as const;
  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      className="flex-col"
      dir={i18n.dir()}
    >
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
      >
        {t("navigation.skip")}
      </a>
      <header className="sticky top-0 z-30 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-input bg-background px-4 py-2 md:h-16 md:flex-nowrap">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="md:hidden" />
          <a
            href={dashboardHref("projects", i18n.language)}
            className="flex items-center gap-2 text-xl font-semibold"
          >
            <img
              src="/logo.svg"
              alt=""
              width="36"
              height="36"
              className="size-9 shrink-0"
            />
            {t("appName")}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={i18n.language}
            dir={i18n.dir()}
            onValueChange={(language) => {
              window.location.href = dashboardHref(page, language);
            }}
          >
            <SelectTrigger
              aria-label={t("uiLanguage")}
              className="min-w-24 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="en">{t("english")}</SelectItem>
              <SelectItem value="ar">{t("arabic")}</SelectItem>
            </SelectContent>
          </Select>
          <OwnerSession className="space-y-2" />
        </div>
      </header>
      <div className="flex min-w-0 flex-1">
        <Sidebar
          collapsible="icon"
          side={i18n.dir() === "rtl" ? "right" : "left"}
          className="top-16 h-[calc(100svh-4rem)]"
        >
          <SidebarContent>
            <nav aria-label={t("navigation.title")}>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => (
                      <SidebarMenuItem key={item.page}>
                        <SidebarMenuButton
                          asChild
                          isActive={page === item.page}
                          tooltip={{
                            children: t(`navigation.${item.page}`),
                            side: i18n.dir() === "rtl" ? "left" : "right",
                          }}
                        >
                          <a
                            href={dashboardHref(item.page, i18n.language)}
                            aria-label={t(`navigation.${item.page}`)}
                            aria-current={
                              page === item.page ? "page" : undefined
                            }
                          >
                            <item.icon aria-hidden="true" />
                            <span className="group-data-[collapsible=icon]:sr-only">
                              {t(`navigation.${item.page}`)}
                            </span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </nav>
          </SidebarContent>
          <SidebarFooter className="mt-auto">
            <SidebarTrigger className="size-8" />
          </SidebarFooter>
        </Sidebar>
        <main
          id="dashboard-content"
          tabIndex={-1}
          className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"
        >
          <div className="mx-auto w-full max-w-6xl">
            {page === "projects" || page === "keys" ? (
              <App language={i18n.language} mode={page} />
            ) : (
              <>
                <h1 className="mb-6 text-3xl font-semibold">
                  {t(`navigation.${page}`)}
                </h1>
                {page === "settings" ? (
                  <InstancePanel />
                ) : (
                  <CredentialPanel defaultOpen />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
