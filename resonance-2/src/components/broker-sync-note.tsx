/** Private sync lines. Cash may be included. Public pages do not render this. */
export function BrokerSyncNote({ lines }: { lines: readonly string[] }) {
  const shown = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((line, index) => (
        <p key={`${index}-${line}`} className="node-note">
          {line}
        </p>
      ))}
    </>
  );
}
