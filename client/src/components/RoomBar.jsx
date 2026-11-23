import { LogOut, Play } from 'iconoir-react';
import { LANGUAGES } from '../../../shared/rooms.js';
import ConnectionStatus from './ConnectionStatus.jsx';
import CopyInviteButton from './CopyInviteButton.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function RoomBar({ roomId, inviteUrl, status, language, onLanguage, onRun, running, runBlocked, theme, onTheme, onLeave }) {
  return (
    <header className="room-bar load-in" style={{ '--i': 0 }}>
      <div className="room-id-group">
        <a className="brand" href="/" aria-label="Code Collaborator home" onClick={onLeave}>
          <img src="/favicon.svg" alt="" width="24" height="24" />
        </a>
        <h1 className="room-name">
          <span className="visually-hidden">Room </span>
          <span translate="no">{roomId}</span>
        </h1>
        <CopyInviteButton url={inviteUrl} compact />
      </div>

      <ConnectionStatus status={status} />

      <div className="room-actions">
        <label className="visually-hidden" htmlFor="language">Language</label>
        <select id="language" className="select" value={language} onChange={(e) => onLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRun}
          aria-busy={running || undefined}
          aria-disabled={runBlocked || running || undefined}
          title={runBlocked ? 'Run is available once you are connected' : 'Run the shared code (Ctrl Enter)'}
        >
          <Play aria-hidden="true" />
          <span>{running ? 'Running…' : 'Run'}</span>
        </button>
        <ThemeToggle theme={theme} onToggle={onTheme} />
        <button type="button" className="btn btn-icon" onClick={onLeave} aria-label="Leave room" title="Leave room">
          <LogOut aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
