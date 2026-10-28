import Link from "next/link";
import { CrawlWalkRunParent } from "@/components/crawl-walk-run-floor";
import { OperatorShell } from "@/components/operator-shell";
import { CWR_BUILD_HREF } from "@/lib/crawl-walk-run";

export const metadata = {
  title: "Crawl Walk Run · Resonance 2.0",
};

export default function CrawlWalkRunPage() {
  return (
    <OperatorShell>
      <Link href={CWR_BUILD_HREF} className="calendar-back">
        Build
      </Link>
      <CrawlWalkRunParent />
    </OperatorShell>
  );
}
