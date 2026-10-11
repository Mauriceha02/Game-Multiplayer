import { RoomStore, RoomError } from './room-store.mjs';

const MAX_BODY = 70000;
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...headers } });
async function body(request) {
  if (!['PUT', 'POST'].includes(request.method)) return undefined;
  if (request.headers.get('content-type') !== 'application/json') throw new RoomError(415, 'JSON erwartet.');
  if (Number(request.headers.get('content-length')) > MAX_BODY) { await request.body?.cancel().catch(() => {}); throw new RoomError(413, 'Anfrage zu groß.'); }
  const reader = request.body?.getReader(); if (!reader) throw new RoomError(400, 'Anfrage fehlt.');
  let size = 0; const decoder = new TextDecoder(); let text = '';
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_BODY) { await reader.cancel(); throw new RoomError(413, 'Anfrage zu groß.'); } text += decoder.decode(part.value, { stream: true }); }
    text += decoder.decode(); return JSON.parse(text);
  } catch (error) { if (error instanceof RoomError) throw error; throw new RoomError(400, 'Ungültige Anfrage.'); }
  finally { reader.releaseLock(); }
}
export class SignalRoom {
  constructor(ctx) { this.ctx = ctx; this.store = new RoomStore(ctx.storage); }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const path = new URL(request.url).pathname;
        const resource = path.split('/')[4] ?? '';
        const key = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
        return json(await this.store.handle(request.method, resource, key, await body(request)));
      } catch (error) { return json({ error: error instanceof RoomError ? error.message : 'Verbindungsdienst nicht verfügbar.' }, error instanceof RoomError ? error.status : 503); }
    });
  }
  async alarm() { await this.store.erase(); }
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim());
    if (!origin || !allowed.includes(origin)) return json({ error: 'Herkunft nicht erlaubt.' }, 403);
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
    const path = new URL(request.url);
    if (path.search || !/^\/v1\/rooms\/[a-f0-9]{32}(?:\/(?:offer|answer))?$/.test(path.pathname)) return json({ error: 'Nicht gefunden.' }, 404, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!['GET', 'PUT', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Methode nicht erlaubt.' }, 405, cors);
    const key = request.headers.get('authorization');
    if (!/^Bearer [a-f0-9]{32}$/.test(key ?? '')) return json({ error: 'Einladung fehlt.' }, 401, cors);
    if (env.REQUEST_LIMITER && !(await env.REQUEST_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' })).success) return json({ error: 'Zu viele Anfragen.' }, 429, cors);
    try {
      const id = path.pathname.split('/')[3];
      const content = await body(request);
      const internal = new Request(request.url, { method: request.method, headers: { Authorization: key, 'Content-Type': 'application/json' }, ...(content === undefined ? {} : { body: JSON.stringify(content) }) });
      const response = await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(internal);
      const headers = new Headers(response.headers); Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    } catch (error) { return json({ error: error instanceof RoomError ? error.message : 'Verbindungsdienst nicht verfügbar.' }, error instanceof RoomError ? error.status : 503, cors); }
  },
};
