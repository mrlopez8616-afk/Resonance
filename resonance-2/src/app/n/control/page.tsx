import Link from "next/link";
import { ControlParent } from "@/components/control-room";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { presentControlRoom } from "@/lib/control-room";
import { loadControlRoom } from "@/lib/control-room-store";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Control Room · Resonance 2.0",
};

export default async function ControlRoomPage() {
  await requireRole("owner");
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

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {room ? <ControlParent view={presentControlRoom(room, publicMode)} now={now} /> : null}
    </OperatorShell>
  );
}
