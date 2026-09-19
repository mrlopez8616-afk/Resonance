"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ApprovalsIcon,
  CalendarIcon,
  HomeIcon,
  LogIcon,
  SettingsIcon,
} from "@/components/icons";

const PRIMARY = [
  { href: "/", label: "Home", icon: HomeIcon, exact: true },
  { href: "/log", label: "Operator log", icon: LogIcon, exact: false },
] as const;

const PLACEHOLDERS = [
  { label: "Calendar", icon: CalendarIcon },
  { label: "Approvals", icon: ApprovalsIcon },
] as const;

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
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={`operator-tool ${active ? "is-active" : ""}`}
            >
              <Icon />
            </Link>
          );
        })}
        {PLACEHOLDERS.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              role="link"
              aria-disabled="true"
              aria-label={`${item.label} (not wired)`}
              title={`${item.label} — not wired yet`}
              className="operator-tool is-placeholder"
            >
              <Icon />
            </span>
          );
        })}
      </nav>
      <span
        role="link"
        aria-disabled="true"
        aria-label="Settings (not wired)"
        title="Settings — not wired yet"
        className="operator-tool operator-tool-footer is-placeholder"
      >
        <SettingsIcon />
      </span>
    </aside>
  );
}
