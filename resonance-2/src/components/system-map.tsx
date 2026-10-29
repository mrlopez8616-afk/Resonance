import Link from "next/link";
import { NodeFace } from "@/components/node-face";
import { systemHomeFace } from "@/lib/home-faces";
import { navHrefShelved, visibleById } from "@/lib/node-visibility";
import { financePageLocked } from "@/lib/public-mode";
import {
  DATA_SOURCES,
  GOVERNANCE,
  MONEY_FLOW,
  SYSTEM_AGENTS,
  SYSTEM_FEED,
  SYSTEM_LENSES,
  SYSTEM_NODES,
  SYSTEM_PAGE,
  TIMELINE,
  systemLensHref,
  type SystemLensId,
} from "@/data/system-map";

const styles = {
  root: "system-map",
  lenses: "system-lenses",
  feed: "system-feed",
  feedNode: "system-feedNode",
  arrow: "system-arrow",
  feedTargets: "system-feedTargets",
  caption: "system-caption",
  cards: "system-cards",
  card: "system-card",
  cardHead: "system-cardHead",
  cardTitle: "system-cardTitle",
  chip: "system-chip",
  detail: "system-detail",
  chips: "system-chips",
  flow: "system-flow",
  flowItem: "system-flowItem",
  step: "system-step",
  branches: "system-branches",
  branch: "system-branch",
  ruleNote: "system-ruleNote",
  stack: "system-stack",
  source: "system-source",
  meta: "system-meta",
  agent: "system-agent",
  agentHead: "system-agentHead",
  kicker: "system-kicker",
  rule: "system-rule",
  timeline: "system-timeline",
  phase: "system-phase",
  phaseHead: "system-phaseHead",
  when: "system-when",
  home: "system-home",
  homeLine: "system-homeLine",
} as const;

function FlowArrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 24 28" aria-hidden="true">
      <path
        d="M12 2v18M6 14l6 8 6-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NodeLinks({ lens, live = false }: { lens: SystemLensId | null; live?: boolean }) {
  return (
    <nav className={styles.lenses} aria-label="System lenses">
      {SYSTEM_LENSES.map((item) => (
        <Link
          key={item.id}
          href={systemLensHref(item.id)}
          aria-current={item.id === lens ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
      <Link href="/n/system/live" aria-current={live ? "page" : undefined}>
        Live
      </Link>
      <Link href="/tv">Factory Floor</Link>
    </nav>
  );
}

export function SystemLensNav({ live = false }: { live?: boolean }) {
  return <NodeLinks lens={null} live={live} />;
}

function shownHref(href: string | null, publicMode: boolean): string | null {
  if (!href || navHrefShelved(href)) return null;
  if (publicMode && financePageLocked(href)) return null;
  return href;
}

function FeedLink({ href, label }: { href: string; label: string }) {
  if (!href) return <span>{label}</span>;
  return <Link href={href}>{label}</Link>;
}

function NodesLens({ publicMode }: { publicMode: boolean }) {
  const nodes = visibleById(SYSTEM_NODES);
  return (
    <>
      <figure className={styles.feed}>
        <p className={styles.feedNode}>{SYSTEM_FEED.from}</p>
        <FlowArrow />
        <div className={styles.feedTargets}>
          {SYSTEM_FEED.to.map((target) => (
            <FeedLink key={target.id} href={shownHref(target.href, publicMode) ?? ""} label={target.label} />
          ))}
        </div>
        <figcaption className={styles.caption}>{SYSTEM_FEED.summary}</figcaption>
      </figure>
      <div className={styles.cards}>
        {nodes.map((node) => (
          <article key={node.id} className={styles.card}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>
                {shownHref(node.href, publicMode) ? (
                  <Link href={shownHref(node.href, publicMode) ?? ""}>{node.label}</Link>
                ) : (
                  node.label
                )}
              </h3>
              {node.status === "coming" ? <span className={styles.chip}>Coming</span> : null}
            </div>
            <p className={styles.detail}>{node.connection}</p>
            {node.children.length > 0 ? (
              <ul className={styles.chips}>
                {node.children.map((child) => {
                  const href = shownHref(child.href, publicMode);
                  if (child.href && !href && navHrefShelved(child.href)) return null;
                  return (
                  <li key={child.id}>
                    {href ? <Link href={href}>{child.label}</Link> : <span>{child.label}</span>}
                  </li>
                  );
                })}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}

function FlowLens() {
  return (
    <>
      <ol className={styles.flow}>
        {MONEY_FLOW.steps.map((step, index) => (
          <li key={step.id} className={styles.flowItem}>
            {index > 0 ? <FlowArrow /> : null}
            <article className={styles.step}>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
              {step.branches ? (
                <div className={styles.branches}>
                  {step.branches.map((branch) => (
                    <article key={branch.id} className={styles.branch}>
                      <h3>{branch.title}</h3>
                      <p>{branch.detail}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
      <p className={styles.ruleNote}>{MONEY_FLOW.rule}</p>
    </>
  );
}

function SourcesLens() {
  return (
    <div className={styles.stack}>
      {DATA_SOURCES.map((source) => (
        <article key={source.id} className={styles.source}>
          <h3>{source.name}</h3>
          <p>{source.feeds}</p>
          <p className={styles.meta}>{source.cadence}</p>
        </article>
      ))}
    </div>
  );
}

function AgentsLens() {
  return (
    <div className={styles.stack}>
      {SYSTEM_AGENTS.map((agent) => (
        <article key={agent.id} className={styles.agent}>
          <div className={styles.agentHead}>
            <h3>{agent.name}</h3>
          </div>
          <p>{agent.role}</p>
          <p className={styles.meta}>Runs {agent.nodes.join(", ")}</p>
        </article>
      ))}
    </div>
  );
}

function GovernanceLens() {
  return (
    <div className={styles.stack}>
      {GOVERNANCE.map((item) => (
        <article key={item.id} className={styles.rule}>
          <p className={styles.kicker}>{item.scope}</p>
          <h3>{item.title}</h3>
          <p>{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function TimelineLens() {
  return (
    <ol className={styles.timeline}>
      {TIMELINE.map((item) => (
        <li key={item.id}>
          <article className={styles.phase}>
            <div className={styles.phaseHead}>
              <h3>{item.phase}</h3>
              {item.when === item.phase ? null : <p className={styles.when}>{item.when}</p>}
            </div>
            <p>{item.title}</p>
          </article>
        </li>
      ))}
    </ol>
  );
}

const LENSES = {
  flow: FlowLens,
  sources: SourcesLens,
  agents: AgentsLens,
  governance: GovernanceLens,
  timeline: TimelineLens,
} as const;

function paintedNodeCount(): number {
  return visibleById(SYSTEM_NODES).length;
}

export function SystemMap({ lens, publicMode = false }: { lens: SystemLensId; publicMode?: boolean }) {
  const Lens = lens === "nodes" ? null : LENSES[lens];
  const line = `${SYSTEM_AGENTS.length} agents · ${paintedNodeCount()} nodes · all protections on`;
  return (
    <div className={styles.root} data-lens={lens}>
      <header className="log-header">
        <p className="log-kicker">{SYSTEM_PAGE.kicker}</p>
        <h2 className="log-title">{SYSTEM_PAGE.title}</h2>
        <p className="log-meta">{line}</p>
      </header>
      <NodeLinks lens={lens} />
      {lens === "nodes" ? <NodesLens publicMode={publicMode} /> : Lens ? <Lens /> : null}
    </div>
  );
}

export function SystemHomeCard() {
  return <NodeFace face={systemHomeFace(SYSTEM_AGENTS.length, paintedNodeCount())} />;
}
