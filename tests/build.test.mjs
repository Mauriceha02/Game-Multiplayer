import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
test('the published app contains its assets and the bundle contains only the reusable module', async () => {
  const worker = await readFile(new URL('dist/sw.js', root), 'utf8');
  const assets = JSON.parse(worker.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
  for (const asset of assets) assert((await readFile(new URL('dist/' + asset, root))).length);
  assert(assets.includes('assets/icon-180.png'));
  assert(assets.includes('app/network/peer.js'));
  assert(!assets.some(path => /README|PLAN|package|\.git|\.env|tests\//.test(path)));
  assert.deepEqual((await readdir(new URL('bundle/app/', root))).sort(), ['network']);
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  assert(html.includes("script-src 'self'")); assert(html.includes('Verbindungstest'));
  assert(!html.includes('{{VERSION}}'));
});

test('the worker serves cold navigations offline at root and repository paths and keeps other caches', async () => {
  const worker = await readFile(new URL('dist/sw.js', root), 'utf8');
  for (const scope of ['https://example.test/', 'https://example.test/Game-Multiplayer/']) {
    const listeners = new Map();
    const caches = new Map([['phase10:existing', new Map()], ['game-multiplayer:' + scope + ':old', new Map()]]);
    const api = {
      async open(name) {
        if (!caches.has(name)) caches.set(name, new Map());
        const cache = caches.get(name);
        return { async addAll(requests) { requests.forEach(request => cache.set(request.url, { asset: request.url })); }, async match(url) { return cache.get(url); } };
      }, async keys() { return [...caches.keys()]; }, async delete(name) { return caches.delete(name); },
    };
    let claimed = false;
    vm.runInNewContext(worker, { self: { registration: { scope }, clients: { async claim() { claimed = true; } }, addEventListener: (name, callback) => listeners.set(name, callback) }, caches: api, URL, Request: class { constructor(url) { this.url = url; } }, fetch() { throw new Error('Network unavailable'); } });
    let waiting;
    listeners.get('install')({ waitUntil: promise => waiting = promise }); await waiting;
    listeners.get('activate')({ waitUntil: promise => waiting = promise }); await waiting;
    assert(claimed); assert(caches.has('phase10:existing')); assert(!caches.has('game-multiplayer:' + scope + ':old'));
    let response;
    listeners.get('fetch')({ request: { method: 'GET', url: scope + '?fresh=1#invite=secret', mode: 'navigate' }, respondWith: promise => response = promise });
    assert.equal((await response).asset, scope + 'index.html');
    let handled = false;
    listeners.get('fetch')({ request: { method: 'GET', url: scope + '.env', mode: 'cors' }, respondWith() { handled = true; } });
    assert.equal(handled, false);
  }
});

test('private files prevent publication', async () => {
  const privateFile = new URL('public/assets/private.pem', root);
  await writeFile(privateFile, 'test-only');
  try {
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Nicht zur Veröffentlichung freigegeben/);
  } finally { await rm(privateFile); }
});
