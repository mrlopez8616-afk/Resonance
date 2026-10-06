import { FightNodeRoute } from "@/app/fights/node-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contender Series · Resonance 2.0",
};

export default function ContenderSeriesPage() {
  return <FightNodeRoute nodeId="contender-series" />;
}
