const prefix = `game-multiplayer:${self.registration.scope}:`;
const name = prefix + REVISION;
const urls = ASSETS.map(path => new URL(path, self.registration.scope).href);
const allowed = new Set(urls);
const index = new URL('index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(name);
      await cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) { await caches.delete(name); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(prefix) && key !== name).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url); url.search = ''; url.hash = '';
  const key = event.request.mode === 'navigate' && url.href === self.registration.scope ? index : url.href;
  if (!allowed.has(key)) return;
  event.respondWith((async () => { return (await (await caches.open(name)).match(key)) ?? fetch(event.request); })());
});
