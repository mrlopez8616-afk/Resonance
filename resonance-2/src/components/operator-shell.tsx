import { Suspense, type ReactNode } from "react";
import { LockIcon } from "@/components/icons";
import { MoodFloor, MoodLegend, MoodPreviewSync } from "@/components/mood-floor";
import { OperatorToolbar } from "@/components/operator-toolbar";
import { loadPortfolioMood } from "@/lib/portfolio-mood-load";

export async function OperatorShell({
  children,
  storageMessage = null,
  storageDetail = null,
}: {
  children: ReactNode;
  storageMessage?: string | null;
  storageDetail?: string | null;
}) {
  const mood = await loadPortfolioMood();
  return (
    <MoodFloor initialMood={mood}>
      <Suspense fallback={null}>
        <MoodPreviewSync />
      </Suspense>
      <OperatorToolbar />
      <div className="operator-canvas">
        <header className="operator-header">
          <h1 className="operator-title">RESONANCE 2.0</h1>
          <span className="live-chip">
            <span className="live-dot" />
            LIVE
          </span>
          <MoodLegend />
        </header>
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
