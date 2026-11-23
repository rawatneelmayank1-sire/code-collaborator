// Participant colours: used only for people (cursor, selection, name label, list swatch).
// `tint` sits on the dark theme with dark text; `deep` sits on the light theme with white text.
export const PEOPLE_COLORS = [
  { tint: '#7fb8f0', deep: '#1f5f9e' },
  { tint: '#f59a9a', deep: '#a63a3a' },
  { tint: '#8fd18a', deep: '#2f6b2b' },
  { tint: '#c6a2f2', deep: '#6b3fa8' },
  { tint: '#6ccfc1', deep: '#1c6b62' },
  { tint: '#f2a3cc', deep: '#9c3570' },
  { tint: '#a9b6ff', deep: '#3f4db3' },
  { tint: '#d8c39a', deep: '#6e5a2e' },
];

export function colorFor(clientId) {
  return PEOPLE_COLORS[Math.abs(Number(clientId) || 0) % PEOPLE_COLORS.length];
}

/** Turns awareness states into a stable, sorted list: you first, then by name. */
export function listPeople(states, selfId) {
  const people = [];
  for (const [clientId, state] of states) {
    const user = state?.user;
    if (!user?.name) continue;
    people.push({
      clientId,
      name: user.name,
      color: user.color ?? colorFor(clientId),
      line: state.cursor?.line ?? null,
      isSelf: clientId === selfId,
    });
  }
  return people.sort((a, b) => (a.isSelf === b.isSelf ? a.name.localeCompare(b.name) : a.isSelf ? -1 : 1));
}

/** CSS for remote cursors drawn by y-monaco (classes yRemoteSelection-<id> and yRemoteSelectionHead-<id>). */
export function cursorCss(people) {
  return people
    .filter((p) => !p.isSelf)
    .map(({ clientId, name, color }) => {
      const label = JSON.stringify(name);
      return `
.yRemoteSelection-${clientId} { background-color: color-mix(in srgb, var(--pc-${clientId}) 28%, transparent); }
.yRemoteSelectionHead-${clientId} { --pc: var(--pc-${clientId}); }
.yRemoteSelectionHead-${clientId}::after { content: ${label}; }
:root { --pc-${clientId}: ${color.deep}; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --pc-${clientId}: ${color.tint}; } }
:root[data-theme="dark"] { --pc-${clientId}: ${color.tint}; }`;
    })
    .join('\n');
}
