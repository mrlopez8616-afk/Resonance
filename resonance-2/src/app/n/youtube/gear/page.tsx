import { OperatorShell } from "@/components/operator-shell";
import { YouTubeGearList } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gear · YouTube · Resonance 2.0",
};

export default async function YouTubeGearPage() {
  await requireRole("owner");
  return (
    <OperatorShell>
      <YouTubeGearList />
    </OperatorShell>
  );
}
