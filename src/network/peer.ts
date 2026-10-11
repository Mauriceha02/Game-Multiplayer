import { PROTOCOL, encodeFrame, readFrame, type Session, type GameId, type Role, type Json } from './protocol.js';
import { INVITATION_LIFETIME, encodeSignal, readSignal, matchAnswer } from './signals.js';

export type State = 'idle' | 'preparing' | 'waiting' | 'connecting' | 'connected' | 'interrupted' | 'failed' | 'closed';
export interface PeerOptions { onState?(state: State, message: string): void; onMessage?(message: Json): void }

export class LocalPeer {
  state: State = 'idle';
  role: Role | null = null;
  session: Session | null = null;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private generation = 0;
  private events: AbortController | null = null;
  private sent = 0;
  private received = 0;
  private welcomed = false;
  private answerAccepted = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: PeerOptions = {}) {}
  private update(state: State, message = ''): void {
    this.state = state;
    this.options.onState?.(state, message);
  }
  private start(session: Session, role: Role): RTCPeerConnection {
    this.dispose();
    if (!globalThis.isSecureContext || typeof RTCPeerConnection !== 'function') throw new Error('Bitte öffne die Testseite über HTTPS oder auf dem Mac über localhost.');
    this.session = session; this.role = role;
    this.events = new AbortController();
    const peer = this.peer = new RTCPeerConnection({ iceServers: session.internet ? [{ urls: 'stun:stun.l.google.com:19302' }] : [] });
    const token = this.generation;
    peer.addEventListener('connectionstatechange', () => {
      if (token !== this.generation) return;
      if (peer.connectionState === 'failed') this.fail('Keine direkte Verbindung möglich. Prüfe WLAN und Internet-Hilfe; ein Gastnetz kann Geräte voneinander trennen.');
      else if (peer.connectionState === 'disconnected') this.update('interrupted', 'Verbindung unterbrochen. Lass beide Geräte geöffnet.');
      else if (peer.connectionState === 'connected' && this.welcomed && this.channel?.readyState === 'open') this.update('connected');
    }, { signal: this.events.signal });
    peer.addEventListener('datachannel', event => {
      if (token !== this.generation) { event.channel.close(); return; }
      if (this.role !== 'guest' || this.channel) { event.channel.close(); return; }
      this.bind(event.channel);
    }, { signal: this.events.signal });
    this.update('preparing');
    return peer;
  }
  private bind(channel: RTCDataChannel): void {
    if (channel.label !== PROTOCOL || channel.protocol !== PROTOCOL || !channel.ordered || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) { channel.close(); this.fail('Die Gegenstelle nutzt eine andere Verbindung.'); return; }
    this.channel = channel;
    const signal = this.events!.signal;
    channel.addEventListener('open', () => {
      this.sendFrame('hello', null);
    }, { signal });
    channel.addEventListener('message', event => {
      try {
        const frame = readFrame(event.data, this.session!, this.role === 'host' ? 'guest' : 'host');
        if (frame.sequence <= this.received) return;
        if (frame.sequence !== this.received + 1) throw new Error('Nachrichtenreihenfolge stimmt nicht.');
        this.received = frame.sequence;
        if (frame.kind === 'hello') {
          if (this.welcomed || frame.sequence !== 1 || frame.data !== null) throw new Error('Ungültige Begrüßung.');
          this.welcomed = true;
          this.stopConnectTimer();
          this.update('connected');
        } else {
          if (!this.welcomed) throw new Error('Gegenstelle hat die Partie noch nicht bestätigt.');
          this.options.onMessage?.(frame.data);
        }
      } catch { this.fail('Die Gegenstelle hat ungültige Daten geschickt. Bitte neu verbinden.'); }
    }, { signal });
    channel.addEventListener('close', () => this.fail('Die Verbindung wurde geschlossen. Bitte neu verbinden.'), { signal });
    channel.addEventListener('error', () => this.fail('Die Verbindung ist fehlgeschlagen. Bitte neu verbinden.'), { signal });
  }
  private async gather(peer: RTCPeerConnection, token: number): Promise<void> {
    if (token !== this.generation || !this.events) throw new Error('Verbindung abgebrochen.');
    if (peer.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
      const events = new AbortController();
      const signal = this.events!.signal;
      const finish = (error?: Error): void => { clearTimeout(timer); events.abort(); signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(); };
      const cancel = (): void => finish(new Error('Verbindung abgebrochen.'));
      const timer = setTimeout(() => finish(new Error('Die Verbindungsvorbereitung dauert zu lange. Bitte erneut versuchen.')), 20000);
      signal.addEventListener('abort', cancel, { once: true });
      peer.addEventListener('icegatheringstatechange', () => { if (peer.iceGatheringState === 'complete') finish(); }, { signal: events.signal });
    });
    if (token !== this.generation) throw new Error('Verbindung abgebrochen.');
    if (!/^a=candidate:/m.test(peer.localDescription?.sdp ?? '')) throw new Error('Dein Browser hat keinen Verbindungsweg gefunden. Versuche es mit der Internet-Hilfe.');
  }
  async createInvitation(game: GameId, internet = false): Promise<string> {
    if (game !== 'phase10' && game !== 'gruselino') throw new Error('Unbekanntes Spiel.');
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const session: Session = { id, game, internet, expires: Date.now() + INVITATION_LIFETIME };
    const peer = this.start(session, 'host');
    const token = this.generation;
    try {
      this.bind(peer.createDataChannel(PROTOCOL, { ordered: true, protocol: PROTOCOL }));
      await peer.setLocalDescription(await peer.createOffer());
      await this.gather(peer, token);
      const code = encodeSignal({ ...session, version: 1, type: 'offer', sdp: peer.localDescription!.sdp });
      this.update('waiting');
      return code;
    } catch (error) { if (token === this.generation) this.fail(error instanceof Error ? error.message : 'Einladung fehlgeschlagen.'); throw error; }
  }
  async joinInvitation(raw: string): Promise<string> {
    const invitation = readSignal(raw);
    if (invitation.type !== 'offer') throw new Error('Zum Beitreten brauchst du den Einladungscode.');
    const session: Session = { id: invitation.id, game: invitation.game, internet: invitation.internet, expires: invitation.expires };
    const peer = this.start(session, 'guest');
    const token = this.generation;
    try {
      await peer.setRemoteDescription({ type: 'offer', sdp: invitation.sdp });
      await peer.setLocalDescription(await peer.createAnswer());
      await this.gather(peer, token);
      const code = encodeSignal({ ...session, version: 1, type: 'answer', sdp: peer.localDescription!.sdp });
      this.update('waiting');
      return code;
    } catch (error) { if (token === this.generation) this.fail(error instanceof Error ? error.message : 'Beitritt fehlgeschlagen.'); throw error; }
  }
  async acceptAnswer(raw: string): Promise<void> {
    if (this.role !== 'host' || !this.peer || !this.session || this.answerAccepted) throw new Error('Bitte füge die Antwort in der ursprünglichen Einladung ein.');
    const answer = readSignal(raw);
    matchAnswer(answer, this.session);
    const token = this.generation;
    await this.peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
    if (token !== this.generation) return;
    this.answerAccepted = true;
    this.update('connecting');
    this.connectTimer = setTimeout(() => { if (token === this.generation && !this.welcomed) this.fail('Die Handys konnten sich nicht verbinden. Öffne beide Fenster; versuche bei Bedarf eine neue Einladung mit Internet-Hilfe.'); }, 25000);
  }
  send(data: Json): void {
    if (this.state !== 'connected' || !this.welcomed) throw new Error('Die Verbindung ist noch nicht bereit.');
    this.sendFrame('data', data);
  }
  private sendFrame(kind: 'hello' | 'data', data: Json): void {
    if (!this.session || !this.role || this.channel?.readyState !== 'open') throw new Error('Die Verbindung ist geschlossen.');
    if (this.channel.bufferedAmount > 64 * 1024) throw new Error('Die Verbindung ist beschäftigt. Bitte kurz warten.');
    const raw = encodeFrame({ version: 1, session: this.session.id, game: this.session.game, role: this.role, sequence: this.sent + 1, kind, data });
    this.channel.send(raw); this.sent++;
  }
  private stopConnectTimer(): void { if (this.connectTimer !== null) clearTimeout(this.connectTimer); this.connectTimer = null; }
  private fail(message: string): void { this.dispose(); this.update('failed', message); }
  private dispose(): void {
    this.generation++;
    this.stopConnectTimer();
    this.events?.abort(); this.events = null;
    this.channel?.close(); this.channel = null;
    this.peer?.close(); this.peer = null;
    this.session = null; this.role = null;
    this.sent = 0; this.received = 0; this.welcomed = false; this.answerAccepted = false;
  }
  close(): void { this.dispose(); this.update('closed'); }
}
