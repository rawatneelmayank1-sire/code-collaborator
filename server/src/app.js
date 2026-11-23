import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { LANGUAGES, normalizeRoomId, validateRoomId } from '../../shared/rooms.js';
import { RoomManager } from './rooms/RoomManager.js';
import { attachYjsSocket } from './rooms/yjsSocket.js';
import { createRunService, RunRequestError } from './runner/runService.js';

/**
 * Builds the HTTP + WebSocket server without listening, so tests can start it on a random port.
 * Dependencies are passed in: a persistence adapter and a runner.
 */
export function createServer({ config, persistence, runner, logger = console }) {
  const rooms = new RoomManager({
    persistence,
    saveDebounceMs: config.saveDebounceMs,
    idleMs: config.roomIdleMs,
    logger,
  });
  const runs = createRunService({ rooms, runner, runsPerMinute: config.runsPerMinute, logger });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, roomsOpen: rooms.rooms.size, persistence: persistence.kind, runner: runner.kind });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      languages: LANGUAGES.map(({ id, label }) => ({ id, label })),
      runner: { kind: runner.kind, enabled: runner.kind !== 'disabled', timeoutMs: config.runTimeoutMs },
    });
  });

  app.post('/api/rooms/:roomId/run', async (req, res) => {
    const roomId = req.params.roomId;
    const invalid = validateRoomId(roomId) || (normalizeRoomId(roomId) !== roomId ? 'Invalid room name.' : null);
    if (invalid) return res.status(400).json({ error: 'bad_room', message: invalid });
    try {
      const body = req.body ?? {};
      const result = await runs.run(roomId, { language: body.language, stdin: body.stdin ?? '', name: body.name });
      res.json(result);
    } catch (err) {
      if (err instanceof RunRequestError) return res.status(err.status).json({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'No such API route.' }));

  // In production one process serves the built client too.
  const index = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(index));
  }

  // Express 5 forwards rejected promises here.
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'The request body is not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'The request is too large.' });
    logger.error?.(err.stack ?? err.message);
    res.status(500).json({ error: 'internal', message: 'The server hit an unexpected problem.' });
  });

  const server = http.createServer(app);
  const wss = attachYjsSocket(server, rooms, {
    allowedOrigins: config.allowedOrigins,
    maxClientsPerRoom: config.maxClientsPerRoom,
    logger,
  });

  async function close() {
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    await rooms.close();
  }

  return { app, server, rooms, runs, close };
}
