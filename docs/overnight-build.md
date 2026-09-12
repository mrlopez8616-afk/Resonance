# Overnight build (2026-09-12)

Phase Zero now **behaves as if the books were already on-chain**. Same fields, receipts, and rules. Still Web2 only.

Walkthrough also lives in the app at **What changed**.

## What landed

1. **Treasury ledger** — Founder-reported Flare vault / Xaman principal trail starting 2026-08-28 (~20,000 XRP), weekly-class adds (~4k, then +1k, then +1k), residual to **~27,772 XRP** as of 2026-09-11/12. Principal never withdrawn. Yield (~1 XRP/day class) is ammo only and does not move working principal. Import/export: [`public/examples/treasury-ledger.json`](../public/examples/treasury-ledger.json).

2. **Decisions record book** — Chain-mimic rows: proposal, why, who authorized, outcome, evidence/receipt, timestamps, `fingerprint: null`. Seeded `D-2026-09-11-01` … `04`. Agentic autonomy may trade ETN/GEV under D-04. PWR / VRT / ETN / GEV outcomes are **QUEUED for Monday open — not filled**. Import/merge + export unchanged in spirit, improved copy.

3. **Robinhood categories** — **Main** (read-only learning / flatten Monday) vs **Agentic** (autonomous risk sleeve). Physical AI: PWR ETN VRT GEV CEG HUBB. Digital: BTC ETH SOL XRP SUI FLR. Venue badges: Robinhood / Xaman / founder-reported. Holdings snapshot example stays aligned with the seeded Main lots.

4. **Nav** — Overview skeleton nodes, Treasury ledger, Nodes, Robinhood/Agentic, Decisions, Prices, What changed, Settings. Dark operator aesthetic, mobile menu.

## Out of scope (unchanged)

No real blockchain, no XRS mint, no wallet keys, no silent Main trades.

## Doctrine

Keep [`recording-pipeline.md`](./recording-pipeline.md). Web2 mimics chain-class records now; exportable trail is the later XRPL / XRS handoff.
