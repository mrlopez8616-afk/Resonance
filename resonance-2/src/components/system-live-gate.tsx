"use client";

import dynamic from "next/dynamic";

const SystemLive = dynamic(() => import("@/components/system-live").then((mod) => mod.SystemLive), {
  ssr: false,
  loading: () => (
    <div className="system-live-stage" data-view="pending">
      <p className="system-live-loading">Opening the map</p>
    </div>
  ),
});

export function SystemLiveGate({ publicMode }: { publicMode: boolean }) {
  return <SystemLive publicMode={publicMode} />;
}
