"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  GitFork,
  Hexagon,
  Layers,
  Lock,
  Minus,
  Plus,
  Radio,
  Stamp,
  Users,
} from "lucide-react";
import {
  AttestationStatusBadge,
  ClassBadge,
  SleeveBadge,
  StatusBadge,
} from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { useStore } from "@/context/store";
import { hederaExplorerUrl } from "@/lib/hedera-explorer";
import {
  allocationLabel,
  altitudeScale,
  capitalFlowsFor,
  mapPoint,
  nextAltitude,
  redactedDecisionQuestion,
  slotForTicker,
  stampSummaries,
  TREASURY_MAP_SLOT,
  WORLD_LAYERS,
  worldCards,
  type CapitalFlow,
  type NodeStampSummary,
  type NodeWorldCard,
  type WorldAltitude,
  type WorldLayerId,
} from "@/lib/node-world";
import { xrplExplorerUrl } from "@/lib/xrpl-explorer";

const LAYER_ICONS: Record<WorldLayerId, typeof Layers> = {
  "capital-flow": GitFork,
  stamps: Stamp,
  sensors: Radio,
  sleeves: Layers,
  "red-locks": Lock,
  carla: Users,
};

const DESKTOP_ROW_ONE = ["BTC", "ETH", "SOL", "TREASURY", "PWR", "ETN", "VRT"] as const;
const DESKTOP_ROW_TWO = ["XRP", "SUI", "FLR", "SPACER", "GEV", "CEG", "HUBB"] as const;

