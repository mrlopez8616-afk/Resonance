import Link from "next/link";
import { WhatsNewCard } from "@/components/whats-new";
import { PageHeader } from "@/components/page-header";

export default function WhatsNewPage() {
  return (
    <div>
      <PageHeader
        kicker="Playbook"
        title="What changed overnight"
        description="Phase Zero now behaves as if the books were already on-chain: same fields, receipts, and rules. Still Web2 only."
      />

      <WhatsNewCard />

      <ol className="mb-8 space-y-6">
        <li className="card">
          <p className="kicker">1 · Treasury</p>
          <h2 className="mt-2 text-lg">Founder-reported Flare / Xaman trail</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Working principal is ~27,772 XRP as of 2026-09-11/12. The ledger
            walks Aug 28 ~20,000 → +~4k → +1k → +1k → residual to current
            books. Principal was never withdrawn. Yield (~1 XRP/day class) is
            ammo only and does not move working principal. Badge every figure
            founder-reported until a later read-only XRPL watch.
          </p>
          <p className="mt-3">
            <Link href="/treasury" className="text-sm text-[color:var(--accent)]">
              Open Treasury ledger
            </Link>
          </p>
        </li>
        <li className="card">
          <p className="kicker">2 · Decisions</p>
          <h2 className="mt-2 text-lg">Record book is the chain-mimic schema</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Every row already has proposal, why, who authorized, outcome,
            evidence/receipt, timestamps, and <span className="font-mono">fingerprint: null</span>.
            Seeded D-2026-09-11-01…04. Agentic autonomy may trade ETN/GEV
            under D-04. PWR, VRT, ETN, and GEV outcomes are QUEUED for Monday
            open — not filled. Import/merge and export stay on the page.
          </p>
          <p className="mt-3">
            <Link href="/decisions" className="text-sm text-[color:var(--accent)]">
              Open record book
            </Link>
          </p>
        </li>
        <li className="card">
          <p className="kicker">3 · Robinhood</p>
          <h2 className="mt-2 text-lg">Main vs Agentic, plus venue badges</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Main = read-only learning lots, flatten Monday (CEG ETN PWR GEV
            HUBB VRT). Agentic = autonomous risk sleeve (PWR $35, VRT $17,
            ETN/GEV under D-04). Physical AI vs digital rails are labeled.
            Venue badges: Robinhood, Xaman, founder-reported. No silent Main
            trades.
          </p>
          <p className="mt-3">
            <Link href="/robinhood" className="text-sm text-[color:var(--accent)]">
              Open Robinhood / Agentic
            </Link>
          </p>
        </li>
        <li className="card">
          <p className="kicker">4 · Dual surface</p>
          <h2 className="mt-2 text-lg">Private board vs public skeleton</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Private / gated: exact XRP, RH ties, receipts. Public{" "}
            <Link href="/public" className="text-[color:var(--accent)]">
              /public
            </Link>{" "}
            : twelve-node target % only. Hedera Hashgraph is the attestation
            witness. Phase 0.5 can attest a decided row on{" "}
            <span className="font-mono">Testnet</span> — public fingerprint
            only, no dollar amounts in the memo.
          </p>
        </li>
        <li className="card">
          <p className="kicker">5 · Still out of scope</p>
          <h2 className="mt-2 text-lg">No Mainnet, no seed phrases, no XRS</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Recording-pipeline doctrine is unchanged: Web2 mimics chain-class
            records now; a later exportable trail is the XRPL/XRS handoff.
            Phase 0.5 Testnet attest uses a server env key only — never paste
            it into chat. See the playbook pointer in docs.
          </p>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Docs: <span className="font-mono text-xs">docs/recording-pipeline.md</span>{" "}
            · <span className="font-mono text-xs">docs/overnight-build.md</span>
          </p>
        </li>
      </ol>
    </div>
  );
}
