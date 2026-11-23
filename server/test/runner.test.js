import { describe, expect, it } from 'vitest';
import { createMemoryPersistence } from '../src/persistence/index.js';
import { RoomManager } from '../src/rooms/RoomManager.js';
import { createLocalRunner, createPistonRunner, RunnerError } from '../src/runner/runners.js';
import { createRunService } from '../src/runner/runService.js';

const quiet = { error() {}, warn() {} };

async function openRoom(id = 'run-room') {
  const rooms = new RoomManager({ persistence: createMemoryPersistence(), logger: quiet });
  const room = await rooms.get(id);
  room.conns.set({}, new Set()); // pretend one person is connected
  return { rooms, room };
}

const okRunner = (overrides = {}) => ({
  kind: 'fake',
  calls: [],
  async execute(args) {
    this.calls.push(args);
    return { stage: 'run', stdout: 'Hello, team\n', stderr: '', exitCode: 0, signal: null, durationMs: 12, ...overrides };
  },
});

describe('run service', () => {
  it('runs the code from the shared document and publishes the result to the room', async () => {
    const { rooms, room } = await openRoom();
    const runner = okRunner();
    const runs = createRunService({ rooms, runner, logger: quiet });
    const result = await runs.run('run-room', { language: 'javascript', name: 'Asha', stdin: '' });
    expect(result.status).toBe('done');
    expect(runner.calls[0].code).toBe(room.code);
    const out = room.doc.getMap('run');
    expect(out.get('status')).toBe('done');
    expect(out.get('stdout')).toBe('Hello, team\n');
    expect(out.get('by')).toBe('Asha');
    expect(out.get('exitCode')).toBe(0);
    await rooms.close();
  });

  it('turns runner failures into a readable error in the room, not a crash', async () => {
    const { rooms, room } = await openRoom();
    const runner = { kind: 'fake', execute: async () => { throw new RunnerError('unavailable', 'The code runner at http://x is not reachable (ECONNREFUSED).'); } };
    const runs = createRunService({ rooms, runner, logger: quiet });
    const result = await runs.run('run-room', { language: 'javascript', name: 'Asha' });
    expect(result).toMatchObject({ status: 'error', errorKind: 'unavailable' });
    expect(room.doc.getMap('run').get('message')).toMatch(/not reachable/);
    expect(room.running).toBeNull();
    await rooms.close();
  });

  it('hides unexpected internal errors behind a generic message', async () => {
    const { rooms } = await openRoom();
    const runner = { kind: 'fake', execute: async () => { throw new TypeError('boom'); } };
    const runs = createRunService({ rooms, runner, logger: quiet });
    const result = await runs.run('run-room', { language: 'javascript', name: 'Asha' });
    expect(result).toMatchObject({ status: 'error', errorKind: 'internal' });
    expect(result.message).not.toMatch(/boom/);
    await rooms.close();
  });

  it('allows one run at a time per room', async () => {
    const { rooms } = await openRoom();
    let release;
    const runner = { kind: 'fake', execute: () => new Promise((r) => { release = () => r({ stage: 'run', stdout: '', stderr: '', exitCode: 0 }); }) };
    const runs = createRunService({ rooms, runner, logger: quiet });
    const first = runs.run('run-room', { language: 'javascript', name: 'Asha' });
    await expect(runs.run('run-room', { language: 'javascript', name: 'Ravi' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Asha is already running/) });
    release();
    await first;
    await rooms.close();
  });

  it('limits runs per minute per room', async () => {
    const { rooms } = await openRoom();
    let t = 1_000_000;
    const runs = createRunService({ rooms, runner: okRunner(), runsPerMinute: 2, now: () => t, logger: quiet });
    await runs.run('run-room', { language: 'javascript', name: 'Asha' });
    await runs.run('run-room', { language: 'javascript', name: 'Asha' });
    await expect(runs.run('run-room', { language: 'javascript', name: 'Asha' })).rejects.toMatchObject({ status: 429 });
    t += 61_000;
    await expect(runs.run('run-room', { language: 'javascript', name: 'Asha' })).resolves.toMatchObject({ status: 'done' });
    await rooms.close();
  });

  it('validates the request', async () => {
    const { rooms, room } = await openRoom();
    const runs = createRunService({ rooms, runner: okRunner(), logger: quiet });
    await expect(runs.run('run-room', { language: 'cobol', name: 'Asha' })).rejects.toMatchObject({ status: 400, code: 'bad_language' });
    await expect(runs.run('run-room', { language: 'javascript', name: '' })).rejects.toMatchObject({ code: 'bad_name' });
    await expect(runs.run('run-room', { language: 'javascript', name: 'Asha', stdin: 'x'.repeat(17 * 1024) })).rejects.toMatchObject({ status: 413 });
    await expect(runs.run('closed-room', { language: 'javascript', name: 'Asha' })).rejects.toMatchObject({ status: 404 });
    room.doc.getText('code').delete(0, room.code.length);
    await expect(runs.run('run-room', { language: 'javascript', name: 'Asha' })).rejects.toMatchObject({ code: 'empty_code' });
    await rooms.close();
  });
});

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

