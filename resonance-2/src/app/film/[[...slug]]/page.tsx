import { notFound } from "next/navigation";
import { FilmBoard, FilmLocked } from "@/components/film-episode";
import { OperatorShell } from "@/components/operator-shell";
import { filmLevel } from "@/lib/film-episode";
import { loadFilmSnapshot } from "@/lib/film-episode-load";
import { isPublicMode } from "@/lib/public-mode-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Episode 1 · Resonance 2.0",
};

export default async function FilmPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  if (!(await isPublicMode())) return <FilmLocked />;
  const loaded = await loadFilmSnapshot();
  const level = filmLevel(slug, loaded.snapshot);
  if (!level) notFound();
  return (
    <OperatorShell storageMessage={loaded.storageMessage}>
      <FilmBoard level={level} />
    </OperatorShell>
  );
}
