import Link from "next/link";
import { XrpTriggerFloor } from "@/components/xrp-trigger-floor";
import { OperatorShell } from "@/components/operator-shell";
import { isPublicMode } from "@/lib/public-mode-server";
import { loadXrpTriggerCloses, xrpTriggerAgeLabel } from "@/lib/price-history";
import { evaluateXrpTrigger } from "@/lib/xrp-trigger";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "XRP Trigger · Crypto · Resonance 2.0",
};

export default async function XrpTriggerPage() {
  const [pub, closes] = await Promise.all([isPublicMode(), loadXrpTriggerCloses()]);
  const now = new Date();
  const view = evaluateXrpTrigger(closes ?? [], now);
  return (
    <OperatorShell>
      <Link href="/n/crypto" className="calendar-back">
        Crypto
      </Link>
      <XrpTriggerFloor
        view={view}
        publicMode={pub}
        staleLabel={closes ? xrpTriggerAgeLabel(now) : null}
      />
    </OperatorShell>
  );
}
