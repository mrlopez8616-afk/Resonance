import Link from "next/link";
import { ChainSecurityFloor } from "@/components/chain-security-floor";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { loadChainSecurityFeed } from "@/lib/chain-security-store";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Chain Security · Resonance 2.0",
};

export default async function ChainSecurityPage() {
  await requireRole("owner");
  let feed = null;
  let unavailable = false;
  try {
    feed = await loadChainSecurityFeed(await isPublicMode());
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {feed ? <ChainSecurityFloor feed={feed} /> : null}
    </OperatorShell>
  );
}