export function NodeWorld() {
  const { ready, state } = useStore();
  const [altitude, setAltitude] = useState<WorldAltitude>("world");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<WorldLayerId, boolean>>({
    "capital-flow": false,
    stamps: false,
    sensors: false,
    sleeves: false,
    "red-locks": false,
    carla: false,
  });
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastWheelAt = useRef(0);

  const cards = useMemo(() => worldCards(state.nodes), [state.nodes]);
  const cardsByTicker = useMemo(
    () => new Map(cards.map((card) => [card.ticker, card])),
    [cards],
  );
  const flows = useMemo(
    () => capitalFlowsFor(state.nodes, state.agenticIntents),
    [state.nodes, state.agenticIntents],
  );
  const stamps = useMemo(
    () => stampSummaries(state.nodes, state.decisions, state.agenticIntents),
    [state.nodes, state.decisions, state.agenticIntents],
  );
  const selected = selectedTicker
    ? (cardsByTicker.get(selectedTicker) ?? null)
    : null;
  const selectedStamp = selectedTicker
    ? (stamps.get(selectedTicker) ?? null)
    : null;

  const setAltitudeSafe = useCallback((next: WorldAltitude) => {
    setAltitude(next);
    if (next === "world") setSelectedTicker(null);
  }, []);

  const zoom = useCallback(
    (direction: "in" | "out") => {
      setAltitude((current) => {
        const next = nextAltitude(current, direction);
        if (next === "world") {
          setSelectedTicker(null);
        } else if (!selectedTicker && cards[0]) {
          setSelectedTicker(cards[0].ticker);
        }
        return next;
      });
    },
    [cards, selectedTicker],
  );

  function openNode(ticker: string) {
    setSelectedTicker(ticker);
    setAltitude("node");
  }

  function toggleLayer(id: WorldLayerId) {
    const spec = WORLD_LAYERS.find((layer) => layer.id === id);
    if (!spec?.enabled) return;
    setLayers((current) => ({ ...current, [id]: !current[id] }));
  }

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelAt.current < 280) return;
      if (Math.abs(event.deltaY) < 8) return;
      lastWheelAt.current = now;
      zoom(event.deltaY < 0 ? "in" : "out");
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom]);

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading node world…</p>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Home"
        title="Node world"
        description="Twelve Resonance nodes as the outer layer — not a brokerage list. Scroll-wheel or +/− to change altitude. Click a box for the node level. Capital flow and Stamps are live; the rest of the rack is stubbed."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/nodes" className="btn btn-secondary">
              Edit nodes
            </Link>
            <Link href="/public" className="btn btn-secondary">
              Public skeleton
            </Link>
          </div>
        }
      />

      <div className="notice mb-6">
        Phase-0 map. Pipes and stamps are overlays on the existing board — they
        do not move capital, attest, or spend. Xaman principal and RH Main stay
        red-locked. No private dollar amounts on this surface.
      </div>

      <LayerRack layers={layers} onToggle={toggleLayer} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <AltitudeControls
          altitude={altitude}
          selectedTicker={selectedTicker}
          onZoom={zoom}
          onSetAltitude={setAltitudeSafe}
        />
        <p className="text-xs text-[color:var(--muted)]">
          {cards.length} nodes · wheel zooms the map
        </p>
      </div>

      <div
        ref={canvasRef}
        className="node-world mb-8"
        tabIndex={0}
        aria-label="Resonance node world. Scroll to zoom altitude."
      >
        <div className="node-world-grid">
          <div
            className="node-world-zoom"
            style={{ transform: `scale(${altitudeScale(altitude)})` }}
          >
            <FlowOverlay flows={flows} visible={layers["capital-flow"]} />
            <div className="grid gap-6 lg:hidden">
              <MobileCluster
                label="Digital"
                cards={cards.filter((card) => card.cluster === "digital")}
                stamps={stamps}
                flows={flows}
                selectedTicker={selectedTicker}
                showStamps={layers.stamps}
                showFlows={layers["capital-flow"]}
                altitude={altitude}
                onOpen={openNode}
              />
              <MobileCluster
                label="Physical AI"
                cards={cards.filter((card) => card.cluster === "physical")}
                stamps={stamps}
                flows={flows}
                selectedTicker={selectedTicker}
                showStamps={layers.stamps}
                showFlows={layers["capital-flow"]}
                altitude={altitude}
                onOpen={openNode}
              />
            </div>
            <div className="hidden lg:block">
              <div className="mb-3 grid grid-cols-7 gap-3">
                <p className="kicker col-span-3">Digital</p>
                <p className="kicker text-center">Well</p>
                <p className="kicker col-span-3 text-right">Physical AI</p>
              </div>
              <div className="grid grid-cols-7 gap-3">
                {DESKTOP_ROW_ONE.map((id) =>
                  id === "TREASURY" ? (
                    <TreasuryWell
                      key="treasury"
                      selected={selectedTicker === "XRP"}
                      showFlow={layers["capital-flow"]}
                      onOpen={() => openNode("XRP")}
                    />
                  ) : (
                    <MapCell
                      key={id}
                      card={cardsByTicker.get(id) ?? null}
                      stamp={stamps.get(id) ?? null}
                      outbound={flows.filter((flow) => flow.from === id)}
                      selectedTicker={selectedTicker}
                      showStamps={layers.stamps}
                      showFlows={layers["capital-flow"]}
                      altitude={altitude}
                      onOpen={openNode}
                    />
                  ),
                )}
                {DESKTOP_ROW_TWO.map((id) =>
                  id === "SPACER" ? (
                    <div key="spacer" />
                  ) : (
                    <MapCell
                      key={id}
                      card={cardsByTicker.get(id) ?? null}
                      stamp={stamps.get(id) ?? null}
                      outbound={flows.filter((flow) => flow.from === id)}
                      selectedTicker={selectedTicker}
                      showStamps={layers.stamps}
                      showFlows={layers["capital-flow"]}
                      altitude={altitude}
                      onOpen={openNode}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selected && altitude !== "world" ? (
        <NodeDetailLevel
          card={selected}
          stamp={selectedStamp}
          flows={flows.filter(
            (flow) =>
              flow.from === selected.ticker ||
              flow.to === selected.ticker ||
              (selected.ticker === "XRP" && flow.from === "TREASURY"),
          )}
          decisions={state.decisions.filter((row) =>
            selectedStamp?.pointers.some((pointer) => pointer.id === row.id),
          )}
          altitude={altitude}
          onBack={() => setAltitudeSafe("world")}
          onGuts={() => setAltitude("guts")}
        />
      ) : (
        <p className="text-sm text-[color:var(--muted)]">
          Click a node box or zoom in to open the architecture level. OS tools
          stay on the left rail: Decisions, Treasury, System health, Todos.
        </p>
      )}
    </div>
  );
}

