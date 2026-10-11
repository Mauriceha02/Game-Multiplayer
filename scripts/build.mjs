import { mkdir, readdir, readFile, writeFile, rm, copyFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('connection.json', root), 'utf8'));
const service = config.url;
if (service !== null && (typeof service !== 'string' || !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev\/?$/.test(service))) throw new Error('connection.json braucht eine HTTPS-workers.dev-Adresse oder null.');
const origin = service === null ? null : new URL(service).origin;
await writeFile(new URL('public/app/network/service.js', root), `export const SERVICE_URL = ${JSON.stringify(origin)};\n`);

async function regular(path, directory = false) {
  const parts = path.replace(/\/$/, '').split('/');
  for (let index = 0; index < parts.length; index++) {
    const entry = await lstat(new URL(parts.slice(0, index + 1).join('/'), root));
    if (entry.isSymbolicLink() || (index < parts.length - 1 || directory ? !entry.isDirectory() : !entry.isFile())) throw new Error(`Kein regulärer Build-Pfad: ${path}`);
  }
}
async function files(directory, pattern) {
  await regular(directory, true);
  const result = [];
  for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
    const path = directory + entry.name;
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) throw new Error(`Nicht zur Veröffentlichung freigegeben: ${path}`);
    if (entry.isDirectory()) result.push(...await files(path + '/', pattern));
    else if (entry.isFile() && pattern.test(entry.name)) result.push(path);
    else throw new Error(`Nicht zur Veröffentlichung freigegeben: ${path}`);
  }
  return result;
}
const release = process.env.MULTIPLAYER_RELEASE_NUMBER ?? '1';
if (!/^[1-9]\d*$/.test(release) || !Number.isSafeInteger(Number(release))) throw new Error('Ungültige Versionsnummer.');
const mappings = [
  ['index.html', 'index.html'], ['manifest.webmanifest', 'manifest.webmanifest'], ['src/demo/demo.css', 'assets/demo.css'],
  ...await files('public/assets/', /\.(?:svg|png)$/), ...await files('public/app/', /\.js$/),
].map(entry => typeof entry === 'string' ? [entry, entry.replace(/^public\//, '').replace(/^app\//, 'app/')] : entry);
for (const [source] of mappings) await regular(source);
await regular('src/demo/service-worker.js');
for (const target of ['dist/', 'bundle/']) await rm(new URL(target, root), { recursive: true, force: true });
for (const [source, target] of mappings) {
  const destination = new URL('dist/' + target, root);
  await mkdir(new URL('./', destination), { recursive: true });
  if (source === 'index.html') await writeFile(destination, (await readFile(new URL(source, root), 'utf8')).replace('{{VERSION}}', `1.0.0.${release}`).replace("connect-src 'self'", "connect-src 'self'" + (origin ? ' ' + origin : '')));
  else await copyFile(new URL(source, root), destination);
  if (target.startsWith('app/network/')) {
    const bundle = new URL('bundle/' + target, root);
    await mkdir(new URL('./', bundle), { recursive: true }); await copyFile(destination, bundle);
  }
}
const worker = await readFile(new URL('src/demo/service-worker.js', root), 'utf8');
const assets = mappings.map(([, target]) => target).sort();
const hash = createHash('sha256').update(worker);
for (const path of assets) hash.update(path).update(await readFile(new URL('dist/' + path, root)));
await writeFile(new URL('dist/sw.js', root), `const REVISION = ${JSON.stringify(hash.digest('hex').slice(0, 20))};\nconst ASSETS = ${JSON.stringify(assets, null, 2)};\n${worker}`);
await writeFile(new URL('bundle/bundle.json', root), JSON.stringify({ version: 1, entry: 'app/network/peer.js' }, null, 2) + '\n');
console.log(`Game-Multiplayer 1.0.0.${release}: ${assets.length} Dateien; dist/ und bundle/ bereit.`);
