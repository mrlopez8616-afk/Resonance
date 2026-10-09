import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalystWeekList } from "@/components/catalyst-calendar";
import { OperatorShell } from "@/components/operator-shell";
import { CATALYST_CALENDAR_HREF, catalystBucketLabel, isCatalystBucket } from "@/lib/catalyst-calendar";
import { loadCatalystPage } from "@/lib/catalyst-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  const label = isCatalystBucket(bucket) ? catalystBucketLabel(bucket) : "Week";
  return { title: `${label} · Catalysts · Resonance 2.0` };
}

export default async function CatalystWeekPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  if (!isCatalystBucket(bucket)) notFound();
  const { events, store } = await loadCatalystPage();
  return (
    <OperatorShell storageMessage={store.status === "seed-only" ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href={CATALYST_CALENDAR_HREF} className="calendar-back">
        Catalysts
      </Link>
      <h2 className="catalyst-week-title">{catalystBucketLabel(bucket)}</h2>
      <CatalystWeekList events={events} bucket={bucket} now={new Date()} />
    </OperatorShell>
  );
}
