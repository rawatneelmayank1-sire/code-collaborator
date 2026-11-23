import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function list(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every setting comes from the environment; see .env.example for what each one does. */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const pistonUrl = env.PISTON_URL?.trim() || '';
  let runner = env.RUNNER?.trim().toLowerCase();
  if (!runner) runner = pistonUrl ? 'piston' : production ? 'disabled' : 'local';

  return {
    production,
    port: int(env.PORT, 4000),
    host: env.HOST?.trim() || (production ? '0.0.0.0' : '127.0.0.1'),
    allowedOrigins: list(env.CLIENT_ORIGIN),
    persistence: (env.PERSISTENCE?.trim().toLowerCase() || 'file'),
    dataDir: path.resolve(env.DATA_DIR?.trim() || path.join(here, '..', 'data')),
    saveDebounceMs: int(env.SAVE_DEBOUNCE_MS, 750),
    roomIdleMs: int(env.ROOM_IDLE_MS, 30_000),
    maxClientsPerRoom: int(env.MAX_CLIENTS_PER_ROOM, 20),
    runner,
    pistonUrl,
    runTimeoutMs: int(env.RUN_TIMEOUT_MS, 10_000),
    runsPerMinute: int(env.RUNS_PER_MINUTE, 10),
    staticDir: path.resolve(env.STATIC_DIR?.trim() || path.join(here, '..', '..', 'client', 'dist')),
  };
}
