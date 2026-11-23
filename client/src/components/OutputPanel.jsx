import { CheckCircle, WarningCircle, XmarkCircle } from 'iconoir-react';
import { getLanguage } from '../../../shared/rooms.js';

/** One sentence that says what the last run did, for the panel header and screen readers. */
export function describeRun(run) {
  if (!run?.status) return null;
  const lang = getLanguage(run.language)?.label ?? 'the code';
  if (run.status === 'running') return `${run.by} is running ${lang}…`;
  if (run.status === 'error') return `${run.by}'s run did not start.`;
  const time = typeof run.durationMs === 'number' ? ` in ${(run.durationMs / 1000).toFixed(2)} s` : '';
  if (run.stage === 'compile') return `${lang} did not compile (exit code ${run.exitCode}).`;
  if (run.exitCode === 0) return `${run.by} ran ${lang}, finished${time} with exit code 0.`;
  return `${run.by} ran ${lang}, stopped${time} with exit code ${run.exitCode ?? run.signal}.`;
}

export default function OutputPanel({ run, localError }) {
  const summary = describeRun(run);
  const failed = run?.status === 'error' || (run?.status === 'done' && run.exitCode !== 0);
  const Icon = run?.status === 'done' && run.exitCode === 0 ? CheckCircle : failed ? XmarkCircle : null;

  return (
    <section className="panel output" aria-labelledby="output-heading">
      <header className="panel-head">
        <h2 id="output-heading">Output</h2>
        <p className={`run-summary${failed ? ' is-bad' : run?.status === 'done' ? ' is-ok' : ''}`} aria-live="polite">
          {Icon && <Icon aria-hidden="true" />}
          {summary ?? 'Shared with everyone in the room.'}
        </p>
      </header>
      <div className="console" tabIndex={0} aria-label="Program output">
        {localError && (
          <p className="console-error" role="alert">
            <WarningCircle aria-hidden="true" /> {localError}
          </p>
        )}
        {!run?.status && !localError && (
          <p className="console-empty">
            Press Run, or <kbd>Ctrl</kbd>&nbsp;<kbd>Enter</kbd> in the editor. The output appears here for everyone.
          </p>
        )}
        {run?.status === 'running' && <p className="console-empty">Waiting for the runner…</p>}
        {run?.status === 'error' && (
          <p className="console-error">
            <WarningCircle aria-hidden="true" /> {run.message}
          </p>
        )}
        {run?.status === 'done' && (
          <>
            {run.stdout ? <pre className="stdout" key={`o-${run.runId}`}>{run.stdout}</pre> : null}
            {run.stderr ? <pre className="stderr">{run.stderr}</pre> : null}
            {!run.stdout && !run.stderr && <p className="console-empty">The program finished without printing anything.</p>}
          </>
        )}
      </div>
    </section>
  );
}
