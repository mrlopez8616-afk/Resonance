import { FightEventScreen, fightEventMetadata } from "@/app/fights/event-route";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  return fightEventMetadata(event);
}

export default async function PastEventPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  return <FightEventScreen event={event} bucket="past" />;
}
