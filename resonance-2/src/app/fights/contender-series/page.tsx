import { FightPromotionRoute } from "@/app/fights/promotion-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contender Series · Resonance 2.0",
};

export default function ContenderSeriesPage() {
  return <FightPromotionRoute promotionId="contender-series" />;
}
