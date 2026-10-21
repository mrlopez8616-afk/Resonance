import { notFound } from "next/navigation";
import { loadTierTracker, SliceTracker, TrackerShell } from "@/app/fights/tier-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tier tracker · Resonance 2.0",
};

export default async function TierSlicePage({
  params,
}: {
  params: Promise<{ slice: string }>;
}) {
  const { slice } = await params;
  const loaded = await loadTierTracker();
  const body = SliceTracker({
    model: loaded.model,
    slice,
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
