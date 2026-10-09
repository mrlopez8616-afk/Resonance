import Link from "next/link";
import { SystemLiveGate } from "@/components/system-live-gate";
import { SystemLensNav } from "@/components/system-map";
import { OperatorShell } from "@/components/operator-shell";
import { readLivePublicMode } from "@/lib/system-public";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live · System · Resonance 2.0",
};

export default async function SystemLivePage() {
  const publicMode = await readLivePublicMode();
  return (
    <OperatorShell>
      <div className="system-live">
        <Link href="/n/system" className="calendar-back">
          System Map
        </Link>
        <header className="log-header">
          <p className="log-kicker">System</p>
          <h2 className="log-title">Live</h2>
          <p className="log-meta">A pulse follows a real event.</p>
        </header>
        <SystemLensNav live />
        <SystemLiveGate publicMode={publicMode} />
      </div>
    </OperatorShell>
  );
}
