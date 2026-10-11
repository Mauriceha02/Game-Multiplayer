import { isGame, isRecord, type Session } from './protocol.js';

const PREFIX = 'GM1.';
const MAX_CODE_LENGTH = 32 * 1024;
export const INVITATION_LIFETIME = 15 * 60 * 1000;
export interface Signal extends Session { version: 1; type: 'offer' | 'answer'; sdp: string }

export function encodeSignal(signal: Signal): string {
  const bytes = new TextEncoder().encode(JSON.stringify(signal));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  const code = PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (code.length > MAX_CODE_LENGTH) throw new Error('Der Verbindungscode ist zu groß.');
  return code;
}
export function readSignal(input: string, now = Date.now()): Signal {
  let code = input.trim();
  if (code.length > MAX_CODE_LENGTH + 2048) throw new Error('Der Verbindungscode ist zu groß.');
  if (/^https?:\/\//.test(code)) {
    const url = new URL(code);
    code = new URLSearchParams(url.hash.slice(1)).get('invite') ?? '';
  }
  if (code.length > MAX_CODE_LENGTH || !/^GM1\.[A-Za-z0-9_-]+$/.test(code)) throw new Error('Bitte füge einen vollständigen Verbindungscode ein.');
  let value: unknown;
  try {
    const binary = atob(code.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'));
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
  } catch { throw new Error('Der Verbindungscode ist beschädigt.'); }
  if (!isRecord(value) || value.version !== 1 || !['offer', 'answer'].includes(String(value.type)) || typeof value.id !== 'string' || !/^[a-f0-9]{32}$/.test(value.id) || !isGame(value.game) || typeof value.internet !== 'boolean' || !Number.isSafeInteger(value.expires) || typeof value.sdp !== 'string' || value.sdp.length > 20000 || !value.sdp.startsWith('v=0\r\n') || !/^m=application /m.test(value.sdp) || /^m=(?:audio|video) /m.test(value.sdp) || !/^a=candidate:/m.test(value.sdp)) throw new Error('Der Code enthält keine gültige Spieleverbindung.');
  if ((value.expires as number) <= now) throw new Error('Der Code ist abgelaufen. Bitte erstelle eine neue Einladung.');
  if ((value.expires as number) > now + INVITATION_LIFETIME + 60000) throw new Error('Die Uhrzeit der Geräte passt nicht zusammen.');
  return value as unknown as Signal;
}
export function matchAnswer(signal: Signal, session: Session): void {
  if (signal.type !== 'answer' || signal.id !== session.id || signal.game !== session.game || signal.expires !== session.expires || signal.internet !== session.internet) throw new Error('Diese Antwort gehört zu einer anderen Einladung.');
}
