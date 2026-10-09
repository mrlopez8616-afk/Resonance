import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildSectionBody } from "@/components/build-floor";
import { OperatorShell } from "@/components/operator-shell";
import { buildSectionLabel, resolveBuildSection } from "@/lib/build-tracker";
import { loadBuildView } from "@/lib/build-store";
import { loadLessonLinks } from "@/lib/lessons-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const label = buildSectionLabel(section.trim().toLowerCase());
  return { title: `${label} · Build · Resonance 2.0` };
}

export default async function BuildSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: slug } = await params;
  let view = null;
  let lessonHrefs: Record<string, string> = {};
  let unavailable = false;
  try {
    [view, lessonHrefs] = await Promise.all([
      loadBuildView(),
      loadLessonLinks().catch((error: unknown) => {
        if (!isStorageUnavailable(error)) throw error;
        return {};
      }),
    ]);
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  if (!view) {
    return (
      <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
        <Link href="/n/build" className="calendar-back">
          Build
        </Link>
      </OperatorShell>
    );
  }

  const section = resolveBuildSection(slug, view.items);
  if (!section) notFound();

  return (
    <OperatorShell>
      <Link href="/n/build" className="calendar-back">
        Build
      </Link>
      <BuildSectionBody section={section} now={new Date()} lessonHrefs={lessonHrefs} />
    </OperatorShell>
  );
}
