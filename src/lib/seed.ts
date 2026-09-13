import { LOCKED_DECISIONS_2026_09_11 } from "./decisions";
import { applySeedHolding, LOCKED_AGENTIC_INTENTS } from "./robinhood";
import {
  LOCKED_TREASURY_LEDGER,
  TREASURY_AS_OF,
  TREASURY_CURRENT_UNITS,
} from "./treasury-ledger";
import { STATE_VERSION, type AppState, type Node } from "./types";

function node(
  ticker: string,
  name: string,
  assetClass: Node["class"],
  status: Node["status"],
  thesis: string,
  failureCondition: string,
  links: Node["links"] = [],
): Node {
  return {
    id: `node-${ticker.toLowerCase()}`,
    ticker,
    name,
    class: assetClass,
    thesis,
    failureCondition,
    status,
    manualPriceUsd: null,
    manualPriceUpdatedAt: null,
    quantity: null,
    averageCost: null,
    venue: "",
    lastSyncedAt: null,
    syncSource: null,
    holdingsNote: "",
    sleeve: "none",
    publicAllocationPct: null,
    links,
  };
}

export function createSeedState(now = TREASURY_AS_OF): AppState {
  const nodes = [
    node(
      "BTC",
      "Bitcoin",
      "digital",
      "watch",
      "Long-duration monetary reserve. Fund only from realized rewards after treasury principal is stable.",
      "Thesis fails if a funded position would require spending XRP principal, or if custody cannot be described in one sentence.",
    ),
    node(
      "ETH",
      "Ethereum",
      "digital",
      "watch",
      "Settlement and DeFi optionality. Watch until rewards can size a position without touching XRP principal.",
      "Abandon if gas, custody, or protocol risk cannot be named before funding.",
    ),
    node(
      "SOL",
      "Solana",
      "digital",
      "watch",
      "High-throughput L1. Unfunded watch until size, venue, and failure condition are written down.",
      "Do not fund while the written size is blank or while treasury rewards are still needed to rebuild principal.",
    ),
    node(
      "XRP",
      "XRP",
      "digital",
      "funded",
      "Operating treasury rail. Keep principal intact. Realized Flare-vault rewards may later fund other nodes. Robinhood also holds a small separate XRP bag.",
      "Reduce or exit the yield overlay if principal is at risk, rewards cannot be reconciled, or custody leaves Xaman/Flare undocumented.",
      [
        {
          targetTicker: "FLR",
          kind: "depends-on",
          note: "Flare vault overlay for yield — secondary to XRP principal.",
        },
      ],
    ),
    node(
      "SUI",
      "Sui",
      "digital",
      "watch",
      "Move-based L1 option. Thesis is incomplete — tracking only.",
      "Remain unfunded until a specific use and a maximum loss are written.",
    ),
    node(
      "FLR",
      "Flare",
      "digital",
      "watch",
      "Venue layer for XRP vault / DeFi yield. Secondary to treasury preservation. MetaMask is a play surface, not the books.",
      "Stop the overlay if yield requires locking principal on terms you cannot explain, or if FLR exposure becomes the position instead of XRP.",
      [
        {
          targetTicker: "XRP",
          kind: "related",
          note: "Yield venue for the XRP treasury, not the books of record.",
        },
      ],
    ),
    node(
      "PWR",
      "Quanta Services",
      "physical",
      "watch",
      "US equity. Electrical infrastructure exposed to grid and compute-load buildout (Quanta).",
      "Drop to none if the thesis becomes a trade without a holding period and a max loss, or if funding would tap XRP principal.",
    ),
    node(
      "ETN",
      "Eaton",
      "physical",
      "watch",
      "US equity. Power management and electrical equipment (Eaton).",
      "Invalid if position sizing is not funded from realized rewards or if the company-level thesis cannot be restated in two lines.",
    ),
    node(
      "VRT",
      "Vertiv",
      "physical",
      "watch",
      "US equity. Data-center thermal and power infrastructure (Vertiv).",
      "Watch only until a written entry price band and a reason to sell exist.",
    ),
    node(
      "GEV",
      "GE Vernova",
      "physical",
      "watch",
      "US equity. Grid and generation transition (GE Vernova).",
      "Do not fund as a momentum ticker. Require a cycle-length holding thesis first.",
    ),
    node(
      "CEG",
      "Constellation Energy",
      "physical",
      "watch",
      "US equity. Contracted power and nuclear generation (Constellation).",
      "Failure if the thesis depends on a single headline rather than contracted cash flows you can point to.",
    ),
    node(
      "HUBB",
      "Hubbell",
      "physical",
      "watch",
      "US equity. Electrical products into construction and utility channels (Hubbell).",
      "Remain unfunded until rewards coverage and a boring holding period are specified.",
    ),
  ].map(applySeedHolding);

  return {
    version: STATE_VERSION,
    treasury: {
      units: TREASURY_CURRENT_UNITS,
      asset: "XRP",
      venue: "Xaman",
      locationNote: "Flare vault / Xaman principal trail starting 2026-08-28",
      estimatedDailyReward: 1,
      manualUsdPerXrp: null,
      provenance: "founder-reported",
      updatedAt: now,
    },
    venues: [
      {
        id: "venue-robinhood",
        name: "Robinhood",
        role: "Main learning account + Agentic risk sleeve",
        notes:
          "Two sleeves, one venue. Main is read-only learning / flatten Monday (D-01) — Resonance never places silent Main trades. Agentic is the autonomous risk sleeve (D-03/D-04). Robinhood XRP is a separate bag from the Xaman treasury. Resonance does not call Robinhood — paste a JSON snapshot from Grok Bot.",
      },
      {
        id: "venue-coinbase",
        name: "Coinbase",
        role: "General",
        notes: "General exchange venue. Import of statements is a later phase.",
      },
      {
        id: "venue-xaman",
        name: "Xaman",
        role: "Treasury",
        notes:
          "Treasury wallet of record for XRP principal. Flare vault overlay. Public address watch is future work. Figures are founder-reported until verified.",
      },
      {
        id: "venue-metamask",
        name: "MetaMask",
        role: "Secondary — Flare DeFi play",
        notes: "Secondary surface for Flare DeFi. Not the vault of record.",
      },
    ],
    nodes,
    ledger: [...LOCKED_TREASURY_LEDGER],
    decisions: [
      ...LOCKED_DECISIONS_2026_09_11,
      {
        id: "dec-vault",
        question: "Keep XRP principal in the Flare vault, or hold liquid on Xaman?",
        proposal: "Keep XRP principal in the Flare vault and harvest rewards.",
        options: "Keep in vault and harvest rewards · Hold liquid on Xaman · Split",
        status: "decided",
        decision:
          "Keep principal in the Flare vault. Do not spend principal. Use realized rewards later to fund other nodes.",
        rationale:
          "Principal is the operating priority. Realized rewards, not principal, fund later nodes. Yield (~1 XRP/day class) is ammo only.",
        authorizedBy: "Andres López",
        outcome:
          "Principal remains in the Flare vault (founder-reported, ~27,772 XRP as of 2026-09-11/12). Not chain-verified. Principal never withdrawn.",
        evidence:
          "Founder-reported Xaman / Flare vault trail from 2026-08-28 (~20k → +~4k → +1k → +1k → 27,772). Phase Zero does not verify on-chain yet.",
        reviewTrigger:
          "If vault terms cannot be explained in one sentence, or principal is at risk.",
        fingerprint: null,
        attestationStatus: "web2_only",
        hederaMessageId: null,
        attestedAt: null,
        xrplTxHash: null,
        xrplMemoAt: null,
        date: "2026-08-20",
        createdAt: "2026-08-20T16:00:00.000Z",
      },
    ],
    agenticIntents: [...LOCKED_AGENTIC_INTENTS],
    settings: {
      operatorName: "Andres López",
      operatingPriority:
        "Build and add to treasury. Keep principal. Yield is ammo only. Use realized rewards later to fund other nodes. Main Robinhood lots flatten Monday; Agentic is the only autonomous sleeve.",
      xrplWatchAddress: "",
      showYoutubeStub: true,
    },
  };
}
