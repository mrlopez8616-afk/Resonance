/**
 * Public architecture map. One source of truth for /n/system.
 * Copy stays free of amounts, account numbers, and secret values.
 */

export const SYSTEM_LENSES = [
  { id: "nodes", label: "Nodes" },
  { id: "flow", label: "Money flow" },
  { id: "sources", label: "Data sources" },
  { id: "agents", label: "Agents" },
  { id: "governance", label: "Governance" },
  { id: "timeline", label: "Timeline" },
] as const;

export type SystemLensId = (typeof SYSTEM_LENSES)[number]["id"];

export type SystemLink = {
  id: string;
  label: string;
  href: string | null;
};

export type SystemNode = {
  id: string;
  label: string;
  href: string | null;
  status: "live" | "coming";
  connection: string;
  children: readonly SystemLink[];
};

export const SYSTEM_NODES: readonly SystemNode[] = [
  {
    id: "crypto",
    label: "Crypto",
    href: "/n/crypto",
    status: "live",
    connection: "The XRP treasury feeds Crypto.",
    children: [
      { id: "xrp", label: "XRP", href: "/n/crypto/xrp" },
      { id: "sui", label: "SUI", href: "/n/crypto/sui" },
    ],
  },
  {
    id: "ai-stocks",
    label: "AI Stocks",
    href: "/n/ai-stocks",
    status: "live",
    connection: "The XRP treasury feeds AI Stocks.",
    children: [
      { id: "pwr", label: "PWR", href: "/n/ai-stocks/pwr" },
      { id: "vrt", label: "VRT", href: "/n/ai-stocks/vrt" },
      { id: "gev", label: "GEV", href: "/n/ai-stocks/gev" },
      { id: "ceg", label: "CEG", href: "/n/ai-stocks/ceg" },
      { id: "nvda", label: "NVDA", href: "/n/ai-stocks/nvda" },
      { id: "tsm", label: "TSM", href: "/n/ai-stocks/tsm" },
      { id: "tsla", label: "TSLA", href: "/n/ai-stocks/tsla" },
      { id: "spcx", label: "SPCX", href: "/n/ai-stocks/spcx" },
    ],
  },
  {
    id: "fitness",
    label: "Fitness",
    href: "/n/fitness",
    status: "live",
    connection: "Steps and Runs stay on this node.",
    children: [
      { id: "steps", label: "Steps", href: "/n/fitness/steps" },
      { id: "runs", label: "Runs", href: "/n/fitness/runs" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    href: "/n/finance",
    status: "live",
    connection: "A private snapshot. It does not join the treasury.",
    children: [
      { id: "cash-flow", label: "Cash Flow", href: "/n/finance/cash-flow" },
      { id: "bills", label: "Bills & Subscriptions", href: "/n/finance/bills" },
      { id: "debt", label: "Debt", href: "/n/finance/debt" },
      { id: "net-worth", label: "Net Worth", href: "/n/finance/net-worth" },
      { id: "fees", label: "Fees & Alerts", href: "/n/finance/fees" },
    ],
  },
  {
    id: "fight-desk",
    label: "Fight Desk",
    href: "/n/fight-desk",
    status: "live",
    connection: "Bankroll and Fights stay on this desk.",
    children: [
      { id: "bankroll", label: "Bankroll", href: "/n/fight-desk/bankroll" },
      { id: "fights", label: "Fights", href: "/fights" },
    ],
  },
  {
    id: "build",
    label: "Build",
    href: "/n/build",
    status: "live",
    connection: "The checklist, pull state, and the calendar build lane land here.",
    children: [],
  },
  {
    id: "youtube",
    label: "YouTube",
    href: null,
    status: "coming",
    connection: "Coming. YouTube Studio will run this node.",
    children: [],
  },
  {
    id: "lessons",
    label: "Lessons",
    href: "/n/lessons",
    status: "live",
    connection: "A dated log of what the floor learned.",
    children: [],
  },
];

export const SYSTEM_AGENTS = [
  {
    id: "sophia",
    name: "Sophia Luna",
    role: "Hub. Decisions, approvals, and merges, on the owner's word.",
    nodes: ["All nodes"],
  },
  {
    id: "robinhood-ops",
    name: "Robinhood Ops",
    role: "The only trader. Robinhood Agentic and Coinbase Agentic, only with the owner's yes.",
    nodes: ["Crypto", "AI Stocks"],
  },
  {
    id: "crypto-desk",
    name: "Crypto Desk",
    role: "Keeps the crypto node current.",
    nodes: ["Crypto"],
  },
  {
    id: "ai-stocks-desk",
    name: "AI Stocks Desk",
    role: "Keeps the eight AI names current.",
    nodes: ["AI Stocks"],
  },
  {
    id: "fight-desk",
    name: "Fight Desk",
    role: "Runs the fight book.",
    nodes: ["Fight Desk"],
  },
  {
    id: "fitness-coach",
    name: "Fitness Coach",
    role: "Runs steps and runs.",
    nodes: ["Fitness"],
  },
  {
    id: "finance-desk",
    name: "Finance Desk",
    role: "Posts the encrypted finance snapshot.",
    nodes: ["Finance"],
  },
  {
    id: "youtube-studio",
    name: "YouTube Studio",
    role: "Will run the video node.",
    nodes: ["YouTube"],
  },
  {
    id: "architect",
    name: "Architect",
    role: "Site builder.",
    nodes: ["Build"],
  },
] as const;

export const SYSTEM_HOME_LINE = `${SYSTEM_AGENTS.length} agents · ${SYSTEM_NODES.length} nodes · all protections on`;

export const SYSTEM_PAGE = {
  kicker: "System",
  title: "Map",
  line: SYSTEM_HOME_LINE,
} as const;

export const SYSTEM_FEED = {
  from: "XRP treasury",
  summary: "The XRP treasury feeds Crypto and AI Stocks.",
  to: [
    { id: "crypto", label: "Crypto", href: "/n/crypto" },
    { id: "ai-stocks", label: "AI Stocks", href: "/n/ai-stocks" },
  ],
} as const;

export type FlowBranch = {
  id: string;
  title: string;
  detail: string;
};

export type FlowStep = {
  id: string;
  title: string;
  detail: string;
  branches?: readonly FlowBranch[];
};

export const MONEY_FLOW = {
  rule: "The payout is split evenly across nine nodes: SUI and the eight AI names. Every move needs the owner's yes.",
  steps: [
    { id: "checking", title: "Checking", detail: "Credit union." },
    { id: "buy", title: "Coinbase", detail: "Buy XRP." },
    {
      id: "treasury",
      title: "Xaman wallet",
      detail: "The XRP treasury. Manual transfers by the owner.",
    },
    { id: "payout", title: "Back to Coinbase", detail: "Treasury payouts return here." },
    {
      id: "split",
      title: "The split",
      detail: "Even across nine nodes.",
      branches: [
        { id: "sui", title: "SUI share", detail: "Bought in Coinbase Agentic." },
        {
          id: "ai",
          title: "The rest",
          detail: "Wallet to wallet into Robinhood Agentic for the eight AI nodes.",
        },
      ],
    },
  ] satisfies readonly FlowStep[],
};

export const DATA_SOURCES = [
  {
    id: "robinhood",
    name: "Robinhood",
    feeds: "Fills posted by Robinhood Ops through /api/fills. They update the fill log and the Robinhood Agentic sleeves.",
    cadence: "When an approved fill is posted. The floor does not poll the broker.",
  },
  {
    id: "coinbase",
    name: "Coinbase",
    feeds: "The cb-agentic sleeve and the Default sleeve on the crypto books.",
    cadence: "When a Coinbase fill is posted. The floor does not poll Coinbase.",
  },
  {
    id: "plaid",
    name: "Finance connector via Plaid",
    feeds: "An encrypted snapshot written by Finance Desk. It feeds Cash Flow, Bills and Subscriptions, Debt, Net Worth, and Fees and Alerts.",
    cadence: "When Finance Desk posts a snapshot. A snapshot older than two days is marked stale. Only the owner can read it.",
  },
  {
    id: "health",
    name: "Apple Health",
    feeds: "Steps and Runs, through iOS Shortcuts to /api/fitness/ingest.",
    cadence: "When the shortcut runs.",
  },
  {
    id: "prices",
    name: "CoinGecko and Yahoo Finance",
    feeds: "CoinGecko supplies crypto prices and history. Yahoo Finance supplies equity prices and history for the eight AI names.",
    cadence: "On each page view. Live quotes are reused for about 30 seconds. History is reused for about 15 minutes.",
  },
  {
    id: "github",
    name: "GitHub",
    feeds: "Pull state for the Build Tracker.",
    cadence: "Cached for about 10 minutes. If GitHub is rate-limited, the tracker keeps the last stored steps.",
  },
  {
    id: "github-actions",
    name: "GitHub Actions",
    feeds: "The calendar build lane. The workflow posts a build row on the operating calendar.",
    cadence: "When a pull request is opened, marked ready, reopened, or closed.",
  },
  {
    id: "build-api",
    name: "Build Tracker API",
    feeds: "The Build node checklist. GET /api/build/items lists items. POST /api/build/items and PATCH /api/build/items update them.",
    cadence: "When the hub reads or posts a checklist change. A read allows the owner session or the server secret. Writes need the server secret.",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    feeds: "The operating calendar and the catalyst lines on Crypto and AI Stocks.",
    cadence: "When events are posted. The floor reads the stored calendar.",
  },
] as const;

/**
 * Sleeves a posted fill can cross. Ids match the books the map already names.
 * `coinbase` is the Coinbase book, distinct from the Coinbase data source.
 */
export const SYSTEM_SLEEVES = [
  {
    id: "rh-agentic",
    label: "Robinhood Agentic",
    sourceId: "robinhood",
    nodes: ["crypto", "ai-stocks"],
  },
  {
    id: "cb-agentic",
    label: "Coinbase Agentic",
    sourceId: "coinbase",
    nodes: ["crypto"],
  },
  {
    id: "coinbase",
    label: "Coinbase book",
    sourceId: "coinbase",
    nodes: ["crypto"],
  },
] as const;

/** Floor-node ids each data source reaches. */
export const SOURCE_REACH = {
  robinhood: ["crypto", "ai-stocks"],
  coinbase: ["crypto"],
  plaid: ["finance"],
  health: ["fitness"],
  prices: ["crypto", "ai-stocks"],
  github: ["build"],
  "github-actions": ["build"],
  "build-api": ["build"],
  calendar: ["fight-desk", "crypto", "ai-stocks", "build"],
} as const satisfies Record<(typeof DATA_SOURCES)[number]["id"], readonly string[]>;

export const GOVERNANCE = [
  {
    id: "login",
    scope: "Whole site",
    title: "Password and a 6-digit code",
    detail: "Every page stays behind the password and a 6-digit authenticator code.",
  },
  {
    id: "finance",
    scope: "Finance",
    title: "Encrypted at rest",
    detail: "Finance data is encrypted at rest with AES-256-GCM and is readable by the owner only.",
  },
  {
    id: "writes",
    scope: "Write APIs",
    title: "Server-side secret",
    detail: "Write APIs need a server-side secret. Secrets never sit in client code or in the repo.",
  },
  {
    id: "hold",
    scope: "Crypto and AI Stocks",
    title: "Hold order",
    detail: "No trades without the owner's yes.",
  },
  {
    id: "log",
    scope: "Fill log",
    title: "Approved trades log themselves",
    detail: "An approved trade is written to the fill log automatically.",
  },
  {
    id: "broker",
    scope: "Main brokerage account",
    title: "Read only",
    detail: "The main brokerage account is read-only.",
  },
  {
    id: "vault",
    scope: "XRP treasury",
    title: "Manual vault",
    detail: "The treasury vault is manual and is never touched by bots.",
  },
  {
    id: "merges",
    scope: "Code merges",
    title: "Asked-for builds only",
    detail:
      "Code merges are pre-authorized only for builds the owner asked for. Anything that touches money movement, secrets, or the hold order needs the owner's explicit yes.",
  },
  {
    id: "budget",
    scope: "Build",
    title: "One production build",
    detail: "One production build per update. Previews stay off.",
  },
  {
    id: "values",
    scope: "Every value",
    title: "No invented values",
    detail: "Never invent a value. Never show a zero-dollar figure.",
  },
] as const;

export const TIMELINE = [
  { id: "p0", phase: "Phase 0", when: "Sep 11-13", title: "Foundation" },
  { id: "p1", phase: "Phase 1", when: "Sep 18-22", title: "Resonance 2.0 and the live floor" },
  { id: "p2", phase: "Phase 2", when: "Sep 23-Oct 2", title: "Calendar and briefs" },
  { id: "p3", phase: "Phase 3", when: "Oct 3-7", title: "Fight Desk, database, parent nodes" },
  { id: "p4", phase: "Phase 4", when: "Oct 8", title: "Lock-down and new nodes" },
  {
    id: "oct9",
    phase: "Oct 9",
    when: "Oct 9",
    title: "8-stock core, child pages, lots ledger, Coinbase parity, installable app",
  },
] as const;

export function parseSystemLens(value: string | string[] | undefined): SystemLensId {
  const raw = Array.isArray(value) ? value[0] : value;
  const found = SYSTEM_LENSES.find((lens) => lens.id === raw);
  return found?.id ?? "nodes";
}

export function systemLensHref(id: SystemLensId): string {
  return id === "nodes" ? "/n/system" : `/n/system?lens=${id}`;
}

/** Live page links painted from the map. Coming nodes contribute none. */
export function systemNodeHrefs(): string[] {
  const hrefs: string[] = [];
  const push = (href: string | null) => {
    if (href) hrefs.push(href);
  };
  for (const target of SYSTEM_FEED.to) push(target.href);
  for (const node of SYSTEM_NODES) {
    push(node.href);
    for (const child of node.children) push(child.href);
  }
  return hrefs;
}
