import { parseCalendarEvent } from "@/lib/calendar-event";
import {
  ensureSeededCalendarEnvelope,
  writeCalendarEventIntoEnvelope,
} from "@/lib/calendar-store-core";
import { parseBetPostBody, parseSettleBody, placeBet, settleBet } from "@/lib/bets";
import { BetWriteError } from "@/lib/bets";
import {
  applyStoredBetCorrections,
  backfillBetLeans,
  ensureSeededBetsEnvelope,
  replaceBet,
} from "@/lib/bets-store-core";
import {
  loadBetsEnvelope,
  loadCalendarEnvelope,
  saveBetsEnvelope,
  saveCalendarEnvelope,
} from "@/lib/pg/envelopes";
import { migrate } from "@/lib/pg/migrate";

export type ReplayFile = {
  bets?: unknown;
  settlements?: unknown;
  calendar?: unknown;
  calendarEntries?: unknown;
};

export type ReplayRowCounts = {
  read: number;
  inserted: number;
  updated: number;
  deduped: number;
  failed: number;
};

export type ReplayFailure = { domain: string; index: number; message: string };

export type ReplayReport = {
  dryRun: boolean;
  bets: ReplayRowCounts;
  settlements: ReplayRowCounts;
  calendar: ReplayRowCounts;
  failures: ReplayFailure[];
};

function counts(): ReplayRowCounts {
  return { read: 0, inserted: 0, updated: 0, deduped: 0, failed: 0 };
}

function asList(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Replay row failed.";
}

/**
 * Upsert outage rows into Postgres. Bets are idempotent on orderId.
 * The same settlement is a no-op. Calendar ids dedupe. Safe to re-run.
 * Does not delete stored rows.
 */
export async function replayOutage(
  file: ReplayFile,
  options: { dryRun?: boolean } = {},
): Promise<ReplayReport> {
  const dryRun = options.dryRun === true;
  await migrate();

  const report: ReplayReport = {
    dryRun,
    bets: counts(),
    settlements: counts(),
    calendar: counts(),
    failures: [],
  };

  const seededBets = ensureSeededBetsEnvelope(await loadBetsEnvelope());
  const leaned = backfillBetLeans(seededBets.envelope);
  const corrected = applyStoredBetCorrections(leaned.envelope);
  let betsEnvelope = corrected.envelope;
  let betsDirty = seededBets.seeded || leaned.changed || corrected.changed;

  const betRows = asList(file.bets);
  report.bets.read = betRows.length;
  for (const [index, row] of betRows.entries()) {
    try {
      const post = parseBetPostBody(row)[0];
      if (!post) throw new BetWriteError("Bet row was empty.");
      const written = placeBet(betsEnvelope.bets, post, betsEnvelope.updatedAt);
      if (written.deduped) report.bets.deduped += 1;
      else {
        report.bets.inserted += 1;
        betsEnvelope = {
          ...betsEnvelope,
          updatedAt: new Date().toISOString(),
          bets: written.bets,
        };
        betsDirty = true;
      }
    } catch (error) {
      report.bets.failed += 1;
      report.failures.push({ domain: "bets", index, message: messageOf(error) });
    }
  }

  const settlementRows = asList(file.settlements);
  report.settlements.read = settlementRows.length;
  for (const [index, row] of settlementRows.entries()) {
    try {
      const request = parseSettleBody(row)[0];
      if (!request) throw new BetWriteError("Settlement row was empty.");
      const current = betsEnvelope.bets.find((bet) => bet.id === request.id);
      if (!current) throw new BetWriteError(`Unknown bet id ${request.id}.`);
      const written = settleBet(current, request, new Date().toISOString());
      if (written.deduped) report.settlements.deduped += 1;
      else {
        report.settlements.inserted += 1;
        const now = written.bet.settledAt ?? new Date().toISOString();
        betsEnvelope = replaceBet(betsEnvelope, written.bet, now);
        betsDirty = true;
      }
    } catch (error) {
      report.settlements.failed += 1;
      report.failures.push({ domain: "settlements", index, message: messageOf(error) });
    }
  }

  const seededCalendar = ensureSeededCalendarEnvelope(await loadCalendarEnvelope());
  let calendarEnvelope = seededCalendar.envelope;
  let calendarDirty = seededCalendar.seeded;
  const calendarRows = asList(file.calendar ?? file.calendarEntries);
  report.calendar.read = calendarRows.length;
  for (const [index, row] of calendarRows.entries()) {
    try {
      const event = parseCalendarEvent(row);
      const written = writeCalendarEventIntoEnvelope(calendarEnvelope, event);
      if (written.deduped) report.calendar.deduped += 1;
      else if (written.updated) {
        report.calendar.updated += 1;
        calendarEnvelope = written.envelope;
        calendarDirty = true;
      } else {
        report.calendar.inserted += 1;
        calendarEnvelope = written.envelope;
        calendarDirty = true;
      }
    } catch (error) {
      report.calendar.failed += 1;
      report.failures.push({ domain: "calendar", index, message: messageOf(error) });
    }
  }

  if (!dryRun && betsDirty) {
    await saveBetsEnvelope(betsEnvelope, { settlementSource: "replay" });
  }
  if (!dryRun && calendarDirty) {
    await saveCalendarEnvelope(calendarEnvelope);
  }

  return report;
}
