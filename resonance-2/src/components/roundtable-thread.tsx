import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import type { NodePart } from "@/lib/node-layout";
import { RoundtableReply } from "@/components/roundtable-reply";
import { ROUNDTABLE_EMPTY, ROUNDTABLE_HREF, type RoundtableThreadView } from "@/lib/roundtable";

export function RoundtableThread({ view, reply = true }: { view: RoundtableThreadView | null; reply?: boolean }) {
  if (!view) {
    return (
      <NodeLayout>
        <NodeHeader name="Thread" parts={["missing"]} backHref={ROUNDTABLE_HREF} />
        <NodeSections>
          <NodeSection kind="lists">
            <NodeGrid>
              <EmptyCard span="list" label={ROUNDTABLE_EMPTY} />
            </NodeGrid>
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    );
  }
  const parts: NodePart[] = view.messages.length > 0 ? ["live"] : ["missing"];
  return (
    <NodeLayout>
      <NodeHeader name={view.title} parts={parts} updatedAt={view.updatedAt} backHref={ROUNDTABLE_HREF} />
      <p className="node-note">
        {view.agentName} · {view.countLabel}
      </p>
      <NodeSections>
        <NodeSection kind="lists">
          {view.messages.length === 0 ? (
            <NodeGrid>
              <EmptyCard span="list" label={ROUNDTABLE_EMPTY} />
            </NodeGrid>
          ) : (
            <NodeGrid>
              {view.messages.map((message) => (
                <StatCard key={message.id} span="list" label={message.authorLabel} detail={message.when || null}>
                  <p className="roundtable-body">{message.body}</p>
                </StatCard>
              ))}
            </NodeGrid>
          )}
        </NodeSection>
      </NodeSections>
      {reply ? <RoundtableReply threadId={view.id} /> : null}
    </NodeLayout>
  );
}
