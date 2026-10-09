import { Suspense, type ReactNode } from "react";
import { LockIcon } from "@/components/icons";
import { MoodFloor, MoodLegend, MoodPreviewSync } from "@/components/mood-floor";
import { OperatorToolbar } from "@/components/operator-toolbar";
import { PhoneNav } from "@/components/phone-nav";
import { countPendingApprovals } from "@/lib/approvals-store";
import { getSession } from "@/lib/auth-session";
import { loadModeSwitchStatus } from "@/lib/owner-pin-store";
import { loadPortfolioMood } from "@/lib/portfolio-mood-load";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export async function OperatorShell({
  children,
  storageMessage = null,
  storageDetail = null,
}: {
  children: ReactNode;
  storageMessage?: string | null;
  storageDetail?: string | null;
}) {
  const [mood, session, pub] = await Promise.all([
    loadPortfolioMood(),
    getSession(),
    isPublicMode(),
  ]);
  const initialMood = pub
    ? { tone: mood.tone, changePct: mood.changePct, partial: mood.partial }
    : mood;
  const owner = session?.role === "owner";
  const [modeStatus, pendingApprovals] = await Promise.all([
    owner
      ? loadModeSwitchStatus().catch(() => ({
          pinSet: false,
          lockedUntil: null,
          unavailable: true,
        }))
      : Promise.resolve(null),
    pub
      ? Promise.resolve(null)
      : countPendingApprovals().catch((error: unknown) => {
          if (!isStorageUnavailable(error)) throw error;
          return null;
        }),
  ]);
  return (
    <MoodFloor initialMood={initialMood}>
      {pub ? (
        <p className="public-banner" role="status" data-public-banner>
          PUBLIC
        </p>
      ) : null}
      <Suspense fallback={null}>
        <MoodPreviewSync />
      </Suspense>
      <OperatorToolbar publicMode={pub} modeStatus={modeStatus} pendingApprovals={pendingApprovals} />
      <div className="operator-canvas">
        <header className="operator-header">
          <h1 className="operator-title">RESONANCE 2.0</h1>
          <span className="live-chip">
            <span className="live-dot" />
            LIVE
          </span>
          <MoodLegend />
        </header>
        <Suspense fallback={null}>
          <PhoneNav publicMode={pub} />
        </Suspense>
        <div className="operator-main">
          {storageMessage ? (
            <p className="storage-banner" role="status" data-storage-banner="unavailable">
              {storageMessage}
              {storageDetail ? <span className="storage-banner-detail">{storageDetail}</span> : null}
            </p>
          ) : null}
          {children}
        </div>
        <footer className="operator-status">
          <p>
            Operator floor ·{" "}
            <span className="lock-badge">
              <LockIcon size={12} />
              vault locked
            </span>{" "}
            · <span className="warn-badge">gas wallet hidden</span>
          </p>
        </footer>
      </div>
    </MoodFloor>
  );
}
