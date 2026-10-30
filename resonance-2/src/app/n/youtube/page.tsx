import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeAnalyticsPanel, YouTubeParent } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { brickParentCard } from "@/lib/youtube-bricks";
import { loadBrickCounts } from "@/lib/youtube-bricks-store";
import { loadYouTubeScreen } from "@/lib/youtube-screen";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "YouTube · Resonance 2.0",
};

export default async function YouTubePage({
  searchParams,
}: {
  searchParams: Promise<{ youtube?: string | string[] }>;
}) {
  await requireRole("owner");
  const query = await searchParams;
  const denied = query.youtube === "denied";
  let brick = undefined;
  let unavailable = false;
  let screen = null;
  const [brickResult, screenResult] = await Promise.all([
    loadBrickCounts()
      .then((counts) => ({ ok: true as const, counts }))
      .catch((error: unknown) => {
        if (!isStorageUnavailable(error)) throw error;
        return { ok: false as const };
      }),
    loadYouTubeScreen(denied)
      .then((view) => ({ ok: true as const, view }))
      .catch((error: unknown) => {
        if (!isStorageUnavailable(error)) throw error;
        return { ok: false as const };
      }),
  ]);
  if (brickResult.ok) brick = brickParentCard(brickResult.counts);
  else unavailable = true;
  if (screenResult.ok) screen = screenResult.view;
  else unavailable = true;
  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <YouTubeParent brick={brick} channel={screen?.channelFace} />
      {screen ? <YouTubeAnalyticsPanel screen={screen} /> : null}
    </OperatorShell>
  );
}
