import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// npm workspaces may install monaco-editor in client/node_modules or hoist it to the root.
const monacoDir = [path.join(here, 'node_modules', 'monaco-editor'), path.join(here, '..', 'node_modules', 'monaco-editor')]
  .find((dir) => fs.existsSync(dir))
  ?.replaceAll('\\', '/');

// In development the client talks to the server through this proxy, so the browser sees one origin.
// Set VITE_SERVER_URL instead when the client is deployed separately from the server.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.DEV_PROXY_TARGET || 'http://127.0.0.1:4000';
  return {
    plugins: [react()],
    // One copy of each: y-monaco is hoisted to the workspace root while monaco-editor may live in
    // client/node_modules, and two Yjs copies would break CRDT type checks.
    resolve: {
      dedupe: ['monaco-editor', 'yjs', 'y-protocols', 'lib0'],
      alias: monacoDir ? [{ find: /^monaco-editor(\/.*)?$/, replacement: `${monacoDir}$1` }] : [],
    },
    server: {
      port: Number(env.CLIENT_PORT) || 5173,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/yjs': { target, ws: true, changeOrigin: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 4000,
    },
    test: {
      environment: 'jsdom',
      include: ['test/**/*.test.{js,jsx}'],
      setupFiles: ['./test/setup.js'],
      css: false,
    },
  };
});
