import { HomeTracker, loadTierTracker, TrackerShell } from "@/app/fights/tier-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tier tracker · Resonance 2.0",
};

export default async function TierTrackerPage() {
  const loaded = await loadTierTracker();
  return (
    <TrackerShell storageMessage={loaded.storageMessage} storageDetail={loaded.storageDetail}>
      <HomeTracker model={loaded.model} meta={loaded.meta} publicMode={loaded.publicMode} />
    </TrackerShell>
  );
}
