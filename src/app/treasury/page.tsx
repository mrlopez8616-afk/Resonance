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
import { parseOptionalNumber, xrpUsdRate } from "@/lib/valuation";

const CLASSES: LedgerClassification[] = [
  "principal",
  "reward",
  "fee",
  "transfer",
];

export default function TreasuryPage() {
  const { ready, epoch, state, addLedgerEntry, updateLedgerEntry, deleteLedgerEntry } =
    useStore();
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

  const rate = xrpUsdRate(xrp?.usd, state.treasury.manualUsdPerXrp);
  const usd =
    rate && Number.isFinite(state.treasury.units)
      ? state.treasury.units * rate.usd
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
        description="Working balance and the claim ledger are typed by you and stored in this browser — not an XRPL proof. Live XRP/USD is optional. Robinhood XRP is a separate node holding and does not live in this Xaman principal."
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
            rate ? (
              <span className="flex flex-wrap items-center gap-2">
                <ProvenanceBadge value={rate.provenance} />
                XRP {formatUsd(rate.usd)} · {rate.label}
                {book.crypto.source && rate.provenance === "verified"
                  ? ` (${book.crypto.source})`
                  : ""}
              </span>
            ) : (
              "No live XRP print and no manual XRP/USD — USD left blank on purpose."
            )
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
        <h2 className="mb-1 text-lg">Ledger</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Edit any cell. Amount edits do not move working balance — type that
          separately so the books stay honest.
        </p>
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
                    <td>
                      <input
                        className="input font-mono text-xs"
                        type="date"
                        value={entry.date}
                        onChange={(event) =>
                          updateLedgerEntry(entry.id, { date: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="select capitalize"
                        value={entry.classification}
                        onChange={(event) =>
                          updateLedgerEntry(entry.id, {
                            classification: event.target.value as LedgerClassification,
                          })
                        }
                      >
                        {CLASSES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input font-mono"
                        inputMode="decimal"
                        key={`${entry.id}-amt-${entry.amount}`}
                        defaultValue={String(entry.amount)}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value) || value < 0) return;
                          updateLedgerEntry(entry.id, { amount: value });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="input font-mono"
                        inputMode="decimal"
                        key={`${entry.id}-fee-${entry.fee}`}
                        defaultValue={String(entry.fee)}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value) || value < 0) return;
                          updateLedgerEntry(entry.id, { fee: value });
                        }}
                      />
                    </td>
                    <td className="min-w-[12rem]">
                      <input
                        className="input"
                        value={entry.note}
                        onChange={(event) =>
                          updateLedgerEntry(entry.id, { note: event.target.value })
                        }
                      />
                      {entry.applyToBalance ? (
                        <span className="mt-1 block text-xs text-[color:var(--accent)]">
                          Applied to working balance on create — later edits do not re-move units. Adjust working balance by hand if needed.
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
  const [manualUsd, setManualUsd] = useState(
    state.treasury.manualUsdPerXrp === null
      ? ""
      : String(state.treasury.manualUsdPerXrp),
  );

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
      manualUsdPerXrp: parseOptionalNumber(manualUsd),
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
      <Field
        label="Manual XRP/USD (optional)"
        hint="Used for Est. USD only when no live print exists. Leave blank rather than guessing."
      >
        <input
          className="input font-mono"
          inputMode="decimal"
          value={manualUsd}
          onChange={(event) => setManualUsd(event.target.value)}
          placeholder="Leave blank"
        />
      </Field>
      <button className="btn btn-primary" type="submit">
        Save working balance
      </button>
    </form>
  );
}
