import { httpBase } from './env.js';

/** Starts a run. The result also arrives through the shared document; this returns the server's answer. */
export async function runCode(roomId, { language, stdin, name }, { timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${httpBase()}/api/rooms/${encodeURIComponent(roomId)}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language, stdin, name }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: body.message ?? `The server answered with HTTP ${res.status}.` };
    return { ok: true, result: body };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, message: 'The server did not answer in 30 seconds. Check your connection and run again.' };
    return { ok: false, message: 'Could not reach the server. Check your connection and run again.' };
  } finally {
    clearTimeout(timer);
  }
}
