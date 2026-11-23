import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { DEFAULT_LANGUAGE, STARTER_CODE, validateRoomId } from '../../../shared/rooms.js';

/**
 * Keeps one Y.Doc per active room, loads it from persistence on first use, saves it (debounced) after
 * every change, and unloads it a while after the last person leaves. The document layout is:
 *   doc.getText('code')  the shared source file
 *   doc.getMap('meta')   { language }
 *   doc.getMap('run')    the latest run result, written by the server so everyone sees the same output
 */
export class Room {
  constructor(id, doc) {
    this.id = id;
    this.doc = doc;
    this.awareness = new awarenessProtocol.Awareness(doc);
    // The server is not a participant; drop its own (empty) awareness state.
    this.awareness.setLocalState(null);
    /** @type {Map<object, Set<number>>} connection -> awareness client ids it controls */
    this.conns = new Map();
    this.running = null;
  }

  get code() {
    return this.doc.getText('code').toString();
  }

  get language() {
    return this.doc.getMap('meta').get('language') ?? DEFAULT_LANGUAGE;
  }

  /** Names of the people currently connected (from awareness). */
  participants() {
    const people = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      if (state?.user?.name) people.push({ clientId, name: state.user.name });
    }
    return people;
  }
}

export class RoomManager {
  constructor({ persistence, saveDebounceMs = 750, idleMs = 30_000, logger = console } = {}) {
    if (!persistence) throw new Error('RoomManager needs a persistence adapter');
    this.persistence = persistence;
    this.saveDebounceMs = saveDebounceMs;
    this.idleMs = idleMs;
    this.logger = logger;
    /** @type {Map<string, Promise<Room>>} */
    this.loading = new Map();
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    this.saveTimers = new Map();
    this.idleTimers = new Map();
    this.pendingSaves = new Set();
  }

  /** Returns the live room, loading or creating it. Concurrent callers share one load. */
  async get(roomId) {
    const error = validateRoomId(roomId);
    if (error) throw Object.assign(new Error(error), { status: 400 });
    const live = this.rooms.get(roomId);
    if (live?.unloading) {
      // Someone joined while the room was being saved and unloaded: wait, then load it fresh.
      await live.unloading;
      return this.get(roomId);
    }
    if (live) {
      this.cancelIdle(roomId);
      return live;
    }
    if (!this.loading.has(roomId)) {
      this.loading.set(roomId, this.load(roomId).finally(() => this.loading.delete(roomId)));
    }
    return this.loading.get(roomId);
  }

  /** The room if it is in memory right now, without loading it. */
  peek(roomId) {
    return this.rooms.get(roomId) ?? null;
  }

  async load(roomId) {
    const doc = new Y.Doc({ gc: true });
    const saved = await this.persistence.load(roomId);
    if (saved && saved.byteLength > 0) {
      Y.applyUpdate(doc, saved, 'persistence');
    } else {
      // A brand-new room starts with a small program so the first visitor sees what the editor does.
      doc.transact(() => {
        doc.getMap('meta').set('language', DEFAULT_LANGUAGE);
        doc.getText('code').insert(0, STARTER_CODE[DEFAULT_LANGUAGE]);
      }, 'init');
    }
    const room = new Room(roomId, doc);
    doc.on('update', (_update, origin) => {
      if (origin !== 'persistence') this.scheduleSave(room);
    });
    if (!saved) this.scheduleSave(room);
    this.rooms.set(roomId, room);
    return room;
  }

  scheduleSave(room) {
    clearTimeout(this.saveTimers.get(room.id));
    this.saveTimers.set(
      room.id,
      setTimeout(() => {
        this.saveTimers.delete(room.id);
        this.track(this.save(room));
      }, this.saveDebounceMs),
    );
  }

  track(promise) {
    this.pendingSaves.add(promise);
    promise.finally(() => this.pendingSaves.delete(promise));
    return promise;
  }

  async save(room) {
    try {
      await this.persistence.save(room.id, Y.encodeStateAsUpdate(room.doc));
    } catch (err) {
      this.logger.error?.(`Could not save room ${room.id}: ${err.message}`);
    }
  }

  /** Called when a connection leaves; unloads the room after idleMs with nobody in it. */
  release(room) {
    if (room.conns.size > 0) return;
    this.cancelIdle(room.id);
    this.idleTimers.set(
      room.id,
      setTimeout(() => {
        this.idleTimers.delete(room.id);
        if (room.conns.size === 0 && !room.running) this.track(this.unload(room));
      }, this.idleMs),
    );
  }

  cancelIdle(roomId) {
    clearTimeout(this.idleTimers.get(roomId));
    this.idleTimers.delete(roomId);
  }

  unload(room) {
    clearTimeout(this.saveTimers.get(room.id));
    this.saveTimers.delete(room.id);
    room.unloading = (async () => {
      await this.save(room);
      room.awareness.destroy();
      room.doc.destroy();
      if (this.rooms.get(room.id) === room) this.rooms.delete(room.id);
    })();
    return room.unloading;
  }

  /** Writes every room to persistence now (used on shutdown). */
  async flushAll() {
    for (const [id, timer] of this.saveTimers) {
      clearTimeout(timer);
      this.saveTimers.delete(id);
    }
    await Promise.all([...this.rooms.values()].map((room) => this.save(room)));
    await Promise.all([...this.pendingSaves]);
  }

  async close() {
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idleTimers.clear();
    await this.flushAll();
    for (const room of this.rooms.values()) {
      room.awareness.destroy();
      room.doc.destroy();
    }
    this.rooms.clear();
    await this.persistence.close();
  }
}
