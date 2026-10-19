import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { NOT_RECORDED, type SubmissionBoard } from "@/lib/fight-submission";
import { personSlug } from "@/lib/ufc332";

function caption(board: SubmissionBoard): string {
  const who = board.role === "opponent" ? `Opponent · ${board.name}` : board.name;
  const finish = [
    board.ko !== "n/a" ? `KO% ${board.ko}` : null,
    board.r1 !== "n/a" ? `R1 finishes ${board.r1}` : null,
  ].filter((part): part is string => Boolean(part));
  return finish.length ? `${who} · ${finish.join(" · ")}` : who;
}

/** Square faces for one fighter's submission lines. Missing figures read "not recorded". */
export function SubmissionTiles({ boards }: { boards: readonly SubmissionBoard[] }) {
  if (boards.length === 0) return null;
  return (
    <div className="submission-stats">
      {boards.map((board) => (
        <section
          key={`${board.role}:${board.name}`}
          aria-label={board.role === "opponent" ? `Opponent submission · ${board.name}` : `Submission · ${board.name}`}
        >
          <p className="log-kicker">{caption(board)}</p>
          <NodeFaceGrid label={`Submission stats for ${board.name}`}>
            {board.stats.map((stat) => (
              <NodeFace
                key={stat.label}
                face={{
                  id: `submission-${personSlug(board.name) || "fighter"}-${personSlug(stat.label)}`,
                  glyph: "fight-desk",
                  href: "",
                  name: stat.label,
                  headline: stat.value,
                  status: board.role === "opponent" ? "opponent" : board.name,
                  live: stat.recorded && stat.value !== NOT_RECORDED,
                  tone: "",
                }}
              />
            ))}
          </NodeFaceGrid>
        </section>
      ))}
    </div>
  );
}
