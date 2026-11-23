import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getLanguage } from '../../../shared/rooms.js';

/**
 * A runner executes one program and resolves to
 *   { stdout, stderr, exitCode, signal, durationMs, stage }   (stage is 'compile' or 'run')
 * or throws a RunnerError. Every runner enforces its own time limit.
 */
export class RunnerError extends Error {
  /** @param {'unavailable'|'timeout'|'unsupported'|'bad_response'} kind */
  constructor(kind, message) {
    super(message);
    this.name = 'RunnerError';
    this.kind = kind;
  }
}

const OUTPUT_LIMIT = 64 * 1024;

function clip(text) {
  const s = String(text ?? '');
  return s.length > OUTPUT_LIMIT ? `${s.slice(0, OUTPUT_LIMIT)}\n[output cut at 64 KB]` : s;
}

/**
 * Talks to a Piston server (https://github.com/engineer-man/piston). The public emkc.org instance has been
 * allow-list only since 15 Feb 2026, so this expects a self-hosted one (docker-compose.yml starts it).
 */
export function createPistonRunner({ url, timeoutMs = 10_000, fetchImpl = globalThis.fetch }) {
  const base = url.replace(/\/+$/, '');
  return {
    kind: 'piston',
    async execute({ language, code, stdin = '' }) {
      const lang = getLanguage(language);
      if (!lang) throw new RunnerError('unsupported', `The runner does not know the language "${language}".`);
      const controller = new AbortController();
      // Piston enforces run_timeout itself; this outer limit also covers a hung network or compile step.
      const timer = setTimeout(() => controller.abort(), timeoutMs + 5_000);
      const started = Date.now();
      let res;
      try {
        res = await fetchImpl(`${base}/api/v2/execute`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            language: lang.runner,
            version: '*',
            files: [{ name: lang.file, content: code }],
            stdin,
            run_timeout: timeoutMs,
            compile_timeout: timeoutMs,
          }),
        });
      } catch (err) {
        if (err.name === 'AbortError') throw new RunnerError('timeout', `The runner did not answer within ${Math.round((timeoutMs + 5_000) / 1000)} seconds.`);
        throw new RunnerError('unavailable', `The code runner at ${base} is not reachable (${err.cause?.code ?? err.message}).`);
      } finally {
        clearTimeout(timer);
      }

      let body;
      try {
        body = await res.json();
      } catch {
        throw new RunnerError('bad_response', `The runner answered with HTTP ${res.status} and no readable result.`);
      }
      if (res.status === 401 || res.status === 403) {
        throw new RunnerError('unavailable', 'The runner refused the request. Public Piston is allow-list only; point PISTON_URL at your own instance.');
      }
      if (!res.ok) {
        const message = body?.message ? String(body.message) : `HTTP ${res.status}`;
        if (/runtime is unknown|not installed/i.test(message)) {
          throw new RunnerError('unsupported', `${lang.label} is not installed on the runner. Install it with "npm run piston:install".`);
        }
        throw new RunnerError('bad_response', `The runner could not run the code: ${message}`);
      }

      const compile = body.compile;
      if (compile && compile.code !== 0 && compile.code !== null) {
        return {
          stage: 'compile',
          stdout: clip(compile.stdout),
          stderr: clip(compile.stderr || compile.output),
          exitCode: compile.code,
          signal: compile.signal ?? null,
          durationMs: Date.now() - started,
        };
      }
      const run = body.run ?? {};
      if (run.signal === 'SIGKILL' && run.code === null) {
        throw new RunnerError('timeout', `The program ran longer than ${timeoutMs / 1000} seconds and was stopped.`);
      }
      return {
        stage: 'run',
        stdout: clip(run.stdout),
        stderr: clip(run.stderr),
        exitCode: run.code ?? null,
        signal: run.signal ?? null,
        durationMs: Date.now() - started,
      };
    },
  };
}

function runProcess(command, args, { cwd, stdin, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      // A clean environment: the program gets no server secrets.
      env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: cwd, TMP: cwd, HOME: cwd },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      if (stdout.length < OUTPUT_LIMIT * 2) stdout += d;
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < OUTPUT_LIMIT * 2) stderr += d;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout: clip(stdout), stderr: clip(stderr), exitCode: code, signal, timedOut, durationMs: Date.now() - started });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

/**
 * Runs code with the tools installed on this machine. For local development only: it is not a sandbox,
 * so never expose a server with RUNNER=local to people you do not trust.
 */
export function createLocalRunner({ timeoutMs = 10_000, python = process.platform === 'win32' ? 'python' : 'python3' } = {}) {
  const plans = {
    javascript: () => [{ cmd: process.execPath, args: ['main.js'], stage: 'run' }],
    python: () => [{ cmd: python, args: ['-I', 'main.py'], stage: 'run' }],
    java: () => [{ cmd: 'java', args: ['Main.java'], stage: 'run' }],
    cpp: () => [
      { cmd: 'g++', args: ['-O0', '-o', process.platform === 'win32' ? 'main.exe' : 'main', 'main.cpp'], stage: 'compile' },
      { cmd: process.platform === 'win32' ? 'main.exe' : './main', args: [], stage: 'run' },
    ],
  };
  return {
    kind: 'local',
    async execute({ language, code, stdin = '' }) {
      const lang = getLanguage(language);
      if (!lang || !plans[language]) throw new RunnerError('unsupported', `The runner does not know the language "${language}".`);
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-run-'));
      const started = Date.now();
      try {
        await fs.writeFile(path.join(dir, lang.file), code);
        let last;
        for (const step of plans[language]()) {
          const cmd = step.cmd.startsWith('.') || step.cmd === 'main.exe' ? path.join(dir, step.cmd) : step.cmd;
          try {
            last = await runProcess(cmd, step.args, { cwd: dir, stdin: step.stage === 'run' ? stdin : '', timeoutMs });
          } catch (err) {
            if (err.code === 'ENOENT') {
              throw new RunnerError('unsupported', `${lang.label} needs "${step.cmd}", which is not installed on this server.`);
            }
            throw new RunnerError('unavailable', `The local runner could not start: ${err.message}`);
          }
          if (last.timedOut) throw new RunnerError('timeout', `The program ran longer than ${timeoutMs / 1000} seconds and was stopped.`);
          if (step.stage === 'compile' && last.exitCode !== 0) {
            return { stage: 'compile', stdout: last.stdout, stderr: last.stderr, exitCode: last.exitCode, signal: last.signal, durationMs: Date.now() - started };
          }
        }
        return { stage: 'run', stdout: last.stdout, stderr: last.stderr, exitCode: last.exitCode, signal: last.signal, durationMs: Date.now() - started };
      } finally {
        fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

export function createDisabledRunner() {
  return {
    kind: 'disabled',
    async execute() {
      throw new RunnerError('unavailable', 'Running code is turned off on this server. Set RUNNER=piston and PISTON_URL to enable it.');
    },
  };
}

export function createRunner(config) {
  switch (config.runner) {
    case 'piston':
      if (!config.pistonUrl) throw new Error('RUNNER=piston needs PISTON_URL, for example http://localhost:2000');
      return createPistonRunner({ url: config.pistonUrl, timeoutMs: config.runTimeoutMs });
    case 'local':
      return createLocalRunner({ timeoutMs: config.runTimeoutMs });
    case 'disabled':
      return createDisabledRunner();
    default:
      throw new Error(`Unknown RUNNER "${config.runner}". Use piston, local or disabled.`);
  }
}
