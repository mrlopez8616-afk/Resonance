import { notFound } from "next/navigation";
import { loadTierTracker, PickTracker, TrackerShell } from "@/app/fights/tier-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tier tracker · Resonance 2.0",
};

export default async function TierSliceCardPage({
  params,
}: {
  params: Promise<{ slice: string; event: string }>;
}) {
  const { slice, event } = await params;
  const loaded = await loadTierTracker();
  const body = PickTracker({
    model: loaded.model,
    slice,
    event,
    from: "slice",
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
