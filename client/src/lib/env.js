// VITE_SERVER_URL points the client at a server on another origin (for example https://api.example.com).
// Left empty, the client uses the page's own origin (the Vite proxy in development, Express in production).
const raw = (import.meta.env.VITE_SERVER_URL ?? '').trim().replace(/\/+$/, '');

export function httpBase() {
  return raw || window.location.origin;
}

export function wsBase() {
  const url = new URL(httpBase());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${url.origin}/yjs`;
}
