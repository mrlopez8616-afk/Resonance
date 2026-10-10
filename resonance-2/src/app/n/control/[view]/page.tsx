import Link from "next/link";
import { notFound } from "next/navigation";
import { ControlChild } from "@/components/control-room";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { isControlView, presentControlRoom } from "@/lib/control-room";
import { loadControlRoom } from "@/lib/control-room-store";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

const TITLES = {
  approvals: "Approvals",
  bots: "Bots",
  feeds: "Feeds",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const label = isControlView(view) ? TITLES[view] : "Control Room";
  return { title: `${label} · Control Room · Resonance 2.0` };
}

export default async function ControlChildPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  await requireRole("owner");
  const { view } = await params;
  if (!isControlView(view)) notFound();
  if (view === "approvals") {
    const blocked = await blockedPublicPage();
    if (blocked) return blocked;
  }

  const publicMode = await isPublicMode();
  const now = new Date();
  let room: Awaited<ReturnType<typeof loadControlRoom>> | null = null;
  let unavailable = false;
  try {
    room = await loadControlRoom({ publicMode, probeLive: true, now });
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  const presented = room ? presentControlRoom(room, publicMode) : null;
  if (view === "approvals" && presented && !presented.approvals) notFound();

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/control" className="calendar-back">
        Control Room
      </Link>
      {presented ? <ControlChild view={view} room={presented} now={now} /> : null}
    </OperatorShell>
  );
}
