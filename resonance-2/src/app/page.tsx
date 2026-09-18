import { FillLog } from "@/components/fill-log";
import { listFills } from "@/lib/fills";

export default function Home() {
  const fills = listFills();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 border-b border-[color:var(--border)] pb-5">
        <p className="mb-2 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Operator log
        </p>
        <h1 className="text-2xl tracking-tight text-[color:var(--text)] sm:text-3xl">
          Resonance 2.0
        </h1>
        <p className="mt-2 max-w-md text-[0.95rem] leading-6 text-[color:var(--muted)]">
          Agentic sleeve only. Main and the vault are not shown here.
        </p>
        <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">
          {fills.length} fill{fills.length === 1 ? "" : "s"} · static file · no live
          brokerage
        </p>
      </header>
      <FillLog fills={fills} />
    </div>
  );
}
