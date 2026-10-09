"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ApprovalsIcon,
  BuildIcon,
  CalendarIcon,
  HomeIcon,
  LogIcon,
  SettingsIcon,
} from "@/components/icons";
import { PublicModeToggle } from "@/components/public-mode-toggle";
import type { PublicModeClientStatus } from "@/lib/owner-pin";
import { PHONE_TABS, phoneTabActive } from "@/lib/phone-nav";

const PRIMARY = [
  { href: "/", label: "Home / Floor", icon: HomeIcon, exact: true },
  { href: "/log", label: "Operator log", icon: LogIcon, exact: false },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon, exact: false },
] as const;

const PLACEHOLDERS = [{ label: "Approvals", icon: ApprovalsIcon }] as const;

const PHONE_ICONS = {
  "/": HomeIcon,
  "/log": LogIcon,
  "/calendar": CalendarIcon,
  "/n/build": BuildIcon,
  "/settings/security": SettingsIcon,
} as const;

function RailButton({
  label,
  active = false,
  href,
  footer = false,
  children,
}: {
  label: string;
  active?: boolean;
  href?: string;
  footer?: boolean;
  children: ReactNode;
}) {
  const className = [
    "operator-tool",
    active ? "is-active" : "",
    href ? "" : "is-placeholder",
    footer ? "operator-tool-footer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        data-tooltip={label}
        className={className}
      >
        {children}
      </Link>
    );
  }

  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-label={`${label} (not wired)`}
      data-tooltip={label}
      className={className}
    >
      {children}
    </span>
  );
}

export function OperatorToolbar({
  publicMode = false,
  modeStatus = null,
}: {
  publicMode?: boolean;
  modeStatus?: PublicModeClientStatus | null;
}) {
  const pathname = usePathname();
  const primary = publicMode ? PRIMARY.filter((item) => item.href !== "/log") : PRIMARY;
  const settingsHref = publicMode ? "/settings" : "/settings/security";
  const settingsLabel = publicMode ? "Settings" : "Security";

  return (
    <aside className="operator-toolbar">
      <div className="operator-mark" aria-hidden>
        R
      </div>
      <nav className="operator-nav" aria-label="Operator toolbar">
        {primary.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/n/")
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <RailButton
              key={item.href}
              href={item.href}
              label={item.label}
              active={active}
            >
              <Icon />
            </RailButton>
          );
        })}
        {PLACEHOLDERS.map((item) => {
          const Icon = item.icon;
          return (
            <RailButton key={item.label} label={item.label}>
              <Icon />
            </RailButton>
          );
        })}
        {modeStatus ? <PublicModeToggle on={publicMode} status={modeStatus} compact /> : null}
      </nav>
      <RailButton
        href={settingsHref}
        label={settingsLabel}
        footer
        active={pathname.startsWith("/settings")}
      >
        <SettingsIcon />
      </RailButton>
      <nav className="phone-tabbar" aria-label="Phone">
        {PHONE_TABS.map((tab) => {
          if (publicMode && tab.href === "/log") return null;
          const href = publicMode && tab.href === "/settings/security" ? "/settings" : tab.href;
          const Icon = PHONE_ICONS[tab.href];
          const active = phoneTabActive(tab.href, pathname);
          return (
            <Link
              key={tab.href}
              href={href}
              className={active ? "phone-tab is-active" : "phone-tab"}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={22} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        {modeStatus ? (
          <PublicModeToggle on={publicMode} status={modeStatus} compact className="phone-tab" />
        ) : null}
      </nav>
    </aside>
  );
}
