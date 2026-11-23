import { loadConfig } from './config.js';
import { createServer } from './app.js';
import { createPersistence } from './persistence/index.js';
import { createRunner } from './runner/runners.js';

const config = loadConfig();
const persistence = await createPersistence(config.persistence, config.dataDir);
const runner = createRunner(config);
const { server, close } = createServer({ config, persistence, runner });

server.listen(config.port, config.host, () => {
  console.log(`code-collaborator server on http://${config.host}:${config.port}`);
  console.log(`  persistence: ${persistence.kind}${persistence.kind === 'memory' ? '' : ` (${config.dataDir})`}`);
  console.log(`  runner: ${runner.kind}${runner.kind === 'piston' ? ` (${config.pistonUrl})` : ''}`);
  if (runner.kind === 'local') console.log('  The local runner is not a sandbox. Use it only on your own machine.');
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: saving rooms and closing`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
