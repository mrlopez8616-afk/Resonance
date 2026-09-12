import Link from "next/link";

export function WhatsNewCard({ compact = false }: { compact?: boolean }) {
  return (
    <section className="notice notice-warn mb-8">
      <p className="kicker">Overnight build · 2026-09-12</p>
      <h2 className="mt-2 text-lg text-[color:var(--text)]">
        Web2 now mimics the on-chain record
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6">
        Same fields, receipts, and rules as a later chain commit — still no
        wallet, no XRS mint, no silent Main trades. Fresh books show the
        founder-reported Flare/Xaman trail (~20k on Aug 28 → ~27,772 as of
        Sep 11/12), Decisions D-01…04 with queued ≠ filled, and Robinhood
        Main vs Agentic sleeves.
      </p>
      {compact ? (
        <p className="mt-3">
          <Link href="/whats-new" className="text-sm text-[color:var(--accent)]">
            What changed overnight
          </Link>
        </p>
      ) : null}
    </section>
  );
}
