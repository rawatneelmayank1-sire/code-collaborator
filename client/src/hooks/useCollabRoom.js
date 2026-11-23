import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { DEFAULT_LANGUAGE, STARTER_CODE } from '../../../shared/rooms.js';
import { wsBase } from '../lib/env.js';
import { colorFor, listPeople } from '../lib/people.js';

// Close codes sent by the server (server/src/rooms/yjsSocket.js) and what to tell the person.
const REJECTIONS = {
  4400: 'This room name is not valid. Go back and pick another one.',
  4401: 'Your display name was refused. Go back and use a shorter name without special characters.',
  4403: 'This server does not accept connections from this site. Check CLIENT_ORIGIN on the server.',
  4429: 'This room is full. Ask someone to leave, or open a new room.',
};

/**
 * Owns the Yjs document and WebSocket provider for one room and exposes its live state:
 *   status: 'connecting' | 'live' | 'reconnecting' | 'offline' | 'rejected'
 */
export function useCollabRoom(roomId, name) {
  // The session is created inside an effect (not during render) so StrictMode's double mount
  // destroys and recreates it cleanly instead of reusing a destroyed provider.
  const [session, setSession] = useState(null);
  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(wsBase(), roomId, doc, { maxBackoffTime: 5000 });
    provider.awareness.setLocalStateField('user', { name, color: colorFor(doc.clientID) });
    setSession({ doc, provider });
    return () => {
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, name]);
  const doc = session?.doc ?? null;
  const provider = session?.provider ?? null;

  const [status, setStatus] = useState('connecting');
  const [rejection, setRejection] = useState(null);
  const [synced, setSynced] = useState(false);
  const [people, setPeople] = useState([]);
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [run, setRun] = useState({});

  useEffect(() => {
    if (!doc || !provider) return undefined;
    let everLive = false;
    const meta = doc.getMap('meta');
    const runMap = doc.getMap('run');
    const awareness = provider.awareness;

    const onStatus = ({ status: s }) => {
      if (s === 'connected') {
        everLive = true;
        setStatus('live');
      } else if (!navigator.onLine) setStatus('offline');
      else setStatus(everLive ? 'reconnecting' : 'connecting');
    };
    const onClose = (event) => {
      const message = event && REJECTIONS[event.code];
      if (message) {
        setRejection(message);
        setStatus('rejected');
        provider.shouldConnect = false;
      }
    };
    const onSync = (isSynced) => setSynced(isSynced);
    const onAwareness = () => setPeople(listPeople(awareness.getStates(), doc.clientID));
    const onMeta = () => setLanguageState(meta.get('language') ?? DEFAULT_LANGUAGE);
    const onRun = () => setRun(runMap.toJSON());
    const onOffline = () => setStatus('offline');
    const onOnline = () => setStatus(everLive ? 'reconnecting' : 'connecting');

    provider.on('status', onStatus);
    provider.on('connection-close', onClose);
    provider.on('sync', onSync);
    awareness.on('change', onAwareness);
    meta.observe(onMeta);
    runMap.observe(onRun);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    onAwareness();
    onMeta();
    onRun();
    if (provider.wsconnected) onStatus({ status: 'connected' });

    return () => {
      provider.off('status', onStatus);
      provider.off('connection-close', onClose);
      provider.off('sync', onSync);
      awareness.off('change', onAwareness);
      meta.unobserve(onMeta);
      runMap.unobserve(onRun);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [doc, provider]);

  /** Switches the room's language. Untouched starter code is swapped for the new language's starter. */
  function setLanguage(next) {
    if (!doc) return;
    const text = doc.getText('code');
    const current = text.toString();
    const isStarter = !current.trim() || Object.values(STARTER_CODE).includes(current);
    doc.transact(() => {
      doc.getMap('meta').set('language', next);
      if (isStarter && STARTER_CODE[next]) {
        text.delete(0, text.length);
        text.insert(0, STARTER_CODE[next]);
      }
    });
  }

  return { doc, provider, awareness: provider?.awareness ?? null, status, rejection, synced, people, language, setLanguage, run };
}
