import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOM_ID_PATTERN } from '../../../shared/rooms.js';

/**
 * A persistence adapter stores one Yjs snapshot (Y.encodeStateAsUpdate) per room.
 *   load(roomId)          -> Uint8Array | null
 *   save(roomId, state)   -> void
 *   close()               -> void
 * Snapshots are full document states, so loading one is enough to rebuild the room.
 */

function assertRoomId(roomId) {
  if (!ROOM_ID_PATTERN.test(roomId)) throw new Error(`Refusing to persist invalid room id "${roomId}"`);
}

export function createMemoryPersistence() {
  const store = new Map();
  return {
    kind: 'memory',
    async load(roomId) {
      const state = store.get(roomId);
      return state ? new Uint8Array(state) : null;
    },
    async save(roomId, state) {
      assertRoomId(roomId);
      store.set(roomId, new Uint8Array(state));
    },
    async close() {},
    /** Test helper. */
    size: () => store.size,
  };
}

/** One file per room under DATA_DIR/rooms. Writes go to a temp file first, then rename, so a crash never leaves half a snapshot. */
export function createFilePersistence(dataDir) {
  const dir = path.join(dataDir, 'rooms');
  const ready = fs.mkdir(dir, { recursive: true });
  const fileFor = (roomId) => path.join(dir, `${roomId}.ystate`);
  return {
    kind: 'file',
    async load(roomId) {
      assertRoomId(roomId);
      await ready;
      try {
        return new Uint8Array(await fs.readFile(fileFor(roomId)));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async save(roomId, state) {
      assertRoomId(roomId);
      await ready;
      const target = fileFor(roomId);
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, state);
      await fs.rename(tmp, target);
    },
    async close() {},
  };
}

/** SQLite through Node's built-in node:sqlite (Node 22.13+), so there is no native module to compile. */
export async function createSqlitePersistence(dataDir) {
  const { DatabaseSync } = await import('node:sqlite');
  await fs.mkdir(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'rooms.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    state BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  const select = db.prepare('SELECT state FROM rooms WHERE id = ?');
  const upsert = db.prepare(`INSERT INTO rooms (id, state, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`);
  return {
    kind: 'sqlite',
    async load(roomId) {
      assertRoomId(roomId);
      const row = select.get(roomId);
      return row ? new Uint8Array(row.state) : null;
    },
    async save(roomId, state) {
      assertRoomId(roomId);
      upsert.run(roomId, state, Date.now());
    },
    async close() {
      db.close();
    },
  };
}

export async function createPersistence(kind, dataDir) {
  switch (kind) {
    case 'memory':
      return createMemoryPersistence();
    case 'sqlite':
      return createSqlitePersistence(dataDir);
    case 'file':
      return createFilePersistence(dataDir);
    default:
      throw new Error(`Unknown PERSISTENCE "${kind}". Use file, sqlite or memory.`);
  }
}
