import { FightNodeRoute } from "@/app/fights/node-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Main Card · Resonance 2.0",
};

export default function MainCardPage() {
  return <FightNodeRoute nodeId="main-card" />;
}
