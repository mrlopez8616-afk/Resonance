import type { ReactNode } from "react";
import { LockIcon } from "@/components/icons";
import { OperatorToolbar } from "@/components/operator-toolbar";

export function OperatorShell({ children }: { children: ReactNode }) {
  return (
    <div className="operator-floor">
      <OperatorToolbar />
      <div className="operator-canvas">
        <header className="operator-header">
          <h1 className="operator-title">RESONANCE 2.0</h1>
          <span className="live-chip">
            <span className="live-dot" />
            LIVE
          </span>
        </header>
        <div className="operator-main">{children}</div>
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
    </div>
  );
}
