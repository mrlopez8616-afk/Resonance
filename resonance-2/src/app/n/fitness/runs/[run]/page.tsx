import { notFound } from "next/navigation";
import { RunDetailMirror } from "@/components/fitness-floor";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { workoutUpdatedAt } from "@/lib/fitness-layout";
import { buildRunDetail } from "@/lib/fitness-present";
import { nrcRunsAsWrites } from "@/lib/fitness-nrc";
import { loadFitnessBundle } from "@/lib/fitness-store";
import { shortcutWorkoutsAsWrites } from "@/lib/fitness-workouts";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { isPublicMode } from "@/lib/public-mode-server";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Run · Fitness · Resonance 2.0" };
}

export default async function RunDetailPage({ params }: { params: Promise<{ run: string }> }) {
  const { run: runId } = await params;
  await requireRole("owner");
  const [floor, bundle, publicMode] = await Promise.all([
    loadOperatorFloor(),
    loadFitnessBundle(),
    isPublicMode(),
  ]);
  const workouts = [
    ...bundle.workouts,
    ...shortcutWorkoutsAsWrites(bundle.shortcutWorkouts),
    ...nrcRunsAsWrites(bundle.nrcRuns),
  ];
  const runKey = decodeURIComponent(runId);
  const detail = buildRunDetail({
    workouts,
    today: bundle.today,
    id: runKey,
    publicMode,
  });
  if (!detail) notFound();
  const workout = workouts.find((row) => `${row.source}:${row.externalId}` === runKey) ?? null;
  return (
    <OperatorShell
      storageMessage={
        floor.storageMessage ?? (bundle.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
      }
      storageDetail={floor.storageDetail}
    >
      <div className="fitness-floor">
        <RunDetailMirror
          detail={detail}
          publicMode={publicMode}
          updatedAt={workoutUpdatedAt(workout)}
          backHref="/n/fitness#activity"
        />
      </div>
    </OperatorShell>
  );
}
