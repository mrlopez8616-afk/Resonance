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
  Zap,
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
  drawableCapitalFlows,
  FLOW_KIND_LABEL,
  mainBusLaneYs,
  nextAltitude,
  plantSkinFor,
  PLANT_SKIN_LABEL,
  redactedDecisionQuestion,
  redLocksByTarget,
  SLEEVE_LANE_LABEL,
  sleeveLaneKey,
  sleeveOverlayByTicker,
  stampSummaries,
  WORLD_LAYERS,
  worldCards,
  type CapitalFlow,
  type NodeSleeveOverlay,
  type NodeStampSummary,
  type NodeWorldCard,
  type PlantSkin,
  type RedLockMark,
  type SleeveOverlayLane,
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
  const sleeves = useMemo(
    () => sleeveOverlayByTicker(state.nodes, state.agenticIntents),
    [state.nodes, state.agenticIntents],
  );
  const locks = useMemo(() => redLocksByTarget(state.nodes), [state.nodes]);
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
    if (!selectedTicker || altitude === "world") return;
    document.getElementById("plant-interior")?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedTicker, altitude]);

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
    <div className="factory-floor">
      <PageHeader
        kicker="Home"
        title="Node world"
        description="Twelve Resonance nodes as the outer layer — not a brokerage list. Bottom hotbar holds overlay toggles, zoom, and the selected-node chip. Scroll-wheel or +/− still changes altitude. Click a box for the plant interior. Capital flow, Stamps, Sleeves, and Red locks are live overlays. Sensors and Carla stay stubbed."
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
        Phase-0 map. Pipes, sleeves, stamps, and red locks are overlays on the
        existing twelve-node board — they do not move capital, attest, or spend.
        Xaman principal and RH Main stay OFF LIMITS. No private dollar amounts
        or ticket sizes on this surface.
      </div>

      <OverlayKey
        showFlows={layers["capital-flow"]}
        showSleeves={layers.sleeves}
        showRedLocks={layers["red-locks"]}
      />

      <p className="mb-3 text-xs text-[color:var(--muted)]">
        {cards.length} nodes · wheel zooms the map · tools on the floor hotbar
      </p>

      <div
        ref={canvasRef}
        className="node-world"
        tabIndex={0}
        aria-label="Resonance node world. Scroll to zoom altitude."
      >
        <div className="node-world-grid">
          <div
            className="node-world-zoom"
            style={{ transform: `scale(${altitudeScale(altitude)})` }}
          >
            <div className="grid gap-6 lg:hidden">
              <MobileCluster
                label="Digital"
                cards={cards.filter((card) => card.cluster === "digital")}
                stamps={stamps}
                sleeves={sleeves}
                locks={locks}
                flows={flows}
                selectedTicker={selectedTicker}
                showStamps={layers.stamps}
                showFlows={layers["capital-flow"]}
                showSleeves={layers.sleeves}
                showRedLocks={layers["red-locks"]}
                altitude={altitude}
                onOpen={openNode}
                showWell
              />
              <MobileCluster
                label="Physical AI"
                cards={cards.filter((card) => card.cluster === "physical")}
                stamps={stamps}
                sleeves={sleeves}
                locks={locks}
                flows={flows}
                selectedTicker={selectedTicker}
                showStamps={layers.stamps}
                showFlows={layers["capital-flow"]}
                showSleeves={layers.sleeves}
                showRedLocks={layers["red-locks"]}
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
              <div className="relative">
                <MainBusGutter live={layers["capital-flow"]} />
                <FlowOverlay flows={flows} visible={layers["capital-flow"]} />
                <div className="grid grid-cols-7 gap-3">
                {DESKTOP_ROW_ONE.map((id) =>
                  id === "TREASURY" ? (
                    <TreasuryWell
                      key="treasury"
                      selected={selectedTicker === "XRP"}
                      showFlow={layers["capital-flow"]}
                      redLock={
                        layers["red-locks"]
                          ? (locks.get("TREASURY") ?? null)
                          : null
                      }
                      onOpen={() => openNode("XRP")}
                    />
                  ) : (
                    <MapCell
                      key={id}
                      card={cardsByTicker.get(id) ?? null}
                      stamp={stamps.get(id) ?? null}
                      sleeve={sleeves.get(id) ?? null}
                      redLock={locks.get(id) ?? null}
                      outbound={flows.filter((flow) => flow.from === id)}
                      selectedTicker={selectedTicker}
                      showStamps={layers.stamps}
                      showFlows={layers["capital-flow"]}
                      showSleeves={layers.sleeves}
                      showRedLocks={layers["red-locks"]}
                      altitude={altitude}
                      onOpen={openNode}
                    />
                  ),
                )}
                {DESKTOP_ROW_TWO.map((id) =>
                  id === "SPACER" ? (
                    <AgenticDock
                      key="agentic-dock"
                      visible={layers["capital-flow"]}
                      queued={
                        flows.filter((flow) => flow.kind === "agentic-queued")
                          .length
                      }
                    />
                  ) : (
                    <MapCell
                      key={id}
                      card={cardsByTicker.get(id) ?? null}
                      stamp={stamps.get(id) ?? null}
                      sleeve={sleeves.get(id) ?? null}
                      redLock={locks.get(id) ?? null}
                      outbound={flows.filter((flow) => flow.from === id)}
                      selectedTicker={selectedTicker}
                      showStamps={layers.stamps}
                      showFlows={layers["capital-flow"]}
                      showSleeves={layers.sleeves}
                      showRedLocks={layers["red-locks"]}
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
      </div>

      {layers["capital-flow"] ? <FlowLegend flows={flows} /> : null}

      {selected && altitude !== "world" ? (
        <NodeDetailLevel
          card={selected}
          stamp={selectedStamp}
          sleeve={sleeves.get(selected.ticker) ?? null}
          redLock={locks.get(selected.ticker) ?? null}
          treasuryLock={
            selected.ticker === "XRP" ? (locks.get("TREASURY") ?? null) : null
          }
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
          Click a node box or zoom in to open the plant interior. OS tools stay
          on the left rail: Decisions, Treasury, System health, Todos.
        </p>
      )}

      <FactoryHotbar
        layers={layers}
        altitude={altitude}
        selectedTicker={selectedTicker}
        selectedName={selected?.name ?? null}
        selectedSkin={selected ? plantSkinFor(selected.ticker) : null}
        onToggle={toggleLayer}
        onZoom={zoom}
        onSetAltitude={setAltitudeSafe}
      />
    </div>
  );
}

function FactoryHotbar({
  layers,
  altitude,
  selectedTicker,
  selectedName,
  selectedSkin,
  onToggle,
  onZoom,
  onSetAltitude,
}: {
  layers: Record<WorldLayerId, boolean>;
  altitude: WorldAltitude;
  selectedTicker: string | null;
  selectedName: string | null;
  selectedSkin: PlantSkin | null;
  onToggle: (id: WorldLayerId) => void;
  onZoom: (direction: "in" | "out") => void;
  onSetAltitude: (altitude: WorldAltitude) => void;
}) {
  return (
    <div className="factory-hotbar" role="toolbar" aria-label="Node world hotbar">
      <div
        className="hotbar-chip"
        data-has-selection={selectedTicker ? "true" : "false"}
      >
        <span className="hotbar-chip-row">
          <Hexagon size={14} strokeWidth={1.7} aria-hidden />
          <span className="hotbar-chip-id">{selectedTicker ?? "—"}</span>
        </span>
        <span className="hotbar-chip-meta">
          {selectedTicker
            ? `${selectedName ?? selectedTicker} · ${altitude}${
                selectedSkin ? ` · ${PLANT_SKIN_LABEL[selectedSkin]}` : ""
              }`
            : "No node"}
        </span>
      </div>
      <div className="hotbar-divider" aria-hidden />
      <div className="hotbar-slots">
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
              className={`hotbar-slot ${on ? "is-on" : ""}`}
            >
              <Icon size={14} strokeWidth={1.7} />
              <span className="hotbar-slot-label">{layer.label}</span>
              {!layer.enabled ? <span className="hotbar-stub">stub</span> : null}
            </button>
          );
        })}
      </div>
      <div className="hotbar-divider" aria-hidden />
      <div className="hotbar-zoom">
        <button
          type="button"
          className="hotbar-slot hotbar-slot-icon"
          aria-label="Zoom out"
          onClick={() => onZoom("out")}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="hotbar-slot hotbar-slot-icon"
          aria-label="Zoom in"
          onClick={() => onZoom("in")}
        >
          <Plus size={14} />
        </button>
        {(["world", "node", "guts"] as const).map((level) => (
          <button
            key={level}
            type="button"
            className={`hotbar-slot ${altitude === level ? "is-on" : ""}`}
            onClick={() => onSetAltitude(level)}
          >
            <span className="hotbar-slot-label">
              {level === "world" ? "World" : level === "node" ? "Node" : "Guts"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileCluster({
  label,
  cards,
  stamps,
  sleeves,
  locks,
  flows,
  selectedTicker,
  showStamps,
  showFlows,
  showSleeves,
  showRedLocks,
  altitude,
  onOpen,
  showWell = false,
}: {
  label: string;
  cards: NodeWorldCard[];
  stamps: Map<string, NodeStampSummary>;
  sleeves: Map<string, NodeSleeveOverlay>;
  locks: Map<string, RedLockMark>;
  flows: CapitalFlow[];
  selectedTicker: string | null;
  showStamps: boolean;
  showFlows: boolean;
  showSleeves: boolean;
  showRedLocks: boolean;
  altitude: WorldAltitude;
  onOpen: (ticker: string) => void;
  showWell?: boolean;
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
            sleeve={sleeves.get(card.ticker) ?? null}
            redLock={locks.get(card.ticker) ?? null}
            outbound={flows.filter((flow) => flow.from === card.ticker)}
            selectedTicker={selectedTicker}
            showStamps={showStamps}
            showFlows={showFlows}
            showSleeves={showSleeves}
            showRedLocks={showRedLocks}
            altitude={altitude}
            onOpen={onOpen}
          />
        ))}
        {showWell ? (
          <TreasuryWell
            selected={selectedTicker === "XRP"}
            showFlow={showFlows}
            redLock={showRedLocks ? (locks.get("TREASURY") ?? null) : null}
            onOpen={() => onOpen("XRP")}
          />
        ) : null}
        {showWell && showFlows ? (
          <AgenticDock
            visible
            queued={flows.filter((flow) => flow.kind === "agentic-queued").length}
          />
        ) : null}
      </div>
    </section>
  );
}

function MapCell({
  card,
  stamp,
  sleeve,
  redLock,
  outbound,
  selectedTicker,
  showStamps,
  showFlows,
  showSleeves,
  showRedLocks,
  altitude,
  onOpen,
}: {
  card: NodeWorldCard | null;
  stamp: NodeStampSummary | null;
  sleeve: NodeSleeveOverlay | null;
  redLock: RedLockMark | null;
  outbound: CapitalFlow[];
  selectedTicker: string | null;
  showStamps: boolean;
  showFlows: boolean;
  showSleeves: boolean;
  showRedLocks: boolean;
  altitude: WorldAltitude;
  onOpen: (ticker: string) => void;
}) {
  if (!card) return <div className="hidden lg:block" />;
  return (
    <NodeBox
      card={card}
      stamp={stamp}
      sleeve={sleeve}
      redLock={redLock}
      outbound={outbound}
      selected={selectedTicker === card.ticker}
      dimmed={
        Boolean(selectedTicker) &&
        selectedTicker !== card.ticker &&
        altitude !== "world"
      }
      showStamps={showStamps}
      showFlows={showFlows}
      showSleeves={showSleeves}
      showRedLocks={showRedLocks}
      onOpen={onOpen}
    />
  );
}

function NodeBox({
  card,
  stamp,
  sleeve,
  redLock,
  outbound,
  selected,
  dimmed,
  showStamps,
  showFlows,
  showSleeves,
  showRedLocks,
  onOpen,
}: {
  card: NodeWorldCard;
  stamp: NodeStampSummary | null;
  sleeve: NodeSleeveOverlay | null;
  redLock: RedLockMark | null;
  outbound: CapitalFlow[];
  selected: boolean;
  dimmed: boolean;
  showStamps: boolean;
  showFlows: boolean;
  showSleeves: boolean;
  showRedLocks: boolean;
  onOpen: (ticker: string) => void;
}) {
  const locked = showRedLocks && redLock;
  return (
    <button
      type="button"
      data-selected={selected ? "true" : "false"}
      data-sleeve={showSleeves ? sleeveLaneKey(sleeve) : "off"}
      data-red-lock={locked ? "true" : "false"}
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
          {!showSleeves ? <SleeveBadge value={card.sleeve} /> : null}
        </div>
      </div>
      <p className="mt-3 text-xs text-[color:var(--muted)]">
        Target {allocationLabel(card.publicAllocationPct)}
      </p>
      {showSleeves && sleeve ? <SleeveOverlayMarks overlay={sleeve} /> : null}
      {locked ? <RedLockStamp mark={redLock} /> : null}
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
          {outbound
            .map((flow) => `${FLOW_KIND_LABEL[flow.kind]} → ${flow.to}`)
            .join(" · ")}
        </p>
      ) : null}
    </button>
  );
}

