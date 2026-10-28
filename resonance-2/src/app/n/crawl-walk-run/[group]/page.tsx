import Link from "next/link";
import { notFound } from "next/navigation";
import { CrawlWalkRunGroup } from "@/components/crawl-walk-run-floor";
import { OperatorShell } from "@/components/operator-shell";
import { CWR_HREF, cwrGroup } from "@/lib/crawl-walk-run";

export function generateStaticParams() {
  return [{ group: "built" }, { group: "planned" }, { group: "recommended" }];
}

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const found = cwrGroup(group);
  return { title: `${found?.label ?? "Crawl Walk Run"} · Resonance 2.0` };
}

export default async function CrawlWalkRunGroupPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group: slug } = await params;
  const group = cwrGroup(slug);
  if (!group) notFound();
  return (
    <OperatorShell>
      <Link href={CWR_HREF} className="calendar-back">
        Crawl Walk Run
      </Link>
      <CrawlWalkRunGroup group={group.id} />
    </OperatorShell>
  );
}
