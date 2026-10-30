import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeChannel } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadYouTubeScreen } from "@/lib/youtube-screen";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Channel · YouTube · Resonance 2.0",
};

export default async function YouTubeChannelPage({
  searchParams,
}: {
  searchParams: Promise<{ youtube?: string | string[] }>;
}) {
  await requireRole("owner");
  const query = await searchParams;
  const denied = query.youtube === "denied";
  const publicMode = await isPublicMode();
  let unavailable = false;
  let screen = null;
  try {
    screen = await loadYouTubeScreen(denied);
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/youtube" className="calendar-back">
        YouTube
      </Link>
      <YouTubeChannel
        publicMode={publicMode}
        stats={screen?.channelStats ?? null}
        notice={screen?.skipMessage ?? screen?.notice ?? null}
      />
    </OperatorShell>
  );
}
