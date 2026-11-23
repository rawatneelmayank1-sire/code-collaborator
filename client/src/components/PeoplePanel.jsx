import CopyInviteButton from './CopyInviteButton.jsx';

/** Who is in the room, from Yjs awareness. Alone, it invites you to share the room. */
export default function PeoplePanel({ people, inviteUrl }) {
  const others = people.filter((p) => !p.isSelf);
  return (
    <section className="panel people" aria-labelledby="people-heading">
      <header className="panel-head">
        <h2 id="people-heading">In this room</h2>
        <span className="count" aria-label={`${people.length} ${people.length === 1 ? 'person' : 'people'}`}>{people.length}</span>
      </header>
      <ul className="people-list">
        {people.map((p) => (
          <li key={p.clientId} className="person" style={{ '--tint': p.color.tint, '--deep': p.color.deep }}>
            <span className="swatch" aria-hidden="true" />
            <span className="person-name" translate="no">{p.name}</span>
            {p.isSelf && <span className="person-meta">you</span>}
            {!p.isSelf && p.line !== null && <span className="person-meta">line {p.line}</span>}
          </li>
        ))}
      </ul>
      {others.length === 0 && (
        <div className="empty">
          <p>Only you are here. Send the invite link to code together; everyone edits the same file.</p>
          <CopyInviteButton url={inviteUrl} />
        </div>
      )}
    </section>
  );
}
