import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { RoomLink, readRoomInvite } from '../public/app/network/rooms.js';
import { encodeSignal } from '../public/app/network/signals.js';
import { RoomStore } from '../worker/room-store.mjs';

const sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:1 1 UDP 1 127.0.0.1 5000 typ host\r\n';
const hostKey = 'a'.repeat(32), guestKey = 'b'.repeat(32);
function signal(type, options = {}) { return encodeSignal({ version: 1, id: 'c'.repeat(32), game: 'phase10', internet: false, expires: Date.now() + 800000, type, sdp, ...options }); }
function storage() {
  let room = null, alarm = null;
  return { get: async () => room && structured(room), put: async (_key, value) => { room = structured(value); }, setAlarm: async value => { alarm = value; }, deleteAll: async () => { room = null; }, deleteAlarm: async () => { alarm = null; }, peek: () => ({ room, alarm }) };
}
const structured = value => JSON.parse(JSON.stringify(value));

test('room invitations are short, scoped to a game, and never accept an arbitrary server URL', () => {
  const raw = `GR1.phase10.${hostKey}.${guestKey}`;
  assert.equal(raw.length, 77);
  assert.deepEqual(readRoomInvite(raw), { game: 'phase10', room: hostKey, key: guestKey });
  for (const path of ['/Games/', '/Phase10/', '/']) assert.equal(readRoomInvite(`https://example.test${path}#game?invite=${raw}`).game, 'phase10');
  assert.equal(readRoomInvite(`https://example.test/Gruselino/#gruselino?invite=GR1.gruselino.${hostKey}.${guestKey}`).game, 'gruselino');
  for (const raw of ['', 'GR1.phase10.short.key', `GR1.chess.${hostKey}.${guestKey}`, `GR1.phase10.${hostKey}.${guestKey}.extra`]) assert.equal(readRoomInvite(raw), null);
  for (const url of ['http://evil.test', 'https://evil.test/path', 'https://user:pass@evil.test', 'https://evil.test/?token=x']) assert.throws(() => new RoomLink(url, {}, () => {}));
});

test('the service separates host and guest rights and validates the answer before storing it', async () => {
  const data = storage(), store = new RoomStore(data);
  const expires = Date.now() + 800000;
  const offer = signal('offer', { expires }), answer = signal('answer', { expires });
  await store.handle('PUT', '', hostKey, { offer, guest: guestKey });
  assert.equal(data.peek().alarm, expires);
  assert.deepEqual(await store.handle('GET', 'answer', hostKey), { answer: null });
  assert.deepEqual(await store.handle('GET', 'offer', guestKey), { offer });
  for (const [method, resource, key, body] of [['GET','answer',guestKey],['GET','offer',hostKey],['DELETE','',guestKey],['POST','answer',hostKey,{answer}],['GET','offer','d'.repeat(32)]]) await assert.rejects(store.handle(method, resource, key, body), error => error.status === 403);
  for (const bad of [signal('offer', { expires }), signal('answer', { expires, game: 'gruselino' }), signal('answer', { expires, id: 'd'.repeat(32) }), 'broken']) await assert.rejects(store.handle('POST', 'answer', guestKey, { answer: bad }), error => error.status === 400);
  await store.handle('POST', 'answer', guestKey, { answer });
  assert.deepEqual(await store.handle('GET', 'answer', hostKey), { answer });
  await assert.rejects(store.handle('POST', 'answer', guestKey, { answer }), error => error.status === 409);
  await assert.rejects(store.handle('GET', 'offer', guestKey), error => error.status === 409);
  await assert.rejects(store.handle('PUT', '', hostKey, { offer, guest: guestKey }), error => error.status === 409);
  await store.handle('DELETE', '', hostKey);
  assert.deepEqual(data.peek(), { room: null, alarm: null });
  await assert.rejects(store.handle('GET', 'answer', hostKey), error => error.status === 410);
});

test('expired rooms erase signals and role credentials; malformed offers are rejected', async () => {
  const data = storage(), store = new RoomStore(data), now = Date.now();
  for (const body of [{ offer: signal('answer'), guest: guestKey }, { offer: signal('offer'), guest: hostKey }, { offer: 'x'.repeat(35000), guest: guestKey }]) await assert.rejects(store.handle('PUT', '', hostKey, body), error => error.status === 400);
  await store.handle('PUT', '', hostKey, { offer: signal('offer', { expires: now + 1000 }), guest: guestKey }, now);
  await assert.rejects(store.handle('GET', 'offer', guestKey, undefined, now + 1001), error => error.status === 410);
  assert.deepEqual(data.peek(), { room: null, alarm: null });
});

test('one shared link exchanges both signals automatically, while cancelled hosts stop polling', async () => {
  const previous = { fetch: globalThis.fetch, crypto: Object.getOwnPropertyDescriptor(globalThis, 'crypto') };
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  const stores = new Map(), requests = [];
  let done; const accepted = new Promise(resolve => { done = resolve; });
  const expires = Date.now() + 800000;
  const offer = signal('offer', { expires }), answer = signal('answer', { expires });
  globalThis.fetch = async (url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.redirect, 'error');
    const [, id, resource = ''] = /\/rooms\/([^/]+)(?:\/(.*))?$/.exec(url);
    if (!stores.has(id)) stores.set(id, new RoomStore(storage()));
    requests.push({ method: options.method, id, resource });
    try { const value = await stores.get(id).handle(options.method, resource, options.headers.Authorization.slice(7), options.body && JSON.parse(options.body)); return { ok: true, status: 200, text: async () => JSON.stringify(value) }; }
    catch (error) { return { ok: false, status: error.status }; }
  };
  const errors = [];
  const host = new RoomLink('https://games-connect.example.workers.dev', { createInvitation: async () => offer, acceptAnswer: async value => { assert.equal(value, answer); done(); } }, message => errors.push(message));
  const guest = new RoomLink('https://games-connect.example.workers.dev', { joinInvitation: async value => { assert.equal(value, offer); return answer; } }, message => errors.push(message));
  try {
    const invite = await host.create('phase10', false);
    await guest.join(invite, 'phase10'); await accepted;
    await new Promise(resolve => setTimeout(resolve, 20));
    assert(requests.some(request => request.method === 'DELETE'));
    await assert.rejects(guest.join(invite, 'gruselino'), /anderen Spiel/);
    host.close(); guest.close();
    const next = await host.create('phase10', false); host.close();
    const count = requests.length; await new Promise(resolve => setTimeout(resolve, 1600)); assert.equal(requests.length, count);
    assert(readRoomInvite(next)); assert.deepEqual(errors, []);
  } finally { host.close(); guest.close(); globalThis.fetch = previous.fetch; if (previous.crypto) Object.defineProperty(globalThis, 'crypto', previous.crypto); else delete globalThis.crypto; }
});
