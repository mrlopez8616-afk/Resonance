"use client";

import { useEffect } from "react";
import {
  LIVE_KIND_COLOR,
  LIVE_PULSE_MS,
  STATIC_MAP_LABEL,
  STATIC_MAP_STROKE,
  STATIC_MAP_STROKE_LIT,
  staticMapBounds,
  type LiveGraph,
  type LivePoint,
  type SystemPulse,
} from "@/lib/system-live";

function radius(point: LivePoint, bright: boolean): number {
  const base = point.kind === "hub" ? 0.2 : point.kind === "node" ? 0.13 : point.kind === "sleeve" ? 0.09 : 0.075;
  return bright ? base * 1.45 : base;
}

/** Hook-free map. The wall and the layout test both draw this SVG. */
export function SystemLiveStaticSvg({
  graph,
  pulse,
  onSelect,
}: {
  graph: LiveGraph;
  pulse: SystemPulse | null;
  onSelect: (id: string) => void;
}) {
  const bounds = staticMapBounds(graph.points);
  const brightNodes = new Set(pulse?.nodeIds ?? []);
  const brightEdges = new Set(pulse?.edgeIds ?? []);
  const labeled = graph.points.filter(
    (point) => (point.kind === "hub" || point.kind === "node") && point.label,
  );

  return (
    <svg
      className="system-live-svg"
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      overflow="hidden"
      role="img"
      aria-label="System map"
    >
      <rect x={bounds.minX} y={bounds.minY} width={bounds.width} height={bounds.height} fill="#070b14" />
      {Array.from({ length: 28 }, (_, index) => {
        const x = bounds.minX + ((index * 47) % 1000) / 1000 * bounds.width;
        const y = bounds.minY + ((index * 83) % 1000) / 1000 * bounds.height;
        return <circle key={index} cx={x} cy={y} r={0.035} fill="#c5d2e6" opacity={0.45} />;
      })}
      {graph.edges.map((edge) => {
        const start = graph.points.find((point) => point.id === edge.from);
        const end = graph.points.find((point) => point.id === edge.to);
        if (!start || !end) return null;
        const lit = brightEdges.has(edge.id);
        return (
          <line
            key={edge.id}
            x1={start.x}
            y1={start.z}
            x2={end.x}
            y2={end.z}
            stroke={lit ? "#fff6d2" : "#35506e"}
            strokeWidth={lit ? `${STATIC_MAP_STROKE_LIT}` : `${STATIC_MAP_STROKE}`}
          />
        );
      })}
      {graph.points.map((point) => {
        const lit = brightNodes.has(point.id);
        const fill = lit ? "#fff6d2" : LIVE_KIND_COLOR[point.kind];
        const r = radius(point, lit);
        const circle = <circle cx={point.x} cy={point.z} r={r} fill={fill} />;
        if (point.href) {
          return (
            <a key={point.id} href={point.href} aria-label={point.label}>
              {circle}
            </a>
          );
        }
        return (
          <g
            key={point.id}
            role="button"
            tabIndex={0}
            aria-label={point.label}
            onClick={() => onSelect(point.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(point.id);
              }
            }}
          >
            {circle}
          </g>
        );
      })}
      {labeled.map((point) => (
        <text
          key={`${point.id}-label`}
          x={point.x}
          y={point.z - radius(point, brightNodes.has(point.id)) - 0.12}
          textAnchor="middle"
          fill="#d5deea"
          fontSize={`${STATIC_MAP_LABEL}`}
        >
          {point.label}
        </text>
      ))}
    </svg>
  );
}

export function SystemLiveStatic({
  graph,
  pulse,
  onPulseDone,
  onSelect,
}: {
  graph: LiveGraph;
  pulse: SystemPulse | null;
  onPulseDone: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => onPulseDone(pulse.id), LIVE_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [onPulseDone, pulse]);

  return <SystemLiveStaticSvg graph={graph} pulse={pulse} onSelect={onSelect} />;
}
