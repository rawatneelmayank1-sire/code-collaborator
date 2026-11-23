import { CheckCircle, CloudXmark, RefreshDouble, WarningCircle } from 'iconoir-react';

export const STATUS_COPY = {
  connecting: { label: 'Connecting…', detail: 'Opening the room on the server.', Icon: RefreshDouble, tone: 'muted' },
  live: { label: 'Live', detail: 'Your edits reach everyone in the room as you type.', Icon: CheckCircle, tone: 'ok' },
  reconnecting: { label: 'Reconnecting…', detail: 'Keep typing. Your edits are kept here and sync when the connection is back.', Icon: RefreshDouble, tone: 'muted' },
  offline: { label: 'Offline', detail: 'You are offline. Your edits are kept here and sync when you reconnect.', Icon: CloudXmark, tone: 'bad' },
  rejected: { label: 'Not connected', detail: 'The server refused this room.', Icon: WarningCircle, tone: 'bad' },
};

/** Always says the state in words; colour and icon only repeat it. */
export default function ConnectionStatus({ status }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.connecting;
  const { Icon } = copy;
  return (
    <p className={`status status-${copy.tone}`} role="status" aria-live="polite" title={copy.detail}>
      <Icon aria-hidden="true" className={status === 'connecting' || status === 'reconnecting' ? 'spin' : undefined} />
      <span>{copy.label}</span>
    </p>
  );
}
