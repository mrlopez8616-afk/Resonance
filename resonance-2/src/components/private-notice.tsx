import type { ReactNode } from "react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { isPublicMode } from "@/lib/public-mode-server";

export function PrivateNotice() {
  return (
    <p className="parent-empty" role="status">
      Private
    </p>
  );
}

export async function PrivatePage() {
  return (
    <OperatorShell>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <PrivateNotice />
    </OperatorShell>
  );
}

/** The hidden-route body, or null when public mode is off. */
export async function blockedPublicPage(): Promise<ReactNode | null> {
  if (!(await isPublicMode())) return null;
  return <PrivatePage />;
}
