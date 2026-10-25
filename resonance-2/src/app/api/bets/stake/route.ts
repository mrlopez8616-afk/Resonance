import { postBetStake } from "@/lib/bet-write-http";

export const dynamic = "force-dynamic";

/** `{ id, stake }`. Same Bearer as POST /api/bets/settle. */
export async function POST(request: Request) {
  return postBetStake(request);
}

/** Same body and writer as POST. */
export async function PATCH(request: Request) {
  return postBetStake(request);
}
