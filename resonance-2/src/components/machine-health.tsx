import type { MachineHealth } from "@/lib/factory-floor";

/**
 * Reserved Health of the Machine slot.
 * Pass a `MachineHealth` when the score exists. Null is the coming-soon state.
 */
function percentText(score: number | null): string {
  return score === null ? "not connected" : `${score}%`;
}

export function MachineHealthSlot({ health }: { health: MachineHealth | null }) {
  const parts = health?.parts ?? [];
  return (
    <section className="tv-panel tv-machine" aria-label="Health of the Machine" data-panel="Machine">
      <h2 className="tv-kicker">Machine</h2>
      {health ? (
        <>
          <p
            className={health.score === null ? "tv-machine-empty" : "tv-figure"}
            data-machine-score
            data-tone={health.score === null ? undefined : health.tone}
          >
            {percentText(health.score)}
          </p>
          {parts.length > 0 ? (
            <ul className="tv-machine-parts">
              {parts.map((part) => (
                <li key={part.label}>
                  <span className="tv-machine-name">{part.label}</span>
                  <span className="tv-machine-pct" data-machine-part={part.label}>
                    {percentText(part.score)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tv-line">{health.label}</p>
          )}
        </>
      ) : (
        <p className="tv-missing" data-machine="soon">
          coming soon
        </p>
      )}
    </section>
  );
}
