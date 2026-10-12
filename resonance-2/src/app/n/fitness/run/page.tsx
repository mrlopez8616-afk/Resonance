import Link from "next/link";
import { notFound } from "next/navigation";
import { RunTracker } from "@/components/run-tracker";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Start Run · Fitness · Resonance 2.0",
};

/** Owner only. Public mode is a 404. Signed out goes to /login?next=... */
export default async function StartRunPage() {
  await requireRole("owner");
  if (await isPublicMode()) notFound();
  return (
    <OperatorShell>
      <Link href="/n/fitness" className="calendar-back">
        Fitness
      </Link>
      <RunTracker />
    </OperatorShell>
  );
}
