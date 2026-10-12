/** GPS run math. Distance is the sum of accepted fixes. Pace is time over that distance. */

export const METERS_PER_MILE = 1609.344;
export const EARTH_RADIUS_M = 6_371_000;
/** Fixes worse than this are dropped. */
export const FIX_ACCURACY_MAX_M = 30;
/** A jump faster than this is dropped. 7 m/s is about a 3:50 mile. */
export const FIX_SPEED_MAX_M_S = 7;
export const CURRENT_PACE_WINDOW_MS = 30_000;
export const RUN_DRAFT_KEY = "resonance.run.v1";
export const RUN_DRAFT_VERSION = 1;
export const MAX_TRACK_POINTS = 50_000;

export const GEO_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

export const RUN_TRACK_NOTE =
  "Keep the screen on and the app open. iOS stops GPS when the phone locks or the app is backgrounded. Distance is approximate.";

export const LOCATION_DENIED = "Location is off. Allow location for this site to record distance.";
export const LOCATION_MISSING = "This browser has no location.";
export const LOCATION_WAITING = "Waiting for a GPS fix.";
export const LOCATION_STOPPED = "Location stopped. The distance so far is still on this phone.";

export type GeoFix = {
  lat: number;
  lng: number;
  /** Meters. Null when the browser omitted accuracy. */
  accuracyM: number | null;
  timeMs: number;
};

export type TrackPoint = {
  lat: number;
  lng: number;
  timeMs: number;
  /** Resume or the first fix. Distance starts again here. */
  anchor?: boolean;
};

export type TrackState = {
  points: TrackPoint[];
  distanceM: number;
};

export const EMPTY_TRACK: TrackState = { points: [], distanceM: 0 };

export type RunPhase = "running" | "paused" | "stopped";

export type RunDraft = {
  version: 1;
  phase: RunPhase;
  /** Running time before the current segment, in milliseconds. */
  elapsedMs: number;
  segmentStartedAt: number | null;
  startedAt: string;
  track: TrackState;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when the jump is not faster than 7 m/s. A non-positive gap is dropped. */
export function segmentAllowed(meters: number, dtSec: number): boolean {
  if (!Number.isFinite(meters) || !Number.isFinite(dtSec) || dtSec <= 0 || meters < 0) return false;
  return meters / dtSec <= FIX_SPEED_MAX_M_S;
}

function usableFix(fix: GeoFix): boolean {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || !Number.isFinite(fix.timeMs)) return false;
  if (fix.lat < -90 || fix.lat > 90 || fix.lng < -180 || fix.lng > 180) return false;
  if (fix.accuracyM === null || !Number.isFinite(fix.accuracyM) || fix.accuracyM < 0) return false;
  return fix.accuracyM <= FIX_ACCURACY_MAX_M;
}

/**
 * Add one fix. A poor accuracy or a jump faster than 7 m/s leaves the track unchanged.
 * `anchor` starts a new segment and does not add the gap before it.
 */
export function appendFix(state: TrackState, fix: GeoFix, options?: { anchor?: boolean }): TrackState {
  if (!usableFix(fix)) return state;
  if (state.points.length >= MAX_TRACK_POINTS) return state;
  const last = state.points.at(-1);
  const anchor = !last || options?.anchor === true;
  if (!anchor && last) {
    const dtSec = (fix.timeMs - last.timeMs) / 1000;
    const meters = haversineMeters(last, fix);
    if (!segmentAllowed(meters, dtSec)) return state;
    return {
      points: [...state.points, { lat: fix.lat, lng: fix.lng, timeMs: fix.timeMs }],
      distanceM: state.distanceM + meters,
    };
  }
  return {
    points: [...state.points, { lat: fix.lat, lng: fix.lng, timeMs: fix.timeMs, anchor: true }],
    distanceM: state.distanceM,
  };
}

/** Rebuild distance from stored points. Anchors do not add the gap before them. */
export function replayTrack(points: readonly TrackPoint[]): TrackState {
  let state: TrackState = EMPTY_TRACK;
  for (const point of points) {
    const anchor = point.anchor === true && state.points.length > 0;
    state = appendFix(
      state,
      { lat: point.lat, lng: point.lng, accuracyM: 0, timeMs: point.timeMs },
      { anchor },
    );
  }
  return state;
}

export function milesFromMeters(meters: number): number | null {
  if (!Number.isFinite(meters) || meters < 0) return null;
  return meters / METERS_PER_MILE;
}

export function formatMilesReadout(meters: number): string | null {
  const miles = milesFromMeters(meters);
  if (miles === null) return null;
  return `${miles.toFixed(2)} mi`;
}

/** Seconds per mile. Null until both time and distance are real. */
export function averagePaceSecPerMile(distanceM: number, elapsedMs: number): number | null {
  if (!(distanceM > 0) || !(elapsedMs > 0)) return null;
  const miles = distanceM / METERS_PER_MILE;
  if (!(miles > 0)) return null;
  return elapsedMs / 1000 / miles;
}

/** Pace over the recent accepted fixes, after the latest anchor. Null when nothing moved. */
export function currentPaceSecPerMile(
  points: readonly TrackPoint[],
  windowMs = CURRENT_PACE_WINDOW_MS,
): number | null {
  let chainStart = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index]?.anchor) chainStart = index;
  }
  const chain = points.slice(chainStart);
  if (chain.length < 2) return null;
  const end = chain[chain.length - 1];
  if (!end) return null;
  let from = 0;
  const cutoff = end.timeMs - windowMs;
  while (from < chain.length - 2 && (chain[from + 1]?.timeMs ?? 0) <= cutoff) from += 1;
  const start = chain[from];
  if (!start) return null;
  let meters = 0;
  for (let index = from; index < chain.length - 1; index += 1) {
    const left = chain[index];
    const right = chain[index + 1];
    if (!left || !right) continue;
    meters += haversineMeters(left, right);
  }
  const sec = (end.timeMs - start.timeMs) / 1000;
  if (!(meters > 0) || !(sec > 0)) return null;
  return sec / (meters / METERS_PER_MILE);
}

