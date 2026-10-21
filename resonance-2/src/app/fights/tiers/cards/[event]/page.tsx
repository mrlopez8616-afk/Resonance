import { notFound } from "next/navigation";
import { CardTracker, loadTierTracker, TrackerShell } from "@/app/fights/tier-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tier tracker · Resonance 2.0",
};

export default async function TierCardPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const loaded = await loadTierTracker();
  const body = CardTracker({
    model: loaded.model,
    event,
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
