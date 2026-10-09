import Link from "next/link";
import { PublicModeToggle } from "@/components/public-mode-toggle";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import type { PublicModeClientStatus } from "@/lib/owner-pin";
import { loadModeSwitchStatus } from "@/lib/owner-pin-store";
import { isPublicMode } from "@/lib/public-mode-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Founder · Resonance 2.0",
};

export default async function SettingsPage() {
  await requireRole("owner");
  const on = await isPublicMode();
  let status: PublicModeClientStatus = { pinSet: false, lockedUntil: null, unavailable: true };
  try {
    status = await loadModeSwitchStatus();
  } catch {
    status = { pinSet: false, lockedUntil: null, unavailable: true };
  }
  return (
    <OperatorShell>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <section className="public-settings" aria-label="Founder">
        <h2>Founder</h2>
        <p>{on ? "Public mode is on." : "Public mode is off."}</p>
        <PublicModeToggle on={on} status={status} showLock={false} />
        {on ? null : (
          <p>
            <Link href="/settings/security#owner-pin">Security</Link>
          </p>
        )}
      </section>
    </OperatorShell>
  );
}
