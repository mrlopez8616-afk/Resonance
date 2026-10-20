import { FightTimeScreen } from "@/app/fights/time-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Upcoming Events · Resonance 2.0",
};

export default function UpcomingEventsPage() {
  return <FightTimeScreen bucket="upcoming" />;
}
