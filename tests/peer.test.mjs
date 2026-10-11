import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { LocalPeer } from '../public/app/network/peer.js';
import { PROTOCOL, encodeFrame } from '../public/app/network/protocol.js';
import { readSignal, encodeSignal } from '../public/app/network/signals.js';

const sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:1 1 UDP 2122260223 192.168.1.3 41230 typ host\r\n';
class Channel extends EventTarget {
  label = PROTOCOL; protocol = PROTOCOL; ordered = true; maxRetransmits = null; maxPacketLifeTime = null;
  readyState = 'connecting'; bufferedAmount = 0; messages = [];
  send(value) { this.messages.push(value); }
  close() { this.readyState = 'closed'; }
  open() { this.readyState = 'open'; this.dispatchEvent(new Event('open')); }
  receive(value) { const event = new Event('message'); event.data = value; this.dispatchEvent(event); }
}
let release = null;
let delay = false;
class Connection extends EventTarget {
  static instances = [];
  iceGatheringState = 'complete'; connectionState = 'new'; localDescription = null; channel = null;
  constructor(configuration) { super(); this.configuration = configuration; Connection.instances.push(this); }
  createDataChannel() { return this.channel = new Channel(); }
  async createOffer() { return { type: 'offer', sdp }; }
  async createAnswer() { return { type: 'answer', sdp }; }
  async setLocalDescription(value) { if (delay) await new Promise(resolve => { release = resolve; }); this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  close() { this.connectionState = 'closed'; }
}
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
globalThis.isSecureContext = true;
globalThis.RTCPeerConnection = Connection;

test('the peer confirms the session before delivery, ignores duplicates and rejects sequence gaps', async () => {
  const received = [];
  const peer = new LocalPeer({ onMessage: value => received.push(value) });
  const offer = readSignal(await peer.createInvitation('phase10'));
  const connection = Connection.instances.at(-1);
  assert.deepEqual(connection.configuration.iceServers, []);
  assert.throws(() => peer.send({ type: 'increment', request: 1 }));
  await assert.rejects(peer.acceptAnswer(encodeSignal({ ...offer, id: 'cd'.repeat(16), type: 'answer' })));
  assert.equal(peer.state, 'waiting');
  await peer.acceptAnswer(encodeSignal({ ...offer, type: 'answer' }));
  const channel = connection.channel;
  channel.open();
  const remote = { version: 1, session: offer.id, game: offer.game, role: 'guest', sequence: 1, kind: 'hello', data: null };
  channel.receive(encodeFrame(remote));
  assert.equal(peer.state, 'connected');
  peer.send({ type: 'snapshot', count: 0 });
  assert.equal(JSON.parse(channel.messages[1]).sequence, 2);
  const data = { ...remote, sequence: 2, kind: 'data', data: { type: 'increment', request: 1 } };
  channel.receive(encodeFrame(data)); channel.receive(encodeFrame(data));
  assert.deepEqual(received, [data.data]);
  channel.receive(encodeFrame({ ...data, sequence: 4 }));
  assert.equal(peer.state, 'failed');
  assert.equal(channel.readyState, 'closed');
  assert.equal(connection.connectionState, 'closed');
});

test('messages before the handshake close the connection', async () => {
  const peer = new LocalPeer();
  const offer = readSignal(await peer.createInvitation('gruselino', true));
  const connection = Connection.instances.at(-1);
  assert.equal(connection.configuration.iceServers[0].urls, 'stun:stun.l.google.com:19302');
  connection.channel.open();
  connection.channel.receive(encodeFrame({ version: 1, session: offer.id, game: offer.game, role: 'guest', sequence: 1, kind: 'data', data: null }));
  assert.equal(peer.state, 'failed');
});

test('cancelled preparation cannot revive a closed connection', async () => {
  delay = true;
  const peer = new LocalPeer();
  const pending = peer.createInvitation('phase10');
  await new Promise(resolve => setImmediate(resolve));
  const connection = Connection.instances.at(-1);
  peer.close(); release();
  await assert.rejects(pending);
  assert.equal(peer.state, 'closed');
  assert.equal(connection.connectionState, 'closed');
  delay = false;
});
