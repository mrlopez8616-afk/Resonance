import { loadPortfolioMood } from "@/lib/portfolio-mood-load";

export const dynamic = "force-dynamic";

export async function GET() {
  const mood = await loadPortfolioMood();
  return Response.json(mood, {
    headers: { "cache-control": "no-store" },
  });
}
