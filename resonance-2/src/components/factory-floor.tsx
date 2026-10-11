import type { ReactNode } from "react";
import { MachineHealthSlot } from "@/components/machine-health";
import type { FactoryFloorModel } from "@/lib/factory-floor";

function Panel({
  title,
  label,
  children,
  className = "",
}: {
  title: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`tv-panel ${className}`.trim()} aria-label={label} data-panel={label}>
      <h2 className="tv-kicker">{title}</h2>
      {children}
    </section>
  );
}

function Missing({ text }: { text: string }) {
  return <p className="tv-missing">{text}</p>;
}

export function FactoryFloorView({ model, map }: { model: FactoryFloorModel; map: ReactNode }) {
  return (
    <div className="tv-wall" data-tv-wall data-public="1">
      <header className="tv-header">
        <p className="tv-brand">Factory Floor</p>
        <p className="tv-clock">{model.clock}</p>
      </header>
      <div className="tv-body">
        <section className="tv-nodes" aria-label="Portfolio">
          <div className="tv-nodes-grid">
            {model.nodes.map((node) => (
              <article key={node.ticker} className="tv-node" data-node={node.ticker}>
                <h2 className="tv-ticker">{node.ticker}</h2>
                <p className="tv-weight">{node.weight}</p>
                {node.growth ? <p className="tv-growth">{node.growth}</p> : null}
              </article>
            ))}
            <article className="tv-node tv-treasury" data-treasury>
              <p className="tv-treasury-line">{model.treasury}</p>
            </article>
          </div>
        </section>

        <section className="tv-map" aria-label="System map">
          {map}
        </section>

        <div className="tv-mid">
          <Panel title="Catalysts" label="Catalysts">
            {model.catalysts.status === "down" ? <Missing text="not connected" /> : null}
            {model.catalysts.status === "list" && model.catalysts.items.length === 0 ? (
              <Missing text="none upcoming" />
            ) : null}
            {model.catalysts.status === "list" && model.catalysts.items.length > 0 ? (
              <ul className="tv-list">
                {model.catalysts.items.map((item) => (
                  <li key={`${item.when}-${item.title}`}>
                    <span className="tv-when">{item.when}</span>
                    <span className="tv-line">{item.title}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel title="Lesson" label="Lesson" className="tv-panel-lesson">
            {model.lesson.status === "down" ? <Missing text="not connected" /> : null}
            {model.lesson.status === "empty" ? <Missing text="no public lesson" /> : null}
            {model.lesson.status === "entry" ? (
              <>
                <p className="tv-line tv-strong">{model.lesson.title}</p>
                <p className="tv-sub">{model.lesson.date}</p>
                <p className="tv-copy">{model.lesson.body}</p>
              </>
            ) : null}
          </Panel>

          <Panel title="Fight Desk" label="Fight Desk">
            {model.fight.status === "down" ? <Missing text="not connected" /> : null}
            {model.fight.status === "empty" ? <Missing text="no upcoming card" /> : null}
            {model.fight.status === "card" ? (
              <>
                <p className="tv-line tv-strong">{model.fight.title}</p>
                {model.fight.when ? <p className="tv-sub">{model.fight.when}</p> : null}
                {model.fight.plays === null ? <Missing text="not connected" /> : null}
                {model.fight.plays && model.fight.plays.length === 0 ? <Missing text="no picks" /> : null}
                {model.fight.plays && model.fight.plays.length > 0 ? (
                  <ul className="tv-list">
                    {model.fight.plays.map((play) => (
                      <li key={`${play.fight}-${play.pick}`}>
                        <span className="tv-play">PLAY</span>
                        <span className="tv-line">
                          {play.pick}
                          {play.tier ? ` · ${play.tier}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </Panel>
        </div>

        <div className="tv-side">
          <Panel title="Build" label="Build" className="tv-panel-build">
            {model.build.status === "down" ? <Missing text="not connected" /> : null}
            {model.build.status === "ready" ? (
              <>
                <p className="tv-figure">{model.build.percent ?? "not connected"}</p>
                {model.build.items.length === 0 ? <p className="tv-sub">none in progress</p> : null}
                {model.build.items.length > 0 ? (
                  <ul className="tv-list">
                    {model.build.items.map((item) => (
                      <li key={item.title}>
                        <span className="tv-line">{item.title}</span>
                        {item.percent ? <span className="tv-sub">{item.percent}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </Panel>

          <Panel title="Control" label="Control" className="tv-panel-control">
            {model.control.status === "down" ? <Missing text="not connected" /> : null}
            {model.control.status === "ready" ? (
              <div className="tv-control">
                <ul className="tv-feeds">
                  {model.control.feeds.map((feed) => (
                    <li key={feed.id}>
                      <i className={`tv-dot is-${feed.freshness}`} data-freshness={feed.freshness} />
                      <span className="tv-line">{feed.label}</span>
                    </li>
                  ))}
                </ul>
                <ul className="tv-agents">
                  {model.control.agents.map((agent) => (
                    <li key={agent.name}>
                      <span className="tv-line">{agent.name}</span>
                      <span className="tv-sub">{agent.activity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel title="Approvals" label="Approvals">
            <p className="tv-figure" data-approvals>
              {model.approvalsPending === null ? "not connected" : model.approvalsPending}
            </p>
            <p className="tv-sub">pending</p>
          </Panel>

          <Panel title="XRP Trigger" label="XRP Trigger">
            <p className="tv-figure">{model.trigger.close}</p>
            <p className="tv-sub">
              {model.trigger.versus}
              {model.trigger.status === "ready" ? ` · ${model.trigger.streak}` : ""}
            </p>
            {model.trigger.status === "ready" ? <p className="tv-line">{model.trigger.state}</p> : null}
          </Panel>

          {model.showMachine ? <MachineHealthSlot health={model.machine} /> : null}
        </div>
      </div>
    </div>
  );
}
