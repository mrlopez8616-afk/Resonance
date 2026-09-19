import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { assembleXrpFace } from "@/lib/xrp-face";
import { loadXrpQuote } from "@/lib/xrp-price";

export const dynamic = "force-dynamic";

export default async function Home() {
  const quote = await loadXrpQuote();
  const face = assembleXrpFace(undefined, quote);

  return (
    <OperatorShell>
      <NodeGrid face={face} />
    </OperatorShell>
  );
}
