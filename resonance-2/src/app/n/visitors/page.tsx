import Link from "next/link";
import { VisitorsFloor } from "@/components/visitors-floor";
import { OperatorShell } from "@/components/operator-shell";
import { readVisitorSummary } from "@/lib/visitors-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Visitors · Resonance 2.0",
};

export default async function VisitorsPage() {
  const summary = await readVisitorSummary();
  return (
    <OperatorShell>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <header className="log-header">
        <p className="log-kicker">Visitors</p>
        <h2 className="log-title">Anonymous counts</h2>
      </header>
      <VisitorsFloor summary={summary} />
    </OperatorShell>
  );
}
