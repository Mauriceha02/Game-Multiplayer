import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSignal, readSignal, matchAnswer, INVITATION_LIFETIME } from '../public/app/network/signals.js';

const now = 1780000000000;
const signal = { version: 1, id: 'ab'.repeat(16), game: 'gruselino', internet: false, expires: now + INVITATION_LIFETIME, type: 'offer', sdp: 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:1 1 UDP 2122260223 192.168.1.3 41230 typ host\r\n' };

test('invitation codes and links retain the session without a server request', () => {
  const code = encodeSignal(signal);
  assert.deepEqual(readSignal(code, now), signal);
  const link = new URL('https://example.test/Game-Multiplayer/');
  link.hash = new URLSearchParams({ invite: code }).toString();
  assert.equal(link.search, '');
  assert.deepEqual(readSignal(link.href, now), signal);
});

test('damaged, expired, oversized and unsupported invitations are rejected', () => {
  for (const input of ['', 'GM1.bad', 'GM1.' + 'a'.repeat(40000), 'javascript:alert(1)', '{}']) assert.throws(() => readSignal(input, now));
  for (const mutation of [
    { expires: now }, { expires: now + INVITATION_LIFETIME + 60001 }, { version: 2 }, { game: 'unknown' }, { internet: 'true' }, { id: 'bad' }, { type: 'data' },
    { sdp: signal.sdp + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }, { sdp: 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' },
  ]) assert.throws(() => readSignal(encodeSignal({ ...signal, ...mutation }), now));
});

test('only the answer to the same invitation is accepted', () => {
  const answer = { ...signal, type: 'answer' };
  assert.doesNotThrow(() => matchAnswer(answer, signal));
  for (const mutation of [{ id: 'cd'.repeat(16) }, { game: 'phase10' }, { expires: signal.expires + 1 }, { internet: true }, { type: 'offer' }]) assert.throws(() => matchAnswer({ ...answer, ...mutation }, signal));
});
