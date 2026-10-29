import { RoundtableReply } from "@/components/roundtable-reply";
import { ROUNDTABLE_EMPTY, type RoundtableThreadView } from "@/lib/roundtable";

export function RoundtableThread({ view, reply = true }: { view: RoundtableThreadView; reply?: boolean }) {
  return (
    <div className="roundtable-thread">
      <header className="log-header">
        <p className="log-kicker">{view.agentName}</p>
        <h2 className="log-title">{view.title}</h2>
        <p className="log-meta">{view.countLabel}</p>
      </header>
      {view.messages.length === 0 ? (
        <p className="parent-empty" role="status">
          {ROUNDTABLE_EMPTY}
        </p>
      ) : (
        <ol className="control-list">
          {view.messages.map((message) => (
            <li key={message.id} className="control-row">
              <div>
                <p className="control-name">{message.authorLabel}</p>
                <p className="roundtable-body">{message.body}</p>
                {message.when ? <p className="control-meta">{message.when}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {reply ? <RoundtableReply threadId={view.id} /> : null}
    </div>
  );
}
