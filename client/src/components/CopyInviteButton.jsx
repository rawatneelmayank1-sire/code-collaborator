import { useEffect, useState } from 'react';
import { Check, Copy } from 'iconoir-react';

export default function CopyInviteButton({ url, compact = false }) {
  const [state, setState] = useState('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  const label = state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed, select the address bar' : 'Copy invite link';
  return (
    <button type="button" className={`btn btn-ghost${compact ? ' btn-compact' : ''}`} onClick={copy} aria-label={label} title={label}>
      {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className={compact ? 'hide-narrow' : undefined}>{label}</span>
    </button>
  );
}
