import { useId, useRef, useState } from 'react';
import { createRoomId, NAME_MAX, normalizeName, normalizeRoomId, ROOM_ID_MAX, validateName, validateRoomId } from '../../../shared/rooms.js';
import ThemeToggle from './ThemeToggle.jsx';

/** Name + room form. Validates with the same rules as the server and focuses the first problem. */
export default function JoinScreen({ initialRoom = '', initialName = '', onJoin, theme, onTheme, random }) {
  const [name, setName] = useState(initialName);
  const [room, setRoom] = useState(initialRoom);
  const [errors, setErrors] = useState({});
  const nameRef = useRef(null);
  const roomRef = useRef(null);
  const ids = { name: useId(), room: useId(), nameErr: useId(), roomErr: useId(), roomHelp: useId() };

  function submit(event) {
    event.preventDefault();
    const next = { name: validateName(name), room: validateRoomId(room) };
    setErrors(next);
    if (next.name) return nameRef.current?.focus();
    if (next.room) return roomRef.current?.focus();
    const cleanRoom = normalizeRoomId(room);
    const cleanName = normalizeName(name);
    setRoom(cleanRoom);
    onJoin({ room: cleanRoom, name: cleanName });
  }

  function newRoom() {
    setRoom(createRoomId(random));
    setErrors((e) => ({ ...e, room: null }));
  }

  return (
    <div className="join">
      <header className="join-top">
        <span className="wordmark">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          Code Collaborator
        </span>
        <ThemeToggle theme={theme} onToggle={onTheme} />
      </header>
      <main className="join-main" id="main">
        <section className="join-intro load-in" style={{ '--i': 0 }}>
          <h1>Write code together, in real time.</h1>
          <p className="lede">
            Open a room, send the link, and edit one file with live cursors. Edits merge without conflicts, and the
            room keeps its code when the server restarts.
          </p>
          <ul className="facts">
            <li><strong>Live cursors and names.</strong> See where each person is typing.</li>
            <li><strong>No lost edits.</strong> Yjs merges changes typed at the same moment.</li>
            <li><strong>Run it.</strong> JavaScript, Python, Java and C++, with the output shared.</li>
          </ul>
        </section>

        <form className="join-form panel load-in" style={{ '--i': 1 }} onSubmit={submit} noValidate>
          <h2>Join a room</h2>
          <div className="field">
            <label className="field-label" htmlFor={ids.name}>Your name</label>
            <input
              ref={nameRef}
              id={ids.name}
              name="name"
              className="input"
              autoComplete="nickname"
              maxLength={NAME_MAX + 8}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={errors.name ? ids.nameErr : undefined}
              placeholder="Asha…"
            />
            {errors.name && <p className="field-error" id={ids.nameErr}>{errors.name}</p>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor={ids.room}>Room</label>
            <div className="input-row">
              <input
                ref={roomRef}
                id={ids.room}
                name="room"
                className="input mono"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={ROOM_ID_MAX + 8}
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                aria-invalid={errors.room ? 'true' : undefined}
                aria-describedby={`${ids.roomHelp}${errors.room ? ` ${ids.roomErr}` : ''}`}
                placeholder="keen-heron-417…"
              />
              <button type="button" className="btn btn-ghost" onClick={newRoom}>New room</button>
            </div>
            <p className="field-help" id={ids.roomHelp}>Anyone with the room name can join and edit.</p>
            {errors.room && <p className="field-error" id={ids.roomErr}>{errors.room}</p>}
          </div>
          <button type="submit" className="btn btn-primary btn-block">Join room</button>
        </form>
      </main>
    </div>
  );
}
