import { FightPromotionRoute } from "@/app/fights/promotion-route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "UFC · Resonance 2.0",
};

export default function UfcPromotionPage() {
  return <FightPromotionRoute promotionId="ufc" />;
}
