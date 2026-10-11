import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, readFrame, MAX_MESSAGE_BYTES } from '../public/app/network/protocol.js';
import { CounterHost, readCounter } from '../public/app/demo/counter.js';

const session = { id: 'ab'.repeat(16), game: 'phase10', expires: 1, internet: false };
const frame = { version: 1, session: session.id, game: session.game, role: 'guest', sequence: 2, kind: 'data', data: { type: 'increment', request: 1 } };

test('frames are tied to the protocol, session, game and remote role', () => {
  assert.deepEqual(readFrame(encodeFrame(frame), session, 'guest'), frame);
  for (const mutation of [{ version: 2 }, { session: 'cd'.repeat(16) }, { game: 'gruselino' }, { role: 'host' }, { sequence: 0 }, { sequence: 1.5 }, { kind: 'unknown' }]) assert.throws(() => readFrame(JSON.stringify({ ...frame, ...mutation }), session, 'guest'));
  assert.throws(() => readFrame(new ArrayBuffer(10), session, 'guest'));
  assert.throws(() => readFrame('{broken', session, 'guest'));
});

test('messages are bounded by UTF-8 bytes and cannot contain invalid JSON values', () => {
  assert.throws(() => encodeFrame({ ...frame, data: 'ä'.repeat(MAX_MESSAGE_BYTES / 2) }));
  assert.throws(() => readFrame(JSON.stringify({ ...frame, data: 'ä'.repeat(MAX_MESSAGE_BYTES / 2) }), session, 'guest'));
  assert.throws(() => readFrame('x'.repeat(MAX_MESSAGE_BYTES + 1), session, 'guest'));
  for (const data of [undefined, NaN, Infinity, () => 1, { invalid: undefined }]) assert.throws(() => encodeFrame({ ...frame, data }));
});

test('the host awards each request once and owns the shared counter', () => {
  const host = new CounterHost();
  assert(host.apply('guest', { type: 'increment', request: 1 }));
  assert.equal(host.apply('guest', { type: 'increment', request: 1 }), false);
  assert(host.apply('host', { type: 'increment', request: 1 }));
  assert.deepEqual(readCounter(host.snapshot()), { revision: 2, count: 2, last: 'host' });
  const before = host.snapshot();
  for (const message of [{ type: 'snapshot', count: 500 }, { type: 'increment', request: 3 }, { type: 'increment', request: -1 }]) assert.throws(() => host.apply('guest', message));
  assert.deepEqual(host.snapshot(), before);
  assert.throws(() => readCounter({ type: 'snapshot', revision: 1, count: 500, last: 'guest' }));
});
