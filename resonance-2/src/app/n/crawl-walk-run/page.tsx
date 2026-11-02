import { CrawlWalkRunParent } from "@/components/crawl-walk-run-floor";
import { OperatorShell } from "@/components/operator-shell";

export const metadata = {
  title: "Crawl Walk Run · Resonance 2.0",
};

export default function CrawlWalkRunPage() {
  return (
    <OperatorShell>
      <CrawlWalkRunParent />
    </OperatorShell>
  );
}
