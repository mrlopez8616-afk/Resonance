import Link from "next/link";
import { LessonsFloor } from "@/components/lessons-floor";
import { OperatorShell } from "@/components/operator-shell";
import { loadLessonPage } from "@/lib/lessons-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lessons · Resonance 2.0",
};

export default async function LessonsPage() {
  let page = null;
  let unavailable = false;
  try {
    page = await loadLessonPage();
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {page ? <LessonsFloor cards={page.cards} showSources={!page.publicMode} /> : null}
    </OperatorShell>
  );
}
