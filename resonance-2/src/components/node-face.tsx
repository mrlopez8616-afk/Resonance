import { Children, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { HomeFace } from "@/lib/home-faces";

/**
 * Shared geometric face for every home tile and every node-page tile.
 * Glyph, name, one headline, one status line. The grid gives each face the same box.
 */
export function NodeFace({ face, onRemove }: { face: HomeFace; onRemove?: () => void }) {
  const tone = face.tone ? ` is-${face.tone}` : "";
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
      className={`node-face${face.live ? " is-live" : " is-offline"}`}
      aria-label={face.name}
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
      {face.href ? (
        <Link href={face.href} className="node-face-link" title={`Open ${face.name}`}>
          {body}
        </Link>
      ) : (
        <div className="node-face-link">{body}</div>
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

function NodeGlyph({ id }: { id: string }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  if (id === "crypto") {
    return (
      <svg viewBox="0 0 24 24">
        <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" {...stroke} />
        <circle cx="12" cy="12" r="2.2" {...stroke} />
      </svg>
    );
  }
  if (id === "ai-stocks") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 17h16" {...stroke} />
        <path d="M7 17V11" {...stroke} />
        <path d="M12 17V7" {...stroke} />
        <path d="M17 17V9" {...stroke} />
      </svg>
    );
  }
  if (id === "fitness") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 12h3l2-4 3 8 2-4h6" {...stroke} />
      </svg>
    );
  }
  if (id === "finance") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="5" y="4" width="14" height="16" rx="1.5" {...stroke} />
        <path d="M8 9h8M8 12h8M8 15h5" {...stroke} />
      </svg>
    );
  }
  if (id === "fight-desk") {
    return (
      <svg viewBox="0 0 24 24">
        <polygon points="12,3 21,12 12,21 3,12" {...stroke} />
      </svg>
    );
  }
  if (id === "build") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="4" width="7" height="7" {...stroke} />
        <rect x="13" y="4" width="7" height="7" {...stroke} />
        <rect x="4" y="13" width="7" height="7" {...stroke} />
        <rect x="13" y="13" width="7" height="7" {...stroke} />
      </svg>
    );
  }
  if (id === "control") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" {...stroke} />
        <path d="M12 12l4-2" {...stroke} />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === "health") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" {...stroke} />
        <path d="M12 8.5v7M8.5 12h7" {...stroke} />
      </svg>
    );
  }
  if (id === "youtube") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="3.5" y="6" width="17" height="12" rx="2.5" {...stroke} />
        <polygon points="11,9.5 16,12 11,14.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === "system") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="6" cy="8" r="2" {...stroke} />
        <circle cx="18" cy="8" r="2" {...stroke} />
        <circle cx="12" cy="17" r="2" {...stroke} />
        <path d="M8 8h8M7.2 9.6l3.4 5.2M16.8 9.6l-3.4 5.2" {...stroke} />
      </svg>
    );
  }
  if (id === "lessons") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M5 5.5h6.5a2 2 0 0 1 2 2V19a2 2 0 0 0-2-1.5H5z" {...stroke} />
        <path d="M19 5.5h-6.5a2 2 0 0 0-2 2V19a2 2 0 0 1 2-1.5H19z" {...stroke} />
      </svg>
    );
  }
  if (id === "roundtable") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="8" cy="9" r="2.2" {...stroke} />
        <circle cx="16" cy="9" r="2.2" {...stroke} />
        <path d="M4.5 17.5c.6-2 2.2-3 3.5-3s2.9 1 3.5 3M12.5 17.5c.6-2 2.2-3 3.5-3s2.9 1 3.5 3" {...stroke} />
      </svg>
    );
  }
  if (id === "chain-security") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 3.5l7 2.5v6.2c0 3.6-2.6 6.4-7 8.3-4.4-1.9-7-4.7-7-8.3V6z" {...stroke} />
        <path d="M9 12l2 2 4-4" {...stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <rect x="5" y="5" width="14" height="14" {...stroke} />
    </svg>
  );
}
