import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalystEventDetail } from "@/components/catalyst-calendar";
import { OperatorShell } from "@/components/operator-shell";
import {
  catalystBucketHref,
  catalystBucketId,
  catalystBucketLabel,
  isCatalystBucket,
} from "@/lib/catalyst-calendar";
import { loadCatalystPage } from "@/lib/catalyst-page";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bucket: string; event: string }>;
}) {
  const { event: eventId } = await params;
  const { events } = await loadCatalystPage();
  const event = events.find((item) => item.id === eventId && item.kind === "catalyst");
  return { title: `${event?.title ?? "Catalyst"} · Resonance 2.0` };
}

export default async function CatalystEventPage({
  params,
}: {
  params: Promise<{ bucket: string; event: string }>;
}) {
  const { bucket, event: eventId } = await params;
  if (!isCatalystBucket(bucket)) notFound();
  const { events, store } = await loadCatalystPage();
  const now = new Date();
  const event = events.find((item) => item.id === eventId && item.kind === "catalyst");
  if (!event || catalystBucketId(event, now) !== bucket) notFound();
  return (
    <OperatorShell storageMessage={store.status === "seed-only" ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href={catalystBucketHref(bucket)} className="calendar-back">
        {catalystBucketLabel(bucket)}
      </Link>
      <CatalystEventDetail event={event} />
    </OperatorShell>
  );
}
