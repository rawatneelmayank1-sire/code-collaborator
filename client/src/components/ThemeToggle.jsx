import { HalfMoon, SunLight } from 'iconoir-react';

export default function ThemeToggle({ theme, onToggle }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="btn btn-icon" onClick={onToggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === 'dark' ? <SunLight aria-hidden="true" /> : <HalfMoon aria-hidden="true" />}
    </button>
  );
}
