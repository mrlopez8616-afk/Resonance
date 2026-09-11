export default function NotFound() {
  return (
    <div className="card max-w-lg">
      <p className="kicker">404</p>
      <h1 className="mt-2 text-2xl">That screen is not on the board</h1>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        Phase Zero only has Overview, Treasury, Nodes, Prices, Decisions, and
        Settings.
      </p>
    </div>
  );
}
