import { WebSocketServer } from 'ws';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { normalizeName, normalizeRoomId, validateName, validateRoomId } from '../../../shared/rooms.js';

// Message types of the y-websocket wire protocol, so the stock WebsocketProvider can talk to this server.
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_QUERY_AWARENESS = 3;

// Close codes in the 4000-4999 range are free for applications; the client turns them into plain sentences.
export const CLOSE_INVALID_ROOM = 4400;
export const CLOSE_INVALID_NAME = 4401;
export const CLOSE_FORBIDDEN_ORIGIN = 4403;
export const CLOSE_ROOM_FULL = 4429;

const PING_INTERVAL_MS = 30_000;
const OPEN = 1;

function send(conn, message) {
  if (conn.readyState !== OPEN) return;
  conn.send(message, (err) => {
    if (err) conn.terminate();
  });
}

function broadcast(room, message, except = null) {
  for (const conn of room.conns.keys()) if (conn !== except) send(conn, message);
}

/** Wires a room's document and awareness to its sockets once, the first time someone joins. */
function attachRoom(room) {
  if (room.attached) return;
  room.attached = true;

  room.doc.on('update', (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    // The sender already has its own change; everyone else gets it.
    broadcast(room, encoding.toUint8Array(encoder), origin);
  });

  room.awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    const controlled = room.conns.get(origin);
    if (controlled) {
      added.forEach((id) => controlled.add(id));
      removed.forEach((id) => controlled.delete(id));
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
    broadcast(room, encoding.toUint8Array(encoder));
  });
}

/** Rejects awareness states whose display name breaks the shared rules (the browser checks too). */
function namesAreValid(room, conn) {
  const ids = room.conns.get(conn) ?? new Set();
  for (const id of ids) {
    const name = room.awareness.getStates().get(id)?.user?.name;
    if (name === undefined) continue;
    if (validateName(name) || normalizeName(name) !== name) return false;
  }
  return true;
}

function handleMessage(room, conn, data) {
  const decoder = decoding.createDecoder(new Uint8Array(data));
  const encoder = encoding.createEncoder();
  const type = decoding.readVarUint(decoder);
  switch (type) {
    case MESSAGE_SYNC: {
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      // Applies the client's step 1 / step 2 / updates; `conn` becomes the transaction origin.
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
      if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder));
      break;
    }
    case MESSAGE_AWARENESS: {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
      if (!namesAreValid(room, conn)) conn.close(CLOSE_INVALID_NAME, 'Invalid display name');
      break;
    }
    case MESSAGE_QUERY_AWARENESS: {
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()]),
      );
      send(conn, encoding.toUint8Array(encoder));
      break;
    }
    default:
      // Unknown message types are ignored, as the reference server does.
      break;
  }
}

function closeConnection(rooms, room, conn) {
  const controlled = room.conns.get(conn);
  if (!controlled) return;
  room.conns.delete(conn);
  awarenessProtocol.removeAwarenessStates(room.awareness, [...controlled], null);
  rooms.release(room);
}

async function onConnection(rooms, conn, roomId, { maxClientsPerRoom, logger }) {
  conn.binaryType = 'arraybuffer';
  // Buffer messages that arrive while the room loads from disk, then replay them in order.
  const early = [];
  const buffer = (data) => early.push(data);
  conn.on('message', buffer);

  let room;
  try {
    room = await rooms.get(roomId);
  } catch (err) {
    logger.error?.(`Could not open room ${roomId}: ${err.message}`);
    conn.close(1011, 'Room could not be opened');
    return;
  }
  if (conn.readyState !== OPEN) {
    rooms.release(room);
    return;
  }
  if (room.conns.size >= maxClientsPerRoom) {
    conn.close(CLOSE_ROOM_FULL, 'Room is full');
    rooms.release(room);
    return;
  }

  attachRoom(room);
  room.conns.set(conn, new Set());
  conn.off('message', buffer);
  conn.on('message', (data) => {
    try {
      handleMessage(room, conn, data);
    } catch (err) {
      logger.warn?.(`Dropped a malformed message in ${roomId}: ${err.message}`);
    }
  });

  let alive = true;
  conn.on('pong', () => {
    alive = true;
  });
  const ping = setInterval(() => {
    if (!alive) {
      conn.terminate();
      return;
    }
    alive = false;
    try {
      conn.ping();
    } catch {
      conn.terminate();
    }
  }, PING_INTERVAL_MS);

  conn.on('close', () => {
    clearInterval(ping);
    closeConnection(rooms, room, conn);
  });

  // Sync step 1: tell the client what the server has, so it can send what is missing.
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  send(conn, encoding.toUint8Array(encoder));

  const states = room.awareness.getStates();
  if (states.size > 0) {
    const aw = encoding.createEncoder();
    encoding.writeVarUint(aw, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(aw, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]));
    send(conn, encoding.toUint8Array(aw));
  }

  for (const data of early) handleMessage(room, conn, data);
}

/**
 * Attaches the collaboration socket to an HTTP server at `${path}/<roomId>`.
 * Returns the WebSocketServer so callers can close it.
 */
export function attachYjsSocket(server, rooms, { path = '/yjs', allowedOrigins = [], maxClientsPerRoom = 20, logger = console } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(`${path}/`)) {
      socket.destroy();
      return;
    }
    let roomId;
    try {
      roomId = decodeURIComponent(url.pathname.slice(path.length + 1));
    } catch {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (conn) => {
      const origin = req.headers.origin;
      if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
        conn.close(CLOSE_FORBIDDEN_ORIGIN, 'Origin not allowed');
        return;
      }
      if (validateRoomId(roomId) || normalizeRoomId(roomId) !== roomId) {
        conn.close(CLOSE_INVALID_ROOM, 'Invalid room name');
        return;
      }
      onConnection(rooms, conn, roomId, { maxClientsPerRoom, logger });
    });
  });

  return wss;
}
