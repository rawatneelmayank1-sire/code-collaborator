import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { createServer } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryPersistence } from '../src/persistence/index.js';

const quiet = { error() {}, warn() {}, log() {} };
const open = [];

async function start({ persistence = createMemoryPersistence(), runner } = {}) {
  const config = { ...loadConfig({}), saveDebounceMs: 5, roomIdleMs: 50, staticDir: '/nonexistent' };
  const fakeRunner = runner ?? {
    kind: 'fake',
    async execute({ code }) {
      return { stage: 'run', stdout: `ran ${code.length} chars\n`, stderr: '', exitCode: 0, signal: null, durationMs: 3 };
    },
  };
  const srv = createServer({ config, persistence, runner: fakeRunner, logger: quiet });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  const { port } = srv.server.address();
  const handle = { ...srv, port, url: `ws://127.0.0.1:${port}/yjs`, persistence };
  open.push(handle);
  return handle;
}

function connect(srv, room, name) {
  const doc = new Y.Doc();
  // disableBc: otherwise two providers in one process would sync over BroadcastChannel and skip the server.
  const provider = new WebsocketProvider(srv.url, room, doc, { WebSocketPolyfill: WebSocket, disableBc: true });
  provider.awareness.setLocalStateField('user', { name, color: '#888888' });
  open.push({ close: async () => { provider.destroy(); doc.destroy(); } });
  return { doc, provider, text: doc.getText('code') };
}

const synced = (provider) => new Promise((resolve) => (provider.synced ? resolve() : provider.once('sync', (s) => s && resolve())));

async function until(check, timeout = 3_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error('condition not met in time');
}

afterEach(async () => {
  for (const h of open.splice(0).reverse()) await h.close();
});

describe('collaboration over WebSockets', () => {
  it('gives a new client the room starter code on first sync', async () => {
    const srv = await start();
    const a = connect(srv, 'pair-room', 'Asha');
    await synced(a.provider);
    expect(a.text.toString()).toMatch(/greet/);
  });

  it('merges edits typed at the same moment by two people without losing either', async () => {
    const srv = await start();
    const a = connect(srv, 'pair-room', 'Asha');
    const b = connect(srv, 'pair-room', 'Ravi');
    await Promise.all([synced(a.provider), synced(b.provider)]);

    // Both type before either has seen the other's change.
    a.text.insert(0, '// Asha was here\n');
    b.text.insert(b.text.length, '// Ravi was here\n');

    await until(() => a.text.toString() === b.text.toString() && a.text.toString().includes('Ravi') && a.text.toString().includes('Asha'));
    const room = srv.rooms.peek('pair-room');
    await until(() => room.code === a.text.toString());
    expect(room.code.startsWith('// Asha was here')).toBe(true);
    expect(room.code.endsWith('// Ravi was here\n')).toBe(true);
  });

  it('shares who is in the room and removes people who leave', async () => {
    const srv = await start();
    const a = connect(srv, 'presence-room', 'Asha');
    const b = connect(srv, 'presence-room', 'Ravi');
    await Promise.all([synced(a.provider), synced(b.provider)]);
    const names = () => [...a.provider.awareness.getStates().values()].map((s) => s.user?.name).filter(Boolean).sort();
    await until(() => names().join() === 'Asha,Ravi');
    b.provider.destroy();
    await until(() => names().join() === 'Asha');
  });

  it('keeps the document after every client leaves and the server restarts', async () => {
    const persistence = createMemoryPersistence();
    const keep = { ...persistence, close: async () => {} };
    const first = await start({ persistence: keep });
    const a = connect(first, 'durable-room', 'Asha');
    await synced(a.provider);
    a.text.delete(0, a.text.length);
    a.text.insert(0, 'print("survives restarts")\n');
    await until(() => first.rooms.peek('durable-room')?.code === 'print("survives restarts")\n');
    a.provider.destroy();
    await first.close();
    open.splice(open.indexOf(first), 1);

    const second = await start({ persistence: keep });
    const b = connect(second, 'durable-room', 'Ravi');
    await synced(b.provider);
    expect(b.text.toString()).toBe('print("survives restarts")\n');
  });

  it('closes connections to invalid room names with a specific code', async () => {
    const srv = await start();
    const code = await new Promise((resolve) => {
      const ws = new WebSocket(`${srv.url}/Not%20Valid!`);
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4400);
  });

  it('runs the shared code over HTTP and every participant sees the output', async () => {
    const srv = await start();
    const a = connect(srv, 'run-room', 'Asha');
    const b = connect(srv, 'run-room', 'Ravi');
    await Promise.all([synced(a.provider), synced(b.provider)]);
    const res = await request(srv.server).post('/api/rooms/run-room/run').send({ language: 'javascript', name: 'Asha', stdin: '' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    const runMap = b.doc.getMap('run');
    await until(() => runMap.get('status') === 'done');
    expect(runMap.get('stdout')).toMatch(/^ran \d+ chars/);
    expect(runMap.get('by')).toBe('Asha');
  });

  it('answers run requests for rooms nobody has open with 404, and bad JSON with 400', async () => {
    const srv = await start();
    const res = await request(srv.server).post('/api/rooms/empty-room/run').send({ language: 'javascript', name: 'Asha' });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Join the room/);
    const bad = await request(srv.server).post('/api/rooms/empty-room/run').set('content-type', 'application/json').send('{"oops"');
    expect(bad.status).toBe(400);
    const badRoom = await request(srv.server).post('/api/rooms/BAD%20ROOM/run').send({});
    expect(badRoom.status).toBe(400);
  });

  it('reports health and config', async () => {
    const srv = await start();
    const health = await request(srv.server).get('/api/health');
    expect(health.body).toMatchObject({ ok: true, persistence: 'memory', runner: 'fake' });
    const config = await request(srv.server).get('/api/config');
    expect(config.body.languages.map((l) => l.id)).toEqual(['javascript', 'python', 'java', 'cpp']);
  });
});
