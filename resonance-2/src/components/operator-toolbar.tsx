"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ApprovalsIcon,
  CalendarIcon,
  HomeIcon,
  LogIcon,
  SettingsIcon,
} from "@/components/icons";

const PRIMARY = [
  { href: "/", label: "Home / Floor", icon: HomeIcon, exact: true },
  { href: "/log", label: "Operator log", icon: LogIcon, exact: false },
] as const;

const PLACEHOLDERS = [
  { label: "Calendar", icon: CalendarIcon },
  { label: "Approvals", icon: ApprovalsIcon },
] as const;

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

export function OperatorToolbar() {
  const pathname = usePathname();

  return (
    <aside className="operator-toolbar">
      <div className="operator-mark" aria-hidden>
        R
      </div>
      <nav className="operator-nav" aria-label="Operator toolbar">
        {PRIMARY.map((item) => {
          const active = item.exact
            ? pathname === item.href
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
      </nav>
      <RailButton label="Settings" footer>
        <SettingsIcon />
      </RailButton>
    </aside>
  );
}
