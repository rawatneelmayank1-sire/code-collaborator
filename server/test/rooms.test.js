import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  createRoomId,
  normalizeName,
  normalizeRoomId,
  STARTER_CODE,
  validateName,
  validateRoomId,
} from '../../shared/rooms.js';
import { createFilePersistence, createMemoryPersistence, createSqlitePersistence } from '../src/persistence/index.js';
import { RoomManager } from '../src/rooms/RoomManager.js';

const quiet = { error() {}, warn() {} };
const hasSqlite = await import('node:sqlite').then(() => true, () => false);
const tmpDirs = [];
async function tmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('room and name validation', () => {
  it('accepts readable room names and normalises spacing and case', () => {
    expect(validateRoomId('keen-heron-417')).toBeNull();
    expect(normalizeRoomId('  Team Alpha  ')).toBe('team-alpha');
    expect(validateRoomId('Team Alpha')).toBeNull();
  });

  it('rejects empty, short, long and unsafe room names with a reason', () => {
    expect(validateRoomId('')).toMatch(/Enter a room name/);
    expect(validateRoomId('ab')).toMatch(/at least 3/);
    expect(validateRoomId('a'.repeat(49))).toMatch(/at most 48/);
    expect(validateRoomId('../etc/passwd')).toMatch(/letters, numbers and dashes/);
    expect(validateRoomId('-room')).toMatch(/starting and ending/);
  });

  it('cleans display names and limits their length', () => {
    expect(normalizeName('  Neel \n  Rawat ')).toBe('Neel Rawat');
    expect(validateName('')).toMatch(/Enter the name/);
    expect(validateName('x'.repeat(33))).toMatch(/at most 32/);
    expect(validateName('Asha')).toBeNull();
  });

  it('creates room ids that pass validation', () => {
    let seed = 0;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 50; i += 1) expect(validateRoomId(createRoomId(random))).toBeNull();
  });
});

describe('RoomManager', () => {
  it('starts a new room with starter code and JavaScript selected', async () => {
    const rooms = new RoomManager({ persistence: createMemoryPersistence(), logger: quiet });
    const room = await rooms.get('fresh-room');
    expect(room.code).toBe(STARTER_CODE.javascript);
    expect(room.language).toBe('javascript');
    await rooms.close();
  });

  it('shares one load between concurrent callers', async () => {
    const rooms = new RoomManager({ persistence: createMemoryPersistence(), logger: quiet });
    const [a, b] = await Promise.all([rooms.get('same-room'), rooms.get('same-room')]);
    expect(a).toBe(b);
    await rooms.close();
  });

  it('refuses invalid room ids', async () => {
    const rooms = new RoomManager({ persistence: createMemoryPersistence(), logger: quiet });
    await expect(rooms.get('../bad')).rejects.toThrow(/letters, numbers and dashes/);
    await rooms.close();
  });

  it('unloads an empty room after the idle time and saves it first', async () => {
    const persistence = createMemoryPersistence();
    const rooms = new RoomManager({ persistence, idleMs: 20, saveDebounceMs: 5, logger: quiet });
    const room = await rooms.get('idle-room');
    room.doc.getText('code').insert(0, 'x');
    rooms.release(room);
    await new Promise((r) => setTimeout(r, 80));
    expect(rooms.peek('idle-room')).toBeNull();
    const saved = new Y.Doc();
    Y.applyUpdate(saved, await persistence.load('idle-room'));
    expect(saved.getText('code').toString().startsWith('x')).toBe(true);
    await rooms.close();
  });
});

async function editThenRestart(makePersistence) {
  const first = new RoomManager({ persistence: await makePersistence(), saveDebounceMs: 5, logger: quiet });
  const room = await first.get('survivor-room');
  room.doc.transact(() => {
    const text = room.doc.getText('code');
    text.delete(0, text.length);
    text.insert(0, 'print("still here")\n');
    room.doc.getMap('meta').set('language', 'python');
  });
  await first.close();

  const second = new RoomManager({ persistence: await makePersistence(), logger: quiet });
  const again = await second.get('survivor-room');
  const result = { code: again.code, language: again.language };
  await second.close();
  return result;
}

describe('persistence survives a server restart', () => {
  it('memory adapter (same store, new manager)', async () => {
    const store = createMemoryPersistence();
    const shared = { ...store, close: async () => {} };
    expect(await editThenRestart(async () => shared)).toEqual({ code: 'print("still here")\n', language: 'python' });
  });

  it('file adapter', async () => {
    const dir = await tmp();
    expect(await editThenRestart(async () => createFilePersistence(dir))).toEqual({
      code: 'print("still here")\n',
      language: 'python',
    });
    const files = await fs.readdir(path.join(dir, 'rooms'));
    expect(files).toEqual(['survivor-room.ystate']);
  });

  it.skipIf(!hasSqlite)('sqlite adapter (node:sqlite)', async () => {
    const dir = await tmp();
    expect(await editThenRestart(() => createSqlitePersistence(dir))).toEqual({
      code: 'print("still here")\n',
      language: 'python',
    });
  });

  it('file adapter refuses ids that could escape the data folder', async () => {
    const files = createFilePersistence(await tmp());
    await expect(files.save('../../evil', new Uint8Array([1]))).rejects.toThrow(/invalid room id/);
  });
});
