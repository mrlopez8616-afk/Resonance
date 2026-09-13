"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  Activity,
  Archive,
  BookMarked,
  CircleGauge,
  Globe,
  Landmark,
  ListTodo,
  Menu,
  Radio,
  Settings2,
  Sparkles,
  SplitSquareVertical,
  Table2,
  X,
} from "lucide-react";
import { ReportAttestationBadge } from "@/components/badges";
import { useStore } from "@/context/store";
import { lockAppGate } from "@/lib/lock-gate";
import { isReportAttested } from "@/lib/reports";
import {
  getReportsSyncSnapshot,
  getServerReportsSyncSnapshot,
  hydrateReportsFromServer,
  subscribeReportsSync,
} from "@/lib/reports-client-sync";

const NAV = [
  { href: "/", label: "Node world", icon: CircleGauge },
  { href: "/decisions", label: "Decisions", icon: BookMarked },
  { href: "/treasury", label: "Treasury", icon: Landmark },
  { href: "/health", label: "System health", icon: Activity },
  { href: "/todos", label: "Todos", icon: ListTodo },
  { href: "/reports", label: "Reports", icon: Archive },
  { href: "/nodes", label: "Nodes", icon: Table2 },
  { href: "/robinhood", label: "Robinhood", icon: SplitSquareVertical },
  { href: "/prices", label: "Prices", icon: Radio },
  { href: "/public", label: "Public", icon: Globe },
  { href: "/whats-new", label: "What changed", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function ReportsNavMark({ pathname }: { pathname: string }) {
  const sync = useSyncExternalStore(
    subscribeReportsSync,
    getReportsSyncSnapshot,
    getServerReportsSyncSnapshot,
  );

  useEffect(() => {
    if (pathname.startsWith("/reports") || pathname.startsWith("/archive")) {
      void hydrateReportsFromServer();
    }
  }, [pathname]);

  const match = pathname.match(/^\/reports\/([^/]+)$/);
  const id = match ? decodeURIComponent(match[1]) : "";
  const item = id ? sync.reports.find((row) => row.id === id) : null;
  if (!item || !isReportAttested(item)) return null;
  return <ReportAttestationBadge value={item.attestationStatus} />;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : item.href === "/reports"
              ? pathname === "/reports" ||
                pathname.startsWith("/reports/") ||
                pathname === "/archive" ||
                pathname.startsWith("/archive/")
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-[color:var(--surface-2)] text-[color:var(--text)]"
                : "text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
            }`}
          >
            <Icon size={16} strokeWidth={1.6} />
            <span className="flex-1">{item.label}</span>
            {item.href === "/reports" ? (
              <ReportsNavMark pathname={pathname} />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  gateEnabled,
}: {
  children: ReactNode;
  gateEnabled: boolean;
}) {
  const { state, ready } = useStore();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function lockNow() {
    await lockAppGate();
    router.push("/unlock");
    router.refresh();
  }

  if (pathname === "/unlock") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-[color:var(--border)] bg-[color:var(--bg-sidebar)] lg:flex lg:flex-col">
        <div className="px-5 py-6">
          <div className="flex items-center gap-3">
            <ResonanceMark />
            <div>
              <p className="text-sm font-medium tracking-wide">Resonance</p>
              <p className="kicker mt-0.5">Phase Zero</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks />
        </div>
        <div className="mt-auto border-t border-[color:var(--border)] px-5 py-4">
          <p className="kicker">Operator</p>
          <p className="mt-1 text-sm text-[color:var(--text)]">
            {ready ? state.settings.operatorName : "—"}
          </p>
          <p className="mt-3 text-[11px] leading-5 text-[color:var(--muted)]">
            Human-governed tracker. No keys. No signing. No on-chain writes.
          </p>
          {gateEnabled ? (
            <button
              type="button"
              className="btn btn-secondary mt-3 w-full"
              onClick={() => void lockNow()}
            >
              Lock now
            </button>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg)]/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <ResonanceMark />
            <span className="text-sm font-medium">Resonance</span>
          </div>
          <button
            type="button"
            className="btn-secondary px-2 py-1.5"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>
        {open ? (
          <div className="border-b border-[color:var(--border)] bg-[color:var(--bg-sidebar)] px-3 py-3 lg:hidden">
            <NavLinks onNavigate={() => setOpen(false)} />
            {gateEnabled ? (
              <button
                type="button"
                className="btn btn-secondary mt-3 w-full"
                onClick={() => void lockNow()}
              >
                Lock now
              </button>
            ) : null}
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {gateEnabled ? null : (
            <div className="notice notice-warn mb-8">
              App password gate is off. Set{" "}
              <code className="font-mono text-xs">RESONANCE_APP_PASSWORD</code>{" "}
              in Vercel Project → Settings → Environment Variables and redeploy
              before this board is public. Local/dev can leave it unset.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

function ResonanceMark() {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--accent)]/40 text-[color:var(--accent)]"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" fill="currentColor" />
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1" />
        <circle
          cx="8"
          cy="8"
          r="7.25"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.45"
        />
      </svg>
    </span>
  );
}
