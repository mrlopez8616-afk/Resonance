import type { ReactNode } from "react";

/**
 * Frame for one node page. Pages render this inside the existing operator shell.
 * It does not open a second shell.
 */
export function NodeLayout({ children }: { children: ReactNode }) {
  return <div className="node-layout">{children}</div>;
}
