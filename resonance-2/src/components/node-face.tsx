import { Children, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { HomeFace } from "@/lib/home-faces";

/**
 * Shared geometric face for every home tile and every node-page tile.
 * Glyph, name, one headline, one status line. The grid gives each face the same box.
 */
export function NodeFace({ face, onRemove }: { face: HomeFace; onRemove?: () => void }) {
  const tone = face.tone ? ` is-${face.tone}` : "";
  const locked = face.locked === true || face.href === "";
  const body = (
    <>
      <span className="node-face-glyph" aria-hidden="true">
        <NodeGlyph id={face.glyph || face.id} />
      </span>
      <h2 className="node-face-name">{face.name}</h2>
      <p className="node-face-headline">{face.headline}</p>
      <p className={`node-face-status${tone}`}>{face.status}</p>
    </>
  );
  return (
    <article
      className={`node-face${face.live ? " is-live" : " is-offline"}${face.locked ? " is-locked" : ""}`}
      aria-label={face.locked ? `${face.name}, private` : face.name}
      data-node-face={face.id}
    >
      {onRemove ? (
        <button
          type="button"
          className="node-delete"
          aria-label="Delete node"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
      {face.locked ? (
        <span className="node-face-lock" data-lock-badge>
          <LockMark />
          Private
        </span>
      ) : null}
      {face.href && !locked ? (
        <Link href={face.href} className="node-face-link" title={`Open ${face.name}`}>
          {body}
        </Link>
      ) : (
        <div className="node-face-link" data-locked={face.locked ? "true" : undefined}>
          {body}
        </div>
      )}
    </article>
  );
}

export function NodeFaceGrid({
  children,
  count,
  label = "Node floor",
}: {
  children: ReactNode;
  count?: number;
  label?: string;
}) {
  const nodes = count ?? Children.toArray(children).length;
  return (
    <section
      className="node-face-grid"
      aria-label={label}
      data-node-face-grid
      data-node-count={nodes}
      style={{ "--face-count": nodes } as CSSProperties}
    >
      {children}
    </section>
  );
}

const HOME_GLYPHS = new Set([
  "crypto",
  "ai-stocks",
  "fitness",
  "finance",
  "fight-desk",
  "build",
  "control",
  "health",
  "youtube",
  "system",
  "lessons",
  "roundtable",
  "chain-security",
]);

/** Home ids stay exact. Week and month fitness tiles share a mark by suffix. */
function glyphKind(id: string): string {
  if (HOME_GLYPHS.has(id)) return id;
  if (id.includes("average-steps")) return "steps";
  if (id.includes("longest-run")) return "longest";
  if (id.includes("active-days")) return "active";
  if (id.includes("versus-last-week")) return "versus";
  if (/(^|-)runs$/.test(id)) return "runs";
  if (id === "miles" || id.endsWith("-miles")) return "miles";
  if (id === "pace" || id.endsWith("-pace")) return "pace";
  if (id === "lifting" || id.endsWith("-lifting")) return "lifting";
  if (id === "manual" || id.endsWith("-manual")) return "manual";
  return id;
}

function LockMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="11" width="12" height="9" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 11V8.2a3.5 3.5 0 0 1 7 0V11" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function NodeGlyph({ id }: { id: string }) {
  const kind = glyphKind(id);
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  if (kind === "crypto") {
    return (
      <svg viewBox="0 0 24 24">
        <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" {...stroke} />
        <circle cx="12" cy="12" r="2.2" {...stroke} />
      </svg>
    );
  }
  if (kind === "ai-stocks") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 17h16" {...stroke} />
        <path d="M7 17V11" {...stroke} />
        <path d="M12 17V7" {...stroke} />
        <path d="M17 17V9" {...stroke} />
      </svg>
    );
  }
  if (kind === "fitness") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 12h3l2-4 3 8 2-4h6" {...stroke} />
      </svg>
    );
  }
  if (kind === "finance") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="5" y="4" width="14" height="16" rx="1.5" {...stroke} />
        <path d="M8 9h8M8 12h8M8 15h5" {...stroke} />
      </svg>
    );
  }
  if (kind === "fight-desk") {
    return (
      <svg viewBox="0 0 24 24">
        <polygon points="12,3 21,12 12,21 3,12" {...stroke} />
      </svg>
    );
  }
  if (kind === "build") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="4" width="7" height="7" {...stroke} />
        <rect x="13" y="4" width="7" height="7" {...stroke} />
        <rect x="4" y="13" width="7" height="7" {...stroke} />
        <rect x="13" y="13" width="7" height="7" {...stroke} />
      </svg>
    );
  }
  if (kind === "control") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" {...stroke} />
        <path d="M12 12l4-2" {...stroke} />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "health") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" {...stroke} />
        <path d="M12 8.5v7M8.5 12h7" {...stroke} />
      </svg>
    );
  }
  if (kind === "youtube") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="3.5" y="6" width="17" height="12" rx="2.5" {...stroke} />
        <polygon points="11,9.5 16,12 11,14.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "system") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="6" cy="8" r="2" {...stroke} />
        <circle cx="18" cy="8" r="2" {...stroke} />
        <circle cx="12" cy="17" r="2" {...stroke} />
        <path d="M8 8h8M7.2 9.6l3.4 5.2M16.8 9.6l-3.4 5.2" {...stroke} />
      </svg>
    );
  }
  if (kind === "lessons") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 5.5h6.5a2 2 0 0 1 2 2V19a2 2 0 0 0-2-1.5H5z" {...stroke} />
        <path d="M19 5.5h-6.5a2 2 0 0 0-2 2V19a2 2 0 0 1 2-1.5H19z" {...stroke} />
      </svg>
    );
  }
  if (kind === "roundtable") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="8" cy="9" r="2.2" {...stroke} />
        <circle cx="16" cy="9" r="2.2" {...stroke} />
        <path d="M4.5 17.5c.6-2 2.2-3 3.5-3s2.9 1 3.5 3M12.5 17.5c.6-2 2.2-3 3.5-3s2.9 1 3.5 3" {...stroke} />
      </svg>
    );
  }
  if (kind === "backup") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4.5 8.5h15l-1.2-3h-12.6z" {...stroke} />
        <path d="M5 8.5h14V19H5z" {...stroke} />
        <path d="M9 13.5h6" {...stroke} />
      </svg>
    );
  }
  if (kind === "chain-security") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 3.5l7 2.5v6.2c0 3.6-2.6 6.4-7 8.3-4.4-1.9-7-4.7-7-8.3V6z" {...stroke} />
        <path d="M9 12l2 2 4-4" {...stroke} />
      </svg>
    );
  }
  if (kind === "steps") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 18h5.5V13H15V8H20" {...stroke} />
      </svg>
    );
  }
  if (kind === "runs") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 16.5c1.6-5.2 4.2-7.5 7-7.5s5.4 2.3 7 7.5" {...stroke} />
        <circle cx="5" cy="16.5" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="19" cy="16.5" r="1.25" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "miles") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M7 20V4.5" {...stroke} />
        <path d="M7 5h9l-2.3 3.3L16 11.6H7" {...stroke} />
      </svg>
    );
  }
  if (kind === "pace") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="13" r="6.5" {...stroke} />
        <path d="M12 13V9.2M10 4.2h4" {...stroke} />
      </svg>
    );
  }
  if (kind === "active") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="3" cy="12" r="1.15" {...stroke} />
        <circle cx="6" cy="12" r="1.15" {...stroke} />
        <circle cx="9" cy="12" r="1.15" {...stroke} />
        <circle cx="12" cy="12" r="1.15" {...stroke} />
        <circle cx="15" cy="12" r="1.15" {...stroke} />
        <circle cx="18" cy="12" r="1.15" {...stroke} />
        <circle cx="21" cy="12" r="1.15" {...stroke} />
      </svg>
    );
  }
  if (kind === "longest") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 12h13" {...stroke} />
        <path d="M14 8l4 4-4 4" {...stroke} />
      </svg>
    );
  }
  if (kind === "versus") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M7 10l5-4 5 4M7 18l5-4 5 4" {...stroke} />
      </svg>
    );
  }
  if (kind === "lifting") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M3 12h18" {...stroke} />
        <path d="M6 8v8M8.6 9.4v5.2M15.4 9.4v5.2M18 8v8" {...stroke} />
      </svg>
    );
  }
  if (kind === "manual") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4.5 19.5l1.4-4.4L16.2 4.8l3.2 3.2-10.3 10.3z" {...stroke} />
        <path d="M13.8 7.2l3.2 3.2" {...stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <rect x="5" y="5" width="14" height="14" {...stroke} />
    </svg>
  );
}
