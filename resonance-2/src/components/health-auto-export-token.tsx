export const HEALTH_AUTO_EXPORT_TOKEN_NOTE = "Use Settings -> Security -> Fitness sync token.";

export function HealthAutoExportToken() {
  return (
    <section className="fitness-setup" aria-label="Health Auto Export token">
      <p className="auth-note">{HEALTH_AUTO_EXPORT_TOKEN_NOTE}</p>
    </section>
  );
}
