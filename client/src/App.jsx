import { useEffect, useState } from 'react';
import { normalizeName, normalizeRoomId, validateName, validateRoomId } from '../../shared/rooms.js';
import JoinScreen from './components/JoinScreen.jsx';
import RoomScreen from './components/RoomScreen.jsx';
import { useTheme } from './hooks/useTheme.js';
import { readPref, writePref } from './lib/storage.js';

function roomFromUrl() {
  const room = normalizeRoomId(new URLSearchParams(window.location.search).get('room') ?? '');
  return room && !validateRoomId(room) ? room : '';
}

/** Two screens: the join form, and the room. The room name lives in ?room= so links can be shared. */
export default function App() {
  const { effective: theme, toggle } = useTheme();
  const [linkRoom] = useState(roomFromUrl);
  // ?room=<id>&name=<name> joins straight away (handy for demos and scripted checks).
  const [session, setSession] = useState(() => {
    const name = normalizeName(new URLSearchParams(window.location.search).get('name') ?? '');
    return linkRoom && name && !validateName(name) ? { room: linkRoom, name } : null;
  });

  useEffect(() => {
    const onPop = () => {
      if (!new URLSearchParams(window.location.search).get('room')) setSession(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function join({ room, name }) {
    writePref('cc-name', name);
    const url = new URL(window.location.href);
    url.searchParams.set('room', room);
    window.history.pushState(null, '', url);
    document.title = `${room} | Code Collaborator`;
    setSession({ room, name });
  }

  function leave(event) {
    event?.preventDefault?.();
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('name');
    window.history.pushState(null, '', url);
    document.title = 'Code Collaborator';
    setSession(null);
  }

  if (session) {
    return <RoomScreen key={`${session.room}:${session.name}`} roomId={session.room} name={session.name} theme={theme} onTheme={toggle} onLeave={leave} />;
  }
  return <JoinScreen initialRoom={linkRoom} initialName={readPref('cc-name', '')} onJoin={join} theme={theme} onTheme={toggle} />;
}
