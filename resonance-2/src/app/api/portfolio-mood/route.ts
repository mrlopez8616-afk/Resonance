import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { loadPortfolioMood } from "@/lib/portfolio-mood-load";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  const mood = await loadPortfolioMood();
  return finishAuthorizedRead(
    Response.json(mood, {
      headers: { "cache-control": "no-store" },
    }),
    access,
  );
}
