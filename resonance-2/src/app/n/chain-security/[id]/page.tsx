import Link from "next/link";
import { notFound } from "next/navigation";
import { ChainSecurityDetail } from "@/components/chain-security-floor";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { CHAIN_SECURITY_HREF, isIncidentId } from "@/lib/chain-security";
import { loadChainSecurityIncident } from "@/lib/chain-security-store";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Incident · Chain Security · Resonance 2.0",
};

export default async function ChainSecurityIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("owner");
  const { id } = await params;
  if (!isIncidentId(id)) notFound();

  let incident = null;
  let unavailable = false;
  try {
    incident = await loadChainSecurityIncident(id, await isPublicMode());
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  if (!unavailable && !incident) notFound();

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href={CHAIN_SECURITY_HREF} className="calendar-back">
        Chain Security
      </Link>
      {incident ? <ChainSecurityDetail incident={incident} /> : null}
    </OperatorShell>
  );
}
