import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { headlineIsEmpty, type NodePart } from "@/lib/node-layout";

function backupParts(lines: readonly { label: string; value: string }[]): NodePart[] {
  const status = lines.find((line) => line.label === "Status")?.value ?? "";
  const last = lines.find((line) => line.label === "Last run")?.value ?? "";
  if (headlineIsEmpty(last) || headlineIsEmpty(status)) return ["missing"];
  if (status === "ok") return ["live"];
  return ["partial"];
}

export function BackupFloor({
  lines,
  updatedAt = null,
}: {
  lines: readonly { label: string; value: string }[];
  updatedAt?: string | null;
}) {
  return (
    <NodeLayout>
      <NodeHeader name="Backup" parts={backupParts(lines)} updatedAt={updatedAt} backHref="/n/build" />
      <NodeSections>
        <NodeSection kind="lists">
          <NodeGrid>
            {lines.map((line) =>
              headlineIsEmpty(line.value) ? (
                <EmptyCard key={line.label} span="list" label={line.label} />
              ) : (
                <StatCard key={line.label} span="list" label={line.label} value={line.value} />
              ),
            )}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
