import { lazy, Suspense, useMemo, useState } from 'react';
import { useCollabRoom } from '../hooks/useCollabRoom.js';
import { runCode } from '../lib/api.js';
import { cursorCss } from '../lib/people.js';
import OutputPanel from './OutputPanel.jsx';
import PeoplePanel from './PeoplePanel.jsx';
import RoomBar from './RoomBar.jsx';

// Monaco is large; load it after the room shell has painted.
const CodeEditor = lazy(() => import('./CodeEditor.jsx'));

export default function RoomScreen({ roomId, name, theme, onTheme, onLeave }) {
  const room = useCollabRoom(roomId, name);
  const [stdin, setStdin] = useState('');
  const [localError, setLocalError] = useState(null);
  const [starting, setStarting] = useState(false);

  const inviteUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.search = `?room=${encodeURIComponent(roomId)}`;
    url.hash = '';
    return url.toString();
  }, [roomId]);

  const running = starting || room.run?.status === 'running';
  const runBlocked = room.status !== 'live';

  async function handleRun() {
    if (running) return;
    if (runBlocked) {
      setLocalError('Run needs a live connection. Wait for the status to show Live, then run again.');
      return;
    }
    setLocalError(null);
    setStarting(true);
    const res = await runCode(roomId, { language: room.language, stdin, name });
    setStarting(false);
    if (!res.ok) setLocalError(res.message);
  }

  if (room.status === 'rejected') {
    return (
      <main className="center-message" id="main">
        <h1>Could not open this room</h1>
        <p>{room.rejection}</p>
        <button type="button" className="btn btn-primary" onClick={onLeave}>Back to rooms</button>
      </main>
    );
  }

  return (
    <div className="room">
      <a className="skip-link" href="#editor">Skip to the editor</a>
      <style>{cursorCss(room.people)}</style>
      <RoomBar
        roomId={roomId}
        inviteUrl={inviteUrl}
        status={room.status}
        language={room.language}
        onLanguage={room.setLanguage}
        onRun={handleRun}
        running={running}
        runBlocked={runBlocked}
        theme={theme}
        onTheme={onTheme}
        onLeave={onLeave}
      />
      <main className="room-body" id="main">
        <section className="editor-frame load-in" style={{ '--i': 1 }} id="editor" aria-label="Shared editor">
          {!room.synced && (
            <p className="editor-loading" role="status">
              {room.status === 'reconnecting' ? 'Reconnecting… your edits are kept.' : 'Loading the shared file…'}
            </p>
          )}
          <Suspense fallback={<p className="editor-loading">Loading the editor…</p>}>
            {room.doc && <CodeEditor doc={room.doc} awareness={room.awareness} language={room.language} theme={theme} onRun={handleRun} />}
          </Suspense>
        </section>
        <div className="output-slot load-in" style={{ '--i': 2 }}>
          <OutputPanel run={room.run} localError={localError} />
        </div>
        <aside className="rail load-in" style={{ '--i': 3 }} aria-label="Room details">
          <PeoplePanel people={room.people} inviteUrl={inviteUrl} />
          <section className="panel stdin" aria-labelledby="stdin-heading">
            <header className="panel-head">
              <h2 id="stdin-heading">Program input</h2>
            </header>
            <label className="field-label" htmlFor="stdin">Sent to standard input when you run</label>
            <textarea
              id="stdin"
              className="textarea"
              rows={4}
              value={stdin}
              spellCheck={false}
              autoComplete="off"
              placeholder="One value per line…"
              onChange={(e) => setStdin(e.target.value)}
            />
          </section>
        </aside>
      </main>
    </div>
  );
}
