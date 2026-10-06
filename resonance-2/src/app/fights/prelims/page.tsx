import { FightNodeRoute } from "@/app/fights/node-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Prelims · Resonance 2.0",
};

export default function PrelimsPage() {
  return <FightNodeRoute nodeId="prelims" />;
}
