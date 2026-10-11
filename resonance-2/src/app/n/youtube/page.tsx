import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeParent } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "YouTube · Resonance 2.0",
};

export default async function YouTubePage() {
  await requireRole("owner");
  return (
    <OperatorShell>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <YouTubeParent />
    </OperatorShell>
  );
}