describe('Piston runner', () => {
  it('sends the Piston language name and maps the run result', async () => {
    const fetchImpl = fakeFetch(200, { run: { stdout: '42\n', stderr: '', code: 0, signal: null } });
    const runner = createPistonRunner({ url: 'http://piston:2000/', fetchImpl });
    const r = await runner.execute({ language: 'cpp', code: 'int main(){}', stdin: '' });
    expect(fetchImpl.calls[0].url).toBe('http://piston:2000/api/v2/execute');
    expect(fetchImpl.calls[0].body).toMatchObject({ language: 'c++', version: '*', files: [{ name: 'main.cpp' }] });
    expect(r).toMatchObject({ stage: 'run', stdout: '42\n', exitCode: 0 });
  });

  it('reports compile errors as the compile stage', async () => {
    const fetchImpl = fakeFetch(200, { compile: { stdout: '', stderr: 'error: expected ;', code: 1 }, run: {} });
    const r = await createPistonRunner({ url: 'http://p', fetchImpl }).execute({ language: 'java', code: 'x' });
    expect(r).toMatchObject({ stage: 'compile', exitCode: 1, stderr: 'error: expected ;' });
  });

  it('explains a refused request (the public API is allow-list only)', async () => {
    const fetchImpl = fakeFetch(401, { message: 'Public Piston API is now whitelist only' });
    await expect(createPistonRunner({ url: 'http://p', fetchImpl }).execute({ language: 'python', code: 'x' })).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('explains a runner that is down', async () => {
    const fetchImpl = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
    await expect(createPistonRunner({ url: 'http://p', fetchImpl }).execute({ language: 'python', code: 'x' })).rejects.toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/ECONNREFUSED/) });
  });

  it('gives up when the runner hangs', async () => {
    const fetchImpl = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const runner = createPistonRunner({ url: 'http://p', timeoutMs: -4_950, fetchImpl });
    await expect(runner.execute({ language: 'python', code: 'x' })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('treats a killed program as a timeout', async () => {
    const fetchImpl = fakeFetch(200, { run: { stdout: '', stderr: '', code: null, signal: 'SIGKILL' } });
    await expect(createPistonRunner({ url: 'http://p', fetchImpl }).execute({ language: 'python', code: 'x' })).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('local runner', () => {
  it('runs JavaScript with stdin', async () => {
    const runner = createLocalRunner({ timeoutMs: 5_000 });
    const code = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(s.trim().toUpperCase()));";
    const r = await runner.execute({ language: 'javascript', code, stdin: 'pair programming' });
    expect(r).toMatchObject({ stage: 'run', exitCode: 0, stdout: 'PAIR PROGRAMMING\n' });
  });

  it('reports a non-zero exit and stderr', async () => {
    const r = await createLocalRunner().execute({ language: 'javascript', code: "console.error('bad input'); process.exit(3)" });
    expect(r).toMatchObject({ exitCode: 3, stderr: 'bad input\n' });
  });

  it('stops programs that run too long', async () => {
    const runner = createLocalRunner({ timeoutMs: 300 });
    await expect(runner.execute({ language: 'javascript', code: 'while (true) {}' })).rejects.toMatchObject({ kind: 'timeout' });
  });
});
