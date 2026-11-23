// Installs the runtimes the editor offers into a self-hosted Piston: npm run piston:install
// Uses PISTON_URL (default http://localhost:2000). Safe to run again; installed packages are skipped.
const base = (process.env.PISTON_URL || 'http://localhost:2000').replace(/\/+$/, '');
const wanted = [
  { language: 'node', version: '18.15.0' },
  { language: 'python', version: '3.10.0' },
  { language: 'java', version: '15.0.2' },
  { language: 'gcc', version: '10.2.0' },
];

const res = await fetch(`${base}/api/v2/packages`).catch((err) => {
  console.error(`Could not reach Piston at ${base} (${err.cause?.code ?? err.message}). Start it with: docker compose up -d piston`);
  process.exit(1);
});
const available = await res.json();

for (const pkg of wanted) {
  const entry = available.find((p) => p.language === pkg.language && p.language_version === pkg.version);
  if (entry?.installed) {
    console.log(`${pkg.language} ${pkg.version}: already installed`);
    continue;
  }
  process.stdout.write(`${pkg.language} ${pkg.version}: installing... `);
  const r = await fetch(`${base}/api/v2/packages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(pkg),
  });
  console.log(r.ok ? 'done' : `failed (HTTP ${r.status}: ${await r.text()})`);
}
