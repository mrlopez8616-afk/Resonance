import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import type { FilmLevel } from "@/lib/film-episode";

/** Episode 1 board. The same geometric face as the rest of the floor. */
export function FilmBoard({ level }: { level: FilmLevel }) {
  return (
    <>
      {level.back ? (
        <Link href={level.back.href} className="calendar-back">
          {level.back.label}
        </Link>
      ) : null}
      <NodeFaceGrid count={level.faces.length} label={level.label}>
        {level.faces.map((row) => (
          <NodeFace key={`${row.id}-${row.name}`} face={row} />
        ))}
      </NodeFaceGrid>
    </>
  );
}

/** Public mode is off. No floor data, no shell, no private mood. */
export function FilmLocked() {
  return (
    <main className="operator-canvas">
      <div className="operator-main">
        <p className="parent-empty" role="status">
          Private
        </p>
        <p className="log-meta">Turn Public mode on to open this view.</p>
      </div>
    </main>
  );
}
