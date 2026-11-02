import { Children, isValidElement, type ReactNode } from "react";
import { SECTION_LABEL, SECTION_ORDER, type NodeSectionKind } from "@/lib/node-layout";

/**
 * One labeled block. An empty section is a single compact row.
 * NodeSections paints Key numbers, then Trends, then Lists/Children.
 */
export function NodeSection({
  kind,
  label,
  empty = false,
  children,
}: {
  kind: NodeSectionKind;
  label?: string;
  empty?: boolean;
  children?: ReactNode;
}) {
  const title = label ?? SECTION_LABEL[kind];
  if (empty) {
    return (
      <section className="node-section is-empty" data-section={kind} aria-label={title}>
        <h2 className="node-section-label">{title}</h2>
        <p className="node-section-empty">—</p>
      </section>
    );
  }
  return (
    <section className="node-section" data-section={kind} aria-label={title}>
      <h2 className="node-section-label">{title}</h2>
      <div className="node-section-body">{children}</div>
    </section>
  );
}

function sectionRank(node: ReactNode): number {
  if (!isValidElement(node)) return SECTION_ORDER.length;
  const kind = (node.props as { kind?: NodeSectionKind }).kind;
  const index = kind ? SECTION_ORDER.indexOf(kind) : -1;
  return index === -1 ? SECTION_ORDER.length : index;
}

export function NodeSections({ children }: { children: ReactNode }) {
  const sorted = Children.toArray(children).sort((left, right) => sectionRank(left) - sectionRank(right));
  return <div className="node-sections">{sorted}</div>;
}
