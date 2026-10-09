import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildSectionBody } from "@/components/build-floor";
import { OperatorShell } from "@/components/operator-shell";
import { buildSectionLabel, resolveBuildSection } from "@/lib/build-tracker";
import { loadBuildView } from "@/lib/build-store";
import { loadLessonLinks } from "@/lib/lessons-store";
import { stripMoneyText } from "@/lib/public-mode";
import { isPublicMode } from "@/lib/public-mode-server";
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
  const pub = await isPublicMode();
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

  const resolved = resolveBuildSection(slug, view.items);
  if (!resolved) notFound();
  const section = pub
    ? {
        ...resolved,
        items: resolved.items.map((item) => ({
          ...item,
          title: stripMoneyText(item.title),
          nextStep: item.nextStep ? stripMoneyText(item.nextStep) : item.nextStep,
        })),
      }
    : resolved;

  return (
    <OperatorShell>
      <Link href="/n/build" className="calendar-back">
        Build
      </Link>
      <BuildSectionBody section={section} now={new Date()} showPr={!pub} lessonHrefs={lessonHrefs} />
    </OperatorShell>
  );
}
