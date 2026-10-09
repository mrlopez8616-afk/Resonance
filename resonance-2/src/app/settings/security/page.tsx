import Link from "next/link";
import { FitnessShortcutSetup } from "@/components/fitness-shortcut-setup";
import { OwnerPinForm } from "@/components/owner-pin-form";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { SecurityPanel } from "@/components/security-panel";
import { webauthnConfig } from "@/lib/auth-core";
import { readRequestSession } from "@/lib/auth-session";
import { listPasskeys, listSessionViews } from "@/lib/auth-store";
import { listModeLog, readOwnerPinHash } from "@/lib/owner-pin-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Security · Resonance 2.0",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function SecurityPage() {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  const live = await readRequestSession();
  if (!live) redirect("/login?next=/settings/security");
  const [sessions, passkeys, pinHash, modeLog] = await Promise.all([
    listSessionViews(live.session.idHash),
    listPasskeys(),
    readOwnerPinHash().catch(() => null),
    listModeLog().catch(() => []),
  ]);

  return (
    <OperatorShell>
      <Link href="/settings" className="calendar-back">
        Founder
      </Link>
      <OwnerPinForm pinSet={pinHash !== null} log={modeLog} />
      <SecurityPanel
        sessions={sessions.map((row) => ({
          label: row.label,
          lastSeen: formatWhen(row.lastSeen),
          created: formatWhen(row.created),
          current: row.current,
        }))}
        passkeys={passkeys.map((row) => ({
          id: row.credentialId,
          label: row.deviceLabel,
          created: formatWhen(row.createdAt),
          lastUsed: formatWhen(row.lastUsedAt),
        }))}
        passkeysConfigured={webauthnConfig() !== null}
        fitnessTokenConfigured={Boolean(process.env.FITNESS_INGEST_TOKEN?.trim())}
        shortcut={<FitnessShortcutSetup />}
      />
    </OperatorShell>
  );
}
