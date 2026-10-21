import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { tileFace } from "@/lib/home-faces";
import type { TrackerTile } from "@/lib/fight-tier-tracker";

/** One drill-down page. The header names the page. The grid is only its child tiles. */
export function TrackerFloor({
  backHref,
  backLabel,
  kicker,
  title,
  meta = null,
  tiles,
  empty,
  publicMode = false,
}: {
  backHref: string;
  backLabel: string;
  kicker: string;
  title: string;
  meta?: string | null;
  tiles: readonly TrackerTile[];
  empty: string;
  publicMode?: boolean;
}) {
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href={backHref} className="calendar-back">
          {backLabel}
        </Link>
        <p className="log-kicker">{kicker}</p>
        <h2 className="log-title">{title}</h2>
        {meta ? <p className="log-meta">{meta}</p> : null}
      </header>
      {tiles.length === 0 ? (
        <p className="calendar-quiet">{empty}</p>
      ) : (
        <NodeFaceGrid label={title}>
          {tiles.map((row) => (
            <NodeFace
              key={row.id}
              face={tileFace({
                id: row.id,
                glyph: "fight-desk",
                href: row.href,
                name: row.name,
                headline: row.headline,
                status: row.status,
                live: row.live,
                publicMode,
              })}
            />
          ))}
        </NodeFaceGrid>
      )}
    </div>
  );
}