function TreasuryWell({
  selected,
  showFlow,
  redLock,
  onOpen,
}: {
  selected: boolean;
  showFlow: boolean;
  redLock: RedLockMark | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-red-lock={redLock ? "true" : "false"}
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
      {redLock ? <RedLockStamp mark={redLock} /> : null}
      {showFlow ? (
        <p className="mt-2 text-[11px] text-[color:var(--accent-2)]">
          Pipe → XRP node
        </p>
      ) : null}
    </button>
  );
}

function AgenticDock({
  visible,
  queued,
}: {
  visible: boolean;
  queued: number;
}) {
  if (!visible) return <div />;
  return (
    <div className="node-box node-box-dock text-center" aria-hidden={queued === 0}>
      <GitFork
        size={16}
        className="mx-auto text-[color:var(--accent)]"
        aria-hidden
      />
      <p className="mt-2 font-mono text-xs">Agentic</p>
      <p className="mt-1 text-[11px] leading-4 text-[color:var(--muted)]">
        Queued-intent dock. Not a fill. No ticket sizes.
      </p>
      <p className="mt-2 text-[11px] text-[color:var(--accent)]">
        {queued} pipe{queued === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function MainBusGutter({ live }: { live: boolean }) {
  return (
    <svg
      className={`main-bus-gutter ${live ? "is-live" : ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {mainBusLaneYs().map((y) => (
        <line
          key={y}
          x1="3.5"
          x2="96.5"
          y1={y}
          y2={y}
          className="main-bus-lane"
        />
      ))}
    </svg>
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
  const drawn = drawableCapitalFlows(flows);
  return (
    <svg
      className="node-world-pipes"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {drawn.map((flow) => (
        <g
          key={flow.id}
          className={`flow-pipe-group flow-kind-${flow.kind}`}
        >
          <path d={flow.path} className="flow-pipe-casing-outer" />
          <path d={flow.path} className="flow-pipe-casing" />
          <path d={flow.path} className="flow-pipe-lane" />
          <path d={flow.path} className="flow-pipe-inner" />
          <circle
            cx={flow.fromPoint.x}
            cy={flow.fromPoint.y}
            r="1.55"
            className="flow-pipe-joint"
          />
          <circle
            cx={flow.toPoint.x}
            cy={flow.toPoint.y}
            r="1.55"
            className="flow-pipe-joint"
          />
        </g>
      ))}
    </svg>
  );
}

function OverlayKey({
  showFlows,
  showSleeves,
  showRedLocks,
}: {
  showFlows: boolean;
  showSleeves: boolean;
  showRedLocks: boolean;
}) {
  if (!showFlows && !showSleeves && !showRedLocks) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-[color:var(--muted)]">
      {showFlows ? (
        <>
          <span className="overlay-chip overlay-chip-pipe">Belt / pipe</span>
          <span className="overlay-chip overlay-chip-well">Xaman → XRP</span>
          <span className="overlay-chip overlay-chip-agentic">
            Agentic queued
          </span>
        </>
      ) : null}
      {showSleeves ? (
        <>
          <span className="overlay-chip overlay-chip-main">Founder Main</span>
          <span className="overlay-chip overlay-chip-agentic">Agentic</span>
          <span className="overlay-chip overlay-chip-thesis">
            Founder thesis
          </span>
        </>
      ) : null}
      {showRedLocks ? (
        <span className="overlay-chip overlay-chip-lock">
          OFF LIMITS · visible only
        </span>
      ) : null}
    </div>
  );
}

function FlowLegend({ flows }: { flows: CapitalFlow[] }) {
  if (flows.length === 0) return null;
  return (
    <section className="mb-8 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
      <p className="kicker">Capital pipes</p>
      <ul className="mt-2 grid gap-1 text-sm text-[color:var(--muted)] sm:grid-cols-2">
        {flows.map((flow) => (
          <li key={flow.id}>
            <span className="font-mono text-[color:var(--accent-2)]">
              {flow.from} → {flow.to}
            </span>
            {" · "}
            {FLOW_KIND_LABEL[flow.kind]}
            {flow.note ? ` · ${flow.note}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SleeveOverlayMarks({ overlay }: { overlay: NodeSleeveOverlay }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5">
      {overlay.lanes.map((lane) => (
        <SleeveLaneChip key={lane} lane={lane} />
      ))}
      {overlay.sources.includes("stub") ? (
        <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
          stub map
        </span>
      ) : null}
    </p>
  );
}

function SleeveLaneChip({ lane }: { lane: SleeveOverlayLane }) {
  return (
    <span
      className={`badge ${
        lane === "agentic"
          ? "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
          : lane === "founder-main"
            ? "border-[color:var(--accent-2)]/35 bg-[color:var(--accent-2)]/10 text-[color:var(--accent-2)]"
            : "border-[color:var(--border)] text-[color:var(--muted)]"
      }`}
    >
      {SLEEVE_LANE_LABEL[lane]}
    </span>
  );
}

function RedLockStamp({ mark }: { mark: RedLockMark }) {
  return (
    <p className="red-lock-stamp mt-2">
      <Lock size={11} aria-hidden />
      {mark.label}
      <span className="font-normal normal-case tracking-normal text-[color:var(--muted)]">
        {mark.kind === "xaman-principal" ? "Xaman well" : "RH Main"}
      </span>
    </p>
  );
}

function NodeDetailLevel({
  card,
  stamp,
  sleeve,
  redLock,
  treasuryLock,
  flows,
  decisions,
  altitude,
  onBack,
  onGuts,
}: {
  card: NodeWorldCard;
  stamp: NodeStampSummary | null;
  sleeve: NodeSleeveOverlay | null;
  redLock: RedLockMark | null;
  treasuryLock: RedLockMark | null;
  flows: CapitalFlow[];
  decisions: { id: string; question: string; date: string }[];
  altitude: WorldAltitude;
  onBack: () => void;
  onGuts: () => void;
}) {
  const showGuts = altitude === "guts";
  const skin = plantSkinFor(card.ticker) ?? "liquidity";
  const welded = Boolean(redLock || treasuryLock);
  return (
    <section
      id="plant-interior"
      className={`card plant-interior plant-interior-${skin}`}
      data-plant-skin={skin}
      data-welded={welded ? "true" : "false"}
    >
      <PlantChrome skin={skin} welded={welded} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker">
            {showGuts ? "Guts · architecture" : "Node level"}
            {" · "}
            {PLANT_SKIN_LABEL[skin]}
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

      <div className="plant-bays mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ArchStub
          kicker="Web2 record"
          title="Board row"
          body={`${card.status} · ${card.class}${card.sleeve !== "none" ? ` · ${card.sleeve}` : ""}${card.venue ? ` · ${card.venue}` : ""}`}
        />
        <ArchStub
          kicker="Sleeve overlay"
          title={
            sleeve
              ? sleeve.lanes.map((lane) => SLEEVE_LANE_LABEL[lane]).join(" + ")
              : "Unassigned"
          }
          body={
            sleeve?.note ??
            "Same twelve-node universe. Founder can edit FOUNDER_THESIS_SLEEVE_STUB later."
          }
        />
        <ArchStub
          kicker="Red lock"
          title={
            redLock || treasuryLock
              ? "OFF LIMITS"
              : "Not a locked principal rail"
          }
          body={
            redLock?.note ??
            treasuryLock?.note ??
            "Visibility layer only. Resonance never spends RH Main or Xaman principal."
          }
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

function PlantChrome({
  skin,
  welded,
}: {
  skin: PlantSkin;
  welded: boolean;
}) {
  return (
    <div className={`plant-chrome plant-chrome-${skin}`} aria-hidden>
      {skin === "electrification" ? (
        <>
          <span className="plant-busbar" />
          <span className="plant-busbar" />
          <span className="plant-cell" />
          <span className="plant-cell" />
          <span className="plant-cell" />
          <Zap size={14} className="plant-chrome-mark" />
        </>
      ) : (
        <>
          <span className="plant-tank" />
          <span className="plant-tank" />
          <span className="plant-tank" />
          <span className="plant-valve" />
          <GitFork size={14} className="plant-chrome-mark" />
        </>
      )}
      {welded ? (
        <span className="plant-weld">
          <Lock size={11} />
          Welded
        </span>
      ) : null}
    </div>
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
    <div className="plant-bay rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-3">
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
