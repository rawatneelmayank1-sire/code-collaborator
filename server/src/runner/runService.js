import { getLanguage, normalizeName, validateName } from '../../../shared/rooms.js';
import { RunnerError } from './runners.js';

export const MAX_CODE_BYTES = 64 * 1024;
export const MAX_STDIN_BYTES = 16 * 1024;

export class RunRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Runs the room's current code (read from the shared document on the server, so the result always matches
 * what everyone sees) and writes the result into doc.getMap('run'), which syncs it to every participant.
 * One run per room at a time, and at most `runsPerMinute` per room.
 */
export function createRunService({ rooms, runner, runsPerMinute = 10, now = () => Date.now(), logger = console }) {
  const history = new Map();

  function checkRate(roomId) {
    const windowStart = now() - 60_000;
    const recent = (history.get(roomId) ?? []).filter((t) => t > windowStart);
    history.set(roomId, recent);
    if (recent.length >= runsPerMinute) {
      const waitS = Math.max(1, Math.ceil((recent[0] + 60_000 - now()) / 1000));
      throw new RunRequestError(429, 'rate_limited', `This room has used its ${runsPerMinute} runs for this minute. Try again in ${waitS} seconds.`);
    }
    recent.push(now());
  }

  async function run(roomId, { language, stdin = '', name } = {}) {
    const room = rooms.peek(roomId);
    if (!room || room.conns.size === 0) {
      throw new RunRequestError(404, 'room_not_open', 'Join the room before running its code.');
    }
    const lang = getLanguage(language ?? room.language);
    if (!lang) throw new RunRequestError(400, 'bad_language', `"${language}" is not a supported language.`);
    const runnerName = normalizeName(name);
    if (validateName(runnerName)) throw new RunRequestError(400, 'bad_name', 'Send the name of the person starting the run.');
    if (typeof stdin !== 'string' || Buffer.byteLength(stdin) > MAX_STDIN_BYTES) {
      throw new RunRequestError(413, 'stdin_too_large', 'Program input can be at most 16 KB.');
    }
    const code = room.code;
    if (!code.trim()) throw new RunRequestError(400, 'empty_code', 'The editor is empty. Write some code first.');
    if (Buffer.byteLength(code) > MAX_CODE_BYTES) {
      throw new RunRequestError(413, 'code_too_large', 'Code can be at most 64 KB to run.');
    }
    if (room.running) {
      throw new RunRequestError(409, 'busy', `${room.running.by} is already running this code. Wait for it to finish.`);
    }
    checkRate(roomId);

    const runId = `${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    room.running = { runId, by: runnerName };
    const out = room.doc.getMap('run');
    room.doc.transact(() => {
      out.clear();
      out.set('runId', runId);
      out.set('status', 'running');
      out.set('by', runnerName);
      out.set('language', lang.id);
      out.set('startedAt', now());
    }, 'runner');

    let result;
    try {
      const r = await runner.execute({ language: lang.id, code, stdin });
      result = { status: 'done', ...r };
    } catch (err) {
      if (!(err instanceof RunnerError)) logger.error?.(`Run failed in ${roomId}: ${err.stack ?? err.message}`);
      result = {
        status: 'error',
        errorKind: err instanceof RunnerError ? err.kind : 'internal',
        message: err instanceof RunnerError ? err.message : 'The server hit an unexpected problem while running the code.',
      };
    } finally {
      room.running = null;
    }

    // The room may have been unloaded while the program ran; only write back into a live document.
    if (rooms.peek(roomId) === room) {
      room.doc.transact(() => {
        for (const [k, v] of Object.entries(result)) out.set(k, v ?? null);
        out.set('finishedAt', now());
      }, 'runner');
      // Everyone may have left during the run; let the room unload as usual.
      rooms.release(room);
    }
    return { runId, ...result };
  }

  return { run };
}
