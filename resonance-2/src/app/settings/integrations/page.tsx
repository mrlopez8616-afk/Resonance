import Link from "next/link";
import { FactorioGuide } from "@/components/factorio-guide";
import { FactorioToken } from "@/components/factorio-token";
import { HealthAutoExportGuide } from "@/components/health-auto-export-guide";
import { HealthAutoExportToken } from "@/components/health-auto-export-token";
import { ObsGuide } from "@/components/obs-guide";
import { ObsToken } from "@/components/obs-token";
import { PrinterGuide } from "@/components/printer-guide";
import { PrinterToken } from "@/components/printer-token";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { factorioTokenConfigured } from "@/lib/factorio-store";
import { healthAutoExportTokenConfigured } from "@/lib/health-auto-export-store";
import { obsTokenConfigured } from "@/lib/obs-store";
import { printerTokenConfigured } from "@/lib/printer-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Integrations · Resonance 2.0",
};

export default async function IntegrationsPage() {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  await requireRole("owner");
  let healthConfigured = false;
  let factorioConfigured = false;
  let printerConfigured = false;
  let obsConfigured = false;
  let unavailable = false;
  try {
    [healthConfigured, factorioConfigured, printerConfigured, obsConfigured] = await Promise.all([
      healthAutoExportTokenConfigured(),
      factorioTokenConfigured(),
      printerTokenConfigured(),
      obsTokenConfigured(),
    ]);
  } catch {
    unavailable = true;
  }
  return (
    <OperatorShell>
      <Link href="/settings" className="calendar-back">
        Founder
      </Link>
      <section className="public-settings" aria-label="Integrations">
        <h2>Integrations</h2>
        {unavailable ? (
          <p className="auth-note">Storage is unavailable.</p>
        ) : (
          <>
            <HealthAutoExportToken configured={healthConfigured} />
            <FactorioToken configured={factorioConfigured} />
            <PrinterToken configured={printerConfigured} />
            <ObsToken configured={obsConfigured} />
          </>
        )}
        <HealthAutoExportGuide />
        <FactorioGuide />
        <PrinterGuide />
        <ObsGuide />
      </section>
    </OperatorShell>
  );
}
