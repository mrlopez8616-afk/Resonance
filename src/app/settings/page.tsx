"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HoldingsImportPanel } from "@/components/holdings-import";
import { PageHeader } from "@/components/page-header";
import { Field } from "@/components/ui";
import { useStore } from "@/context/store";
import { newId } from "@/lib/format";
import { lockAppGate } from "@/lib/lock-gate";
import type { Venue } from "@/lib/types";

export default function SettingsPage() {
  const { ready, epoch } = useStore();
  const [message, setMessage] = useState<string | null>(null);

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading settings…</p>
    );
  }

  return (
    <SettingsBody key={epoch} message={message} setMessage={setMessage} />
  );
}

function SettingsBody({
  message,
  setMessage,
}: {
  message: string | null;
  setMessage: (value: string | null) => void;
}) {
  const {
    state,
    updateTreasury,
    updateSettings,
    setVenues,
    resetToSeed,
    exportJson,
    importJson,
  } = useStore();
  const [operatorName, setOperatorName] = useState(state.settings.operatorName);
  const [priority, setPriority] = useState(state.settings.operatingPriority);
  const [address, setAddress] = useState(state.settings.xrplWatchAddress);
  const [youtube, setYoutube] = useState(state.settings.showYoutubeStub);
  const [venues, setLocalVenues] = useState<Venue[]>(state.venues);
  const [importText, setImportText] = useState("");
  const [gateRequired, setGateRequired] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gate")
      .then((response) => response.json())
      .then((body: { required?: boolean }) => {
        if (!cancelled) setGateRequired(Boolean(body.required));
      })
      .catch(() => {
        if (!cancelled) setGateRequired(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function saveIdentity(event: React.FormEvent) {
    event.preventDefault();
    updateSettings({
      operatorName: operatorName.trim() || state.settings.operatorName,
      operatingPriority: priority.trim(),
      xrplWatchAddress: address.trim(),
      showYoutubeStub: youtube,
    });
    setMessage("Settings saved locally.");
  }

  function saveVenues(event: React.FormEvent) {
    event.preventDefault();
    setVenues(
      venues.map((venue) => ({
        ...venue,
        name: venue.name.trim() || "Unnamed venue",
      })),
    );
    setMessage("Venues saved locally.");
  }

  function downloadExport() {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "resonance-phase-zero.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(event: React.FormEvent) {
    event.preventDefault();
    try {
      importJson(importText);
      setImportText("");
      setMessage("Imported local snapshot.");
    } catch {
      setMessage("Import failed. Paste a Resonance JSON export.");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Local"
        title="Settings"
        description="Operator defaults, venues, holdings snapshot import, and the session lock. Overnight seed is ~27,772 XRP founder-reported plus Main/Agentic sleeves. Books still live in this browser’s localStorage."
      />

      <div className="notice notice-warn mb-8">
        <p className="font-medium text-[color:var(--text)]">
          Never paste a seed phrase, secret key, or Xaman/MetaMask backup here.
        </p>
        <p className="mt-2">
          The XRPL field is for a future read-only public address watch. Treat
          it like a billboard: only strings you could publish. Resonance will
          not ask to sign, import a wallet, or send funds.
        </p>
      </div>

      {message ? (
        <p className="mb-6 text-sm text-[color:var(--accent)]">{message}</p>
      ) : null}

      <section className="card mb-8 space-y-3">
        <h2 className="text-lg">Session</h2>
        {gateRequired ? (
          <>
            <p className="text-sm text-[color:var(--muted)]">
              This browser is unlocked with an httpOnly cookie (about 14 days).
              Locking sends you back to the password screen. The password itself
              is not stored in the browser.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                void lockAppGate().then(() => {
                  router.push("/unlock");
                  router.refresh();
                });
              }}
            >
              Lock now
            </button>
          </>
        ) : (
          <p className="text-sm text-[color:var(--muted)]">
            App gate is off in this environment. Set{" "}
            <code className="font-mono text-xs">RESONANCE_APP_PASSWORD</code> on
            the server to require Unlock. Do not put the password in
            localStorage or a <code className="font-mono text-xs">NEXT_PUBLIC_</code>{" "}
            variable.
          </p>
        )}
      </section>

      <form className="card mb-8 space-y-4" onSubmit={saveIdentity}>
        <h2 className="text-lg">Operator</h2>
        <Field label="Name">
          <input
            className="input"
            value={operatorName}
            onChange={(event) => setOperatorName(event.target.value)}
          />
        </Field>
        <Field label="Operating priority">
          <textarea
            className="textarea"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          />
        </Field>
        <Field
          label="Public XRPL address (optional, stored only)"
          hint="r-address only. No secrets. Not watched yet."
        >
          <input
            className="input font-mono"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="r…"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm text-[color:var(--muted)]">
          <input
            type="checkbox"
            className="mt-1"
            checked={youtube}
            onChange={(event) => setYoutube(event.target.checked)}
          />
          Show YouTube earning-machine stub on Overview
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Treasury units default (XRP)">
            <input
              className="input font-mono"
              defaultValue={state.treasury.units}
              onBlur={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || value < 0) return;
                updateTreasury({
                  units: value,
                  provenance: "founder-reported",
                });
              }}
            />
          </Field>
          <Field label="~Daily reward default (XRP)">
            <input
              className="input font-mono"
              defaultValue={state.treasury.estimatedDailyReward}
              onBlur={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || value < 0) return;
                updateTreasury({
                  estimatedDailyReward: value,
                  provenance: "founder-reported",
                });
              }}
            />
          </Field>
        </div>
        <button className="btn btn-primary" type="submit">
          Save settings
        </button>
      </form>

      <form className="card mb-8 space-y-4" onSubmit={saveVenues}>
        <h2 className="text-lg">Venues</h2>
        <p className="text-sm text-[color:var(--muted)]">
          Seeded as Robinhood (fractional equities + small XRP bag), Coinbase
          (general), Xaman (treasury), MetaMask (Flare DeFi play — secondary).
        </p>
        <div className="space-y-4">
          {venues.map((venue, index) => (
            <div
              key={venue.id}
              className="grid gap-3 rounded-lg border border-[color:var(--border)] p-4 sm:grid-cols-2"
            >
              <Field label="Name">
                <input
                  className="input"
                  value={venue.name}
                  onChange={(event) => {
                    const next = [...venues];
                    next[index] = { ...venue, name: event.target.value };
                    setLocalVenues(next);
                  }}
                />
              </Field>
              <Field label="Role">
                <input
                  className="input"
                  value={venue.role}
                  onChange={(event) => {
                    const next = [...venues];
                    next[index] = { ...venue, role: event.target.value };
                    setLocalVenues(next);
                  }}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <textarea
                    className="textarea"
                    value={venue.notes}
                    onChange={(event) => {
                      const next = [...venues];
                      next[index] = { ...venue, notes: event.target.value };
                      setLocalVenues(next);
                    }}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setLocalVenues([
                ...venues,
                {
                  id: newId("venue"),
                  name: "",
                  role: "",
                  notes: "",
                },
              ])
            }
          >
            Add venue
          </button>
          <button className="btn btn-primary" type="submit">
            Save venues
          </button>
        </div>
      </form>

      <p className="mb-8 text-sm text-[color:var(--muted)]">
        Overnight walkthrough lives at{" "}
        <Link href="/whats-new" className="text-[color:var(--accent)]">
          /whats-new
        </Link>
        . Treasury trail JSON:{" "}
        <span className="font-mono text-xs">/examples/treasury-ledger.json</span>.
      </p>

      <HoldingsImportPanel onApplied={setMessage} />

      <section className="card mb-8 space-y-4">
        <h2 className="text-lg">Local snapshot</h2>
        <p className="text-sm text-[color:var(--muted)]">
          Export or import JSON. Reset restores founder-reported sample data.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={downloadExport}>
            Download JSON
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (
                window.confirm(
                  "Reset this browser’s Resonance data to the founder-reported seed?",
                )
              ) {
                resetToSeed();
                setMessage("Reset to seed data.");
              }
            }}
          >
            Reset to seed
          </button>
        </div>
        <form className="space-y-3" onSubmit={handleImport}>
          <Field label="Paste JSON to import">
            <textarea
              className="textarea min-h-32 font-mono text-xs"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
          </Field>
          <button className="btn btn-secondary" type="submit">
            Import
          </button>
        </form>
      </section>
    </div>
  );
}
