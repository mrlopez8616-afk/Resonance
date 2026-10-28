import Link from "next/link";
import { notFound } from "next/navigation";
import { CrawlWalkRunItem } from "@/components/crawl-walk-run-floor";
import { OperatorShell } from "@/components/operator-shell";
import { cwrDetail, cwrGroup, groupHref } from "@/lib/crawl-walk-run";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ group: string; id: string }>;
}) {
  const { group, id } = await params;
  const found = cwrGroup(group);
  const detail = found ? cwrDetail(found.id, id) : null;
  return { title: `${detail?.item.title ?? "Crawl Walk Run"} · Resonance 2.0` };
}

export default async function CrawlWalkRunItemPage({
  params,
}: {
  params: Promise<{ group: string; id: string }>;
}) {
  const { group: slug, id } = await params;
  const group = cwrGroup(slug);
  if (!group) notFound();
  const detail = cwrDetail(group.id, id);
  if (!detail) notFound();
  return (
    <OperatorShell>
      <Link href={groupHref(group.id)} className="calendar-back">
        {group.label}
      </Link>
      <CrawlWalkRunItem detail={detail} />
    </OperatorShell>
  );
}
