import { notFound } from "next/navigation";
import { loadTierTracker, PickTracker, TrackerShell } from "@/app/fights/tier-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tier tracker · Resonance 2.0",
};

export default async function TierCardSlicePage({
  params,
}: {
  params: Promise<{ event: string; slice: string }>;
}) {
  const { event, slice } = await params;
  const loaded = await loadTierTracker();
  const body = PickTracker({
    model: loaded.model,
    slice,
    event,
    from: "card",
    meta: loaded.meta,
    publicMode: loaded.publicMode,
  });
  if (!body) notFound();
  return (
    <TrackerShell storageMessage={loaded.storageMessage} storageDetail={loaded.storageDetail}>
      {body}
    </TrackerShell>
  );
}
