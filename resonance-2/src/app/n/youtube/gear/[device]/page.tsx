import Link from "next/link";
import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeGearDetail } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";
import { findGear } from "@/lib/youtube-node";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ device: string }> }) {
  const { device } = await params;
  const item = findGear(device);
  return { title: `${item?.name ?? "Gear"} · YouTube · Resonance 2.0` };
}

export default async function YouTubeGearDevicePage({
  params,
}: {
  params: Promise<{ device: string }>;
}) {
  await requireRole("owner");
  const { device } = await params;
  const item = findGear(device);
  if (!item) notFound();
  const publicMode = await isPublicMode();
  return (
    <OperatorShell>
      <Link href="/n/youtube/gear" className="calendar-back">
        Gear
      </Link>
      <YouTubeGearDetail item={item} publicMode={publicMode} />
    </OperatorShell>
  );
}
