import { postBetSettlement } from "@/lib/bet-write-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return postBetSettlement(request);
}
