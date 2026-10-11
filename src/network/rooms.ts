import { readSignal } from './signals.js';
import type { GameId } from './protocol.js';

interface Peer {
  createInvitation(game: GameId, internet: boolean): Promise<string>;
  joinInvitation(code: string): Promise<string>;
  acceptAnswer(code: string): Promise<void>;
}
export interface RoomInvite { game: GameId; room: string; key: string }
const hex = '[a-f0-9]{32}';
export function readRoomInvite(raw: string): RoomInvite | null {
  if (raw.length > 2048) return null;
  let value = raw.trim();
  if (/^https?:\/\//.test(value)) {
    try { const url = new URL(value); value = new URLSearchParams(url.hash.replace(/^#(?:game|gruselino)\?/, '')).get('invite') ?? ''; } catch { return null; }
  }
  const match = new RegExp(`^GR1\\.(phase10|gruselino)\\.(${hex})\\.(${hex})$`).exec(value);
  return match ? { game: match[1] as GameId, room: match[2]!, key: match[3]! } : null;
}
export async function getServiceURL(): Promise<string | null> {
  const config = await import(new URL('./service.js', import.meta.url).href) as { SERVICE_URL: string | null };
  return config.SERVICE_URL;
}
const randomKey = (): string => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

export class RoomLink {
  private controller = new AbortController();
  constructor(private service: string, private peer: Peer, private onError: (message: string) => void) {
    const url = new URL(service);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Ungültiger Verbindungsdienst.');
    this.service = url.origin;
  }
  close(): void { this.controller.abort(); this.controller = new AbortController(); }
  private async request(path: string, key: string, method: string, body: unknown, signal: AbortSignal): Promise<Record<string, unknown>> {
    const timeout = new AbortController();
    const abort = (): void => timeout.abort();
    if (signal.aborted) throw new Error('Verbindung abgebrochen.');
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    try {
      let response: Response;
      try { response = await fetch(this.service + '/v1/rooms/' + path, {
        method, mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: timeout.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }); } catch { throw new Error(signal.aborted ? 'Verbindung abgebrochen.' : 'Der Verbindungsdienst ist nicht erreichbar. Bitte versuche es erneut oder nutze den Code-Modus.'); }
      if (!response.ok) {
        if (response.status === 404 || response.status === 410) throw new Error('Diese Einladung ist abgelaufen oder wurde beendet.');
        if (response.status === 409) throw new Error('Diese Einladung wird bereits verwendet. Bitte erstelle eine neue.');
        if (response.status === 429) throw new Error('Zu viele Verbindungsversuche. Bitte warte kurz.');
        throw new Error('Der Verbindungsdienst ist nicht erreichbar. Bitte versuche es erneut.');
      }
      const text = await response.text();
      if (text.length > 70000) throw new Error('Ungültige Antwort des Verbindungsdienstes.');
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Antwort des Verbindungsdienstes.');
      return value as Record<string, unknown>;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  async create(game: GameId, internet: boolean): Promise<string> {
    this.close(); const signal = this.controller.signal;
    const offer = await this.peer.createInvitation(game, internet);
    if (signal.aborted) throw new Error('Verbindung abgebrochen.');
    const room = randomKey(), host = randomKey(), guest = randomKey();
    await this.request(room, host, 'PUT', { offer, guest }, signal);
    void this.wait(room, host, readSignal(offer).expires, signal).catch(error => { if (!signal.aborted) this.onError(error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.'); });
    return `GR1.${game}.${room}.${guest}`;
  }
  private async wait(room: string, key: string, expires: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted && Date.now() < expires) {
      const value = await this.request(room + '/answer', key, 'GET', undefined, signal);
      if (signal.aborted) return;
      if (typeof value.answer === 'string') {
        await this.peer.acceptAnswer(value.answer);
        // Once the answer is installed, the WebRTC connection needs no service.
        await this.request(room, key, 'DELETE', undefined, signal).catch(() => {});
        return;
      }
      if (value.answer !== null) throw new Error('Ungültige Antwort des Verbindungsdienstes.');
      await new Promise<void>(resolve => {
        const done = (): void => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, 1500); signal.addEventListener('abort', done, { once: true });
        if (signal.aborted) done();
      });
    }
    if (!signal.aborted) throw new Error('Die Einladung ist abgelaufen. Bitte erstelle eine neue.');
  }
  async join(raw: string, game: GameId): Promise<void> {
    this.close(); const signal = this.controller.signal;
    const invite = readRoomInvite(raw);
    if (!invite || invite.game !== game) throw new Error('Diese Einladung gehört zu einem anderen Spiel.');
    const value = await this.request(invite.room + '/offer', invite.key, 'GET', undefined, signal);
    if (typeof value.offer !== 'string') throw new Error('Ungültige Einladung.');
    const offer = readSignal(value.offer);
    if (offer.game !== game || offer.type !== 'offer') throw new Error('Diese Einladung gehört zu einem anderen Spiel.');
    const answer = await this.peer.joinInvitation(value.offer);
    if (signal.aborted) throw new Error('Verbindung abgebrochen.');
    await this.request(invite.room + '/answer', invite.key, 'POST', { answer }, signal);
  }
}
