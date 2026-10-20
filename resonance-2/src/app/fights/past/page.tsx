import { FightTimeScreen } from "@/app/fights/time-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Past Events · Resonance 2.0",
};

export default function PastEventsPage() {
  return <FightTimeScreen bucket="past" />;
}
