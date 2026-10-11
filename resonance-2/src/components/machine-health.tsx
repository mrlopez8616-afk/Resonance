import type { MachineHealth } from "@/lib/factory-floor";

/**
 * Reserved Health of the Machine slot.
 * Pass a `MachineHealth` when the score exists. Null is the coming-soon state.
 */
export function MachineHealthSlot({ health }: { health: MachineHealth | null }) {
  return (
    <section className="tv-panel tv-machine" aria-label="Health of the Machine" data-panel="Machine">
      <h2 className="tv-kicker">Machine</h2>
      {health ? (
        <>
          <p className="tv-figure" data-machine-score data-tone={health.tone}>
            {health.score}
          </p>
          <p className="tv-line">{health.label}</p>
        </>
      ) : (
        <p className="tv-missing" data-machine="soon">
          coming soon
        </p>
      )}
    </section>
  );
}
