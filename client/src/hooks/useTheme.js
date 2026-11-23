import { useEffect, useState } from 'react';
import { readPref, writePref } from '../lib/storage.js';

const query = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** 'system' follows the OS; 'light' and 'dark' are set on <html data-theme>. Returns the theme in effect. */
export function useTheme() {
  const [pref, setPref] = useState(() => readPref('cc-theme', 'system'));
  const [systemDark, setSystemDark] = useState(() => query()?.matches ?? true);

  useEffect(() => {
    const mq = query();
    if (!mq) return undefined;
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
    else root.removeAttribute('data-theme');
    writePref('cc-theme', pref === 'system' ? null : pref);
  }, [pref]);

  const effective = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  const toggle = () => setPref(effective === 'dark' ? 'light' : 'dark');
  return { effective, toggle };
}
