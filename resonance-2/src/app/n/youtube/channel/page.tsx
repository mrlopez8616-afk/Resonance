import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeChannel } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Channel · YouTube · Resonance 2.0",
};

export default async function YouTubeChannelPage() {
  await requireRole("owner");
  return (
    <OperatorShell>
      <Link href="/n/youtube" className="calendar-back">
        YouTube
      </Link>
      <YouTubeChannel />
    </OperatorShell>
  );
}