function LayerRack({
  layers,
  onToggle,
}: {
  layers: Record<WorldLayerId, boolean>;
  onToggle: (id: WorldLayerId) => void;
}) {
  return (
    <div
      className="mb-6 flex flex-wrap gap-2"
      role="toolbar"
      aria-label="World layer toggles"
    >
      {WORLD_LAYERS.map((layer) => {
        const Icon = LAYER_ICONS[layer.id];
        const on = layers[layer.id];
        return (
          <button
            key={layer.id}
            type="button"
            disabled={!layer.enabled}
            title={layer.hint}
            aria-pressed={layer.enabled ? on : undefined}
            onClick={() => onToggle(layer.id)}
            className={`btn ${on ? "btn-primary" : "btn-secondary"}`}
          >
            <Icon size={14} strokeWidth={1.7} />
            {layer.label}
            {!layer.enabled ? (
              <span className="text-[10px] uppercase tracking-[0.12em] opacity-70">
                stub
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function AltitudeControls({
  altitude,
  selectedTicker,
  onZoom,
  onSetAltitude,
}: {
  altitude: WorldAltitude;
  selectedTicker: string | null;
  onZoom: (direction: "in" | "out") => void;
  onSetAltitude: (altitude: WorldAltitude) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary px-2"
        aria-label="Zoom out"
        onClick={() => onZoom("out")}
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="btn btn-secondary px-2"
        aria-label="Zoom in"
        onClick={() => onZoom("in")}
      >
        <Plus size={14} />
      </button>
      {(["world", "node", "guts"] as const).map((level) => (
        <button
          key={level}
          type="button"
          className={`btn ${altitude === level ? "btn-primary" : "btn-secondary"}`}
          onClick={() => onSetAltitude(level)}
        >
          {level === "world" ? "World" : level === "node" ? "Node" : "Guts"}
        </button>
      ))}
      <span className="text-xs text-[color:var(--muted)]">
        {altitude === "world"
          ? "Outer layer"
          : selectedTicker
            ? `${selectedTicker} · ${altitude}`
            : altitude}
      </span>
    </div>
  );
}

function MobileCluster({
  label,
  cards,
  stamps,
  flows,
  selectedTicker,
  showStamps,
  showFlows,
  altitude,
  onOpen,
}: {
  label: string;
  cards: NodeWorldCard[];
  stamps: Map<string, NodeStampSummary>;
  flows: CapitalFlow[];
  selectedTicker: string | null;
  showStamps: boolean;
  showFlows: boolean;
  altitude: WorldAltitude;
  onOpen: (ticker: string) => void;
}) {
  return (
    <section>
      <p className="kicker mb-3">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <MapCell
            key={card.ticker}
            card={card}
            stamp={stamps.get(card.ticker) ?? null}
            outbound={flows.filter((flow) => flow.from === card.ticker)}
            selectedTicker={selectedTicker}
            showStamps={showStamps}
            showFlows={showFlows}
            altitude={altitude}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

function MapCell({
  card,
  stamp,
  outbound,
  selectedTicker,
  showStamps,
  showFlows,
  altitude,
  onOpen,
}: {
  card: NodeWorldCard | null;
  stamp: NodeStampSummary | null;
  outbound: CapitalFlow[];
  selectedTicker: string | null;
  showStamps: boolean;
  showFlows: boolean;
  altitude: WorldAltitude;
  onOpen: (ticker: string) => void;
}) {
  if (!card) return <div className="hidden lg:block" />;
  return (
    <NodeBox
      card={card}
      stamp={stamp}
      outbound={outbound}
      selected={selectedTicker === card.ticker}
      dimmed={
        Boolean(selectedTicker) &&
        selectedTicker !== card.ticker &&
        altitude !== "world"
      }
      showStamps={showStamps}
      showFlows={showFlows}
      onOpen={onOpen}
    />
  );
}

function NodeBox({
  card,
  stamp,
  outbound,
  selected,
  dimmed,
  showStamps,
  showFlows,
  onOpen,
}: {
  card: NodeWorldCard;
  stamp: NodeStampSummary | null;
  outbound: CapitalFlow[];
  selected: boolean;
  dimmed: boolean;
  showStamps: boolean;
  showFlows: boolean;
  onOpen: (ticker: string) => void;
}) {
  return (
    <button
      type="button"
      data-selected={selected ? "true" : "false"}
      className={`node-box text-left ${dimmed ? "opacity-35" : ""}`}
      onClick={() => onOpen(card.ticker)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-sm">
            <Hexagon size={14} className="text-[color:var(--accent)]" />
            {card.ticker}
          </p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{card.name}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge value={card.status} />
          <ClassBadge value={card.class} />
          <SleeveBadge value={card.sleeve} />
        </div>
      </div>
      <p className="mt-3 text-xs text-[color:var(--muted)]">
        Target {allocationLabel(card.publicAllocationPct)}
      </p>
      {showStamps && stamp && stamp.decisionCount > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--accent)]">
          <Stamp size={12} />
          {stamp.decisionCount} stamp{stamp.decisionCount === 1 ? "" : "s"}
          {stamp.hederaStatus ? (
            <AttestationStatusBadge value={stamp.hederaStatus} />
          ) : null}
          {stamp.xrplTxHash ? (
            <span className="badge border-[color:var(--accent-2)]/40 text-[color:var(--accent-2)]">
              XRPL R1
            </span>
          ) : null}
        </p>
      ) : null}
      {showFlows && outbound.length > 0 ? (
        <p className="mt-2 text-xs text-[color:var(--accent-2)]">
          {outbound.map((flow) => `${flow.kind} → ${flow.to}`).join(" · ")}
        </p>
      ) : null}
    </button>
  );
}

function TreasuryWell({
  selected,
  showFlow,
  onOpen,
}: {
  selected: boolean;
  showFlow: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`node-box node-box-well text-center ${
        selected ? "ring-1 ring-[color:var(--accent)]" : ""
      }`}
      onClick={onOpen}
    >
      <Lock
        size={16}
        className="mx-auto text-[color:var(--danger)]"
        aria-hidden
      />
      <p className="mt-2 font-mono text-xs">Xaman</p>
      <p className="mt-1 text-[11px] leading-4 text-[color:var(--muted)]">
        Principal well. Visible. Never spendable here.
      </p>
      {showFlow ? (
        <p className="mt-2 text-[11px] text-[color:var(--accent-2)]">→ XRP</p>
      ) : null}
    </button>
  );
}

function FlowOverlay({
  flows,
  visible,
}: {
  flows: CapitalFlow[];
  visible: boolean;
}) {
  if (!visible) return null;
  const drawn = flows.filter((flow) => flow.from !== "AGENTIC");
  return (
    <svg
      className="pointer-events-none absolute inset-6 hidden h-[calc(100%-3rem)] w-[calc(100%-3rem)] lg:block"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {drawn.map((flow) => {
        const from =
          flow.from === "TREASURY"
            ? mapPoint(TREASURY_MAP_SLOT.col, TREASURY_MAP_SLOT.row)
            : pointForTicker(flow.from);
        const to = pointForTicker(flow.to);
        if (!from || !to) return null;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 6;
        return (
          <path
            key={flow.id}
            d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
            className="flow-pipe"
          />
        );
      })}
    </svg>
  );
}

function pointForTicker(ticker: string) {
  const slot = slotForTicker(ticker);
  return slot ? mapPoint(slot.col, slot.row) : null;
}

function NodeDetailLevel({
  card,
  stamp,
  flows,
  decisions,
  altitude,
  onBack,
  onGuts,
}: {
  card: NodeWorldCard;
  stamp: NodeStampSummary | null;
  flows: CapitalFlow[];
  decisions: { id: string; question: string; date: string }[];
  altitude: WorldAltitude;
  onBack: () => void;
  onGuts: () => void;
}) {
  const showGuts = altitude === "guts";
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker">
            {showGuts ? "Guts · architecture" : "Node level"}
          </p>
          <h2 className="mt-1 font-mono text-xl">{card.ticker}</h2>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{card.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            <ArrowLeft size={14} />
            World
          </button>
          {!showGuts ? (
            <button type="button" className="btn btn-primary" onClick={onGuts}>
              <Activity size={14} />
              Open guts
            </button>
          ) : null}
          <Link href="/nodes" className="btn btn-secondary">
            Edit on Nodes
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ArchStub
          kicker="Web2 record"
          title="Board row"
          body={`${card.status} · ${card.class}${card.sleeve !== "none" ? ` · ${card.sleeve}` : ""}${card.venue ? ` · ${card.venue}` : ""}`}
        />
        <ArchStub
          kicker="Hedera stamp"
          title={
            stamp?.hederaStatus
              ? stamp.hederaStatus.replace(/_/g, " ")
              : "No stamp yet"
          }
          body={
            stamp?.hederaMessageId
              ? stamp.hederaMessageId
              : "Attest a touching decision on Testnet to light this rail."
          }
          href={
            stamp?.hederaMessageId
              ? hederaExplorerUrl("testnet", stamp.hederaMessageId)
              : null
          }
        />
        <ArchStub
          kicker="XRPL R1"
          title={stamp?.xrplTxHash ? "Mirror pointer" : "No pointer"}
          body={
            stamp?.xrplTxHash
              ? `${stamp.xrplTxHash.slice(0, 12)}…`
              : "Hedera first, then Mirror on XRPL Testnet."
          }
          href={
            stamp?.xrplTxHash
              ? xrplExplorerUrl("testnet", stamp.xrplTxHash)
              : null
          }
        />
        <ArchStub
          kicker="Allocation"
          title={allocationLabel(card.publicAllocationPct)}
          body="Published target % of the twelve-node skeleton. Not a dollar weight."
        />
      </div>

      {showGuts ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="kicker">Thesis stub</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text)]">
              {card.thesis}
            </p>
          </div>
          <div>
            <p className="kicker">Failure condition</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              {card.failureCondition}
            </p>
          </div>
        </div>
      ) : null}

      {flows.length > 0 ? (
        <div className="mt-5">
          <p className="kicker">Capital pipes touching this node</p>
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--muted)]">
            {flows.map((flow) => (
              <li key={flow.id}>
                <span className="font-mono text-[color:var(--accent-2)]">
                  {flow.from} → {flow.to}
                </span>
                {" · "}
                {flow.kind}
                {flow.note ? ` · ${flow.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="kicker">Decisions that touch {card.ticker}</p>
        {!stamp || stamp.pointers.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            No record-book row names this ticker yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {stamp.pointers.map((pointer) => {
              const row = decisions.find((item) => item.id === pointer.id);
              return (
                <li key={pointer.id}>
                  <Link
                    href={`/decisions/${encodeURIComponent(pointer.id)}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm hover:bg-[color:var(--surface-2)]"
                  >
                    <span>
                      <span className="font-mono">{pointer.id}</span>
                      {row ? (
                        <span className="ml-2 text-[color:var(--muted)]">
                          {redactedDecisionQuestion(row.question)}
                        </span>
                      ) : null}
                    </span>
                    <AttestationStatusBadge value={pointer.attestationStatus} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function ArchStub({
  kicker,
  title,
  body,
  href,
}: {
  kicker: string;
  title: string;
  body: string;
  href?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-3">
      <p className="kicker">{kicker}</p>
      <p className="mt-2 text-sm">{title}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block font-mono text-xs text-[color:var(--accent)]"
        >
          {body}
        </a>
      ) : (
        <p className="mt-1 text-xs text-[color:var(--muted)]">{body}</p>
      )}
    </div>
  );
}
