import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { loadPortfolioMood } from "@/lib/portfolio-mood-load";
import { requestIsPublicMode } from "@/lib/public-mode-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  const mood = await loadPortfolioMood();
  const body = (await requestIsPublicMode(request))
    ? { tone: mood.tone, changePct: mood.changePct, partial: mood.partial }
    : mood;
  return finishAuthorizedRead(
    Response.json(body, {
      headers: { "cache-control": "no-store" },
    }),
    access,
  );
}
