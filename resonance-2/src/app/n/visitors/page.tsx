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
      <VisitorsFloor summary={summary} />
    </OperatorShell>
  );
}
