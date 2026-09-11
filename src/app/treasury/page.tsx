"use client";

import { useState } from "react";
import { ProvenanceBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Field, Stat } from "@/components/ui";
import { usePrices } from "@/context/prices";
import { useStore } from "@/context/store";
import { formatUsd, formatUnits, todayIsoDate } from "@/lib/format";
import {
  netAmount,
  sortLedger,
  totalsByClassification,
} from "@/lib/ledger";
import type { LedgerClassification } from "@/lib/types";

const CLASSES: LedgerClassification[] = [
  "principal",
  "reward",
  "fee",
  "transfer",
];

export default function TreasuryPage() {
  const { ready, epoch, state, addLedgerEntry, deleteLedgerEntry } = useStore();
  const { quoteFor, book } = usePrices();
  const xrp = quoteFor("XRP");
  const [date, setDate] = useState(todayIsoDate());
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [note, setNote] = useState("");
  const [classification, setClassification] =
    useState<LedgerClassification>("reward");
  const [applyToBalance, setApplyToBalance] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const usd =
    xrp && Number.isFinite(state.treasury.units)
      ? state.treasury.units * xrp.usd
      : null;
  const totals = totalsByClassification(state.ledger);
  const rows = sortLedger(state.ledger);

  function submitClaim(event: React.FormEvent) {
    event.preventDefault();
    const amt = Number(amount);
    const feeAmt = Number(fee);
    if (!date) {
      setFormError("Enter a date.");
      return;
    }
    if (!Number.isFinite(amt) || amt < 0) {
      setFormError("Amount must be a number ≥ 0.");
      return;
    }
    if (!Number.isFinite(feeAmt) || feeAmt < 0) {
      setFormError("Fee must be a number ≥ 0.");
      return;
    }
    if (amt === 0 && feeAmt === 0) {
      setFormError("Enter an amount or a fee.");
      return;
    }
    addLedgerEntry({
      date,
      amount: amt,
      fee: feeAmt,
      note: note.trim(),
      classification,
      applyToBalance,
    });
    setAmount("");
    setFee("0");
    setNote("");
    setFormError(null);
  }

  if (!ready) {
    return <p className="text-sm text-[color:var(--muted)]">Loading treasury…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="Books"
        title="Treasury"
        description="Working balance is operator-edited and stored in this browser. The ledger is a local claim log — not an XRPL proof."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Working balance"
          value={formatUnits(state.treasury.units)}
          hint={
            <span className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge value={state.treasury.provenance} />
              Last edited {state.treasury.updatedAt.slice(0, 10)}
            </span>
          }
        />
        <Stat
          label="Est. USD"
          value={formatUsd(usd)}
          hint={
            xrp
              ? `XRP ${formatUsd(xrp.usd)} · ${book.crypto.source}`
              : "No live XRP print — USD left blank on purpose."
          }
        />
        <Stat
          label="Recorded rewards"
          value={formatUnits(totals.reward.amount)}
          hint={`${totals.reward.count} reward rows · fees ${formatUnits(totals.reward.fees + totals.fee.amount)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <WorkingBalanceForm key={`${epoch}-${state.treasury.updatedAt}`} />

        <form className="card space-y-4" onSubmit={submitClaim}>
          <h2 className="text-lg">Add claim</h2>
          <p className="text-sm text-[color:var(--muted)]">
            Log a reward, fee, principal movement, or transfer. Optionally apply
            the net to the working balance.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">
              <input
                className="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label="Classification">
              <select
                className="select"
                value={classification}
                onChange={(event) =>
                  setClassification(event.target.value as LedgerClassification)
                }
              >
                {CLASSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (XRP)">
              <input
                className="input font-mono"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Fee (XRP)">
              <input
                className="input font-mono"
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Note">
            <textarea
              className="textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What happened, where, and why it is still unverified."
            />
          </Field>
          <label className="flex items-start gap-2 text-sm text-[color:var(--muted)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={applyToBalance}
              onChange={(event) => setApplyToBalance(event.target.checked)}
            />
            <span>
              Apply net ({formatUnits(netAmount({ amount: Number(amount) || 0, fee: Number(fee) || 0 }))}
              ) to the working balance. Seed history is stored without this so
              the opening 26,000 is not double-counted.
            </span>
          </label>
          {formError ? (
            <p className="text-sm text-[color:var(--danger)]">{formError}</p>
          ) : null}
          <button className="btn btn-primary" type="submit">
            Add to ledger
          </button>
        </form>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg">Ledger</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="No ledger rows"
            body="Add the first claim above. Use classification principal for opening size, reward for Flare-vault harvests, fee for costs, transfer for venue moves."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {entry.date}
                    </td>
                    <td className="capitalize">{entry.classification}</td>
                    <td className="font-mono tabular-nums">
                      {formatUnits(entry.amount, "")}
                    </td>
                    <td className="font-mono tabular-nums">
                      {formatUnits(entry.fee, "")}
                    </td>
                    <td className="max-w-md text-[color:var(--muted)]">
                      {entry.note || "—"}
                      {entry.applyToBalance ? (
                        <span className="mt-1 block text-xs text-[color:var(--accent)]">
                          Applied to working balance
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger px-2 py-1 text-xs"
                        onClick={() => deleteLedgerEntry(entry.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function WorkingBalanceForm() {
  const { state, updateTreasury } = useStore();
  const [units, setUnits] = useState(String(state.treasury.units));
  const [daily, setDaily] = useState(String(state.treasury.estimatedDailyReward));
  const [venue, setVenue] = useState(state.treasury.venue);
  const [location, setLocation] = useState(state.treasury.locationNote);

  function saveBalance(event: React.FormEvent) {
    event.preventDefault();
    const nextUnits = Number(units);
    const nextDaily = Number(daily);
    if (!Number.isFinite(nextUnits) || nextUnits < 0) return;
    if (!Number.isFinite(nextDaily) || nextDaily < 0) return;
    updateTreasury({
      units: nextUnits,
      estimatedDailyReward: nextDaily,
      venue: venue.trim() || state.treasury.venue,
      locationNote: location.trim() || state.treasury.locationNote,
      provenance: "founder-reported",
    });
  }

  return (
    <form className="card space-y-4" onSubmit={saveBalance}>
      <h2 className="text-lg">Working balance</h2>
      <p className="text-sm text-[color:var(--muted)]">
        Seeded at ~26,000 XRP on Xaman in a Flare vault, ~1 XRP/day. Treat as
        founder-reported until verified.
      </p>
      <Field label="Units (XRP)">
        <input
          className="input font-mono"
          inputMode="decimal"
          value={units}
          onChange={(event) => setUnits(event.target.value)}
        />
      </Field>
      <Field label="Estimated daily reward (XRP)">
        <input
          className="input font-mono"
          inputMode="decimal"
          value={daily}
          onChange={(event) => setDaily(event.target.value)}
        />
      </Field>
      <Field label="Venue of record">
        <input
          className="input"
          value={venue}
          onChange={(event) => setVenue(event.target.value)}
        />
      </Field>
      <Field label="Location note">
        <input
          className="input"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </Field>
      <button className="btn btn-primary" type="submit">
        Save working balance
      </button>
    </form>
  );
}