export function formatMinPerMile(secPerMile: number | null): string | null {
  if (secPerMile === null || !Number.isFinite(secPerMile) || secPerMile <= 0) return null;
  const total = Math.round(secPerMile);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Whole seconds the clock shows. The stored duration uses this, so a 26.6s run stays 26s. */
export function elapsedSeconds(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const total = elapsedSeconds(ms);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function elapsedOf(
  draft: { phase: RunPhase; elapsedMs: number; segmentStartedAt: number | null },
  now: number,
): number {
  if (draft.phase === "running" && draft.segmentStartedAt !== null) {
    const extra = now - draft.segmentStartedAt;
    return draft.elapsedMs + (extra > 0 ? extra : 0);
  }
  return draft.elapsedMs;
}

export function startRun(now: number, startedAt: string): RunDraft {
  return {
    version: RUN_DRAFT_VERSION,
    phase: "running",
    elapsedMs: 0,
    segmentStartedAt: now,
    startedAt,
    track: EMPTY_TRACK,
  };
}

export function pauseRun(draft: RunDraft, now: number): RunDraft {
  if (draft.phase !== "running") return draft;
  return {
    ...draft,
    phase: "paused",
    elapsedMs: elapsedOf(draft, now),
    segmentStartedAt: null,
  };
}

export function resumeRun(draft: RunDraft, now: number): RunDraft {
  if (draft.phase !== "paused") return draft;
  return { ...draft, phase: "running", segmentStartedAt: now };
}

export function stopRun(draft: RunDraft, now: number): RunDraft {
  if (draft.phase !== "running" && draft.phase !== "paused") return draft;
  return {
    ...draft,
    phase: "stopped",
    elapsedMs: elapsedOf(draft, now),
    segmentStartedAt: null,
  };
}

/** Fold the open segment into elapsedMs so a crash does not keep a stale segment start. */
export function freezeDraft(draft: RunDraft, now: number): RunDraft {
  if (draft.phase !== "running") return draft;
  return { ...draft, elapsedMs: elapsedOf(draft, now), segmentStartedAt: now };
}

/** A restored running draft continues from the stored elapsed. The gap while the page was dead is not added. */
export function resumeDraft(draft: RunDraft, now: number): RunDraft {
  if (draft.phase !== "running") return { ...draft, segmentStartedAt: null };
  return { ...draft, segmentStartedAt: now };
}

const PHASES = new Set<RunPhase>(["running", "paused", "stopped"]);
const MAX_ELAPSED_MS = 48 * 60 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pointFrom(value: unknown): TrackPoint | null {
  const record = asRecord(value);
  if (!record) return null;
  const lat = record.lat;
  const lng = record.lng;
  const timeMs = record.timeMs;
  if (typeof lat !== "number" || typeof lng !== "number" || typeof timeMs !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(timeMs)) return null;
  return record.anchor === true ? { lat, lng, timeMs, anchor: true } : { lat, lng, timeMs };
}

/** A draft that does not replay to its stored distance is dropped. Nothing is filled in. */
export function parseDraft(raw: string | null): RunDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const record = asRecord(parsed);
  if (!record || record.version !== RUN_DRAFT_VERSION) return null;
  const phase = record.phase;
  if (typeof phase !== "string" || !PHASES.has(phase as RunPhase)) return null;
  const elapsedMs = record.elapsedMs;
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) {
    return null;
  }
  const startedAt = record.startedAt;
  if (typeof startedAt !== "string" || !Number.isFinite(Date.parse(startedAt))) return null;
  const segment = record.segmentStartedAt;
  if (segment !== null && (typeof segment !== "number" || !Number.isFinite(segment))) return null;
  const track = asRecord(record.track);
  if (!track || !Array.isArray(track.points) || typeof track.distanceM !== "number") return null;
  if (!Number.isFinite(track.distanceM) || track.distanceM < 0) return null;
  const points: TrackPoint[] = [];
  for (const item of track.points) {
    const point = pointFrom(item);
    if (!point) return null;
    points.push(point);
  }
  if (points.length === 0) {
    if (track.distanceM !== 0) return null;
    return {
      version: 1,
      phase: phase as RunPhase,
      elapsedMs,
      segmentStartedAt: segment,
      startedAt,
      track: EMPTY_TRACK,
    };
  }
  const replayed = replayTrack(points);
  if (Math.abs(replayed.distanceM - track.distanceM) > 1) return null;
  return {
    version: 1,
    phase: phase as RunPhase,
    elapsedMs,
    segmentStartedAt: segment,
    startedAt,
    track: replayed,
  };
}

export function parseRunSave(
  body: unknown,
): { ok: true; startedAt: string; durationSec: number; distanceM: number } | { ok: false; error: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "JSON body is required." };
  if (typeof record.startedAt !== "string" || !Number.isFinite(Date.parse(record.startedAt))) {
    return { ok: false, error: "Start time is missing." };
  }
  if (typeof record.durationSec !== "number" || !Number.isFinite(record.durationSec) || record.durationSec <= 0) {
    return { ok: false, error: "This run has no time to save." };
  }
  if (typeof record.distanceM !== "number" || !Number.isFinite(record.distanceM) || record.distanceM < 0) {
    return { ok: false, error: "Distance is too short to save." };
  }
  return {
    ok: true,
    startedAt: record.startedAt,
    durationSec: record.durationSec,
    distanceM: record.distanceM,
  };
}
