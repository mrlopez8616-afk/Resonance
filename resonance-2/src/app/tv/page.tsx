import { FactoryFloorView } from "@/components/factory-floor";
import { TvLive } from "@/components/tv-live";
import { TvRuntime } from "@/components/tv-runtime";
import { requireRole } from "@/lib/auth-session";
import { loadFactoryFloor } from "@/lib/factory-floor-load";
import "./tv.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Factory Floor · Resonance 2.0",
};

export default async function FactoryFloorPage() {
  await requireRole("owner");
  const model = await loadFactoryFloor();
  return (
    <TvRuntime>
      <FactoryFloorView model={model} map={<TvLive />} />
    </TvRuntime>
  );
}
