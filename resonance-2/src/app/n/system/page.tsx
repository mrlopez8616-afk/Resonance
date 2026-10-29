import Link from "next/link";
import { SystemMap } from "@/components/system-map";
import { OperatorShell } from "@/components/operator-shell";
import { parseSystemLens } from "@/data/system-map";
import { isPublicMode } from "@/lib/public-mode-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System · Resonance 2.0",
};

export default async function SystemPage({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string | string[] }>;
}) {
  const lens = parseSystemLens((await searchParams).lens);
  const publicMode = await isPublicMode();
  return (
    <OperatorShell>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <SystemMap lens={lens} publicMode={publicMode} />
    </OperatorShell>
  );
}
