export const PROTOCOL = 'game-multiplayer-v1';
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_MESSAGES_PER_SECOND = 64;
export type GameId = 'phase10' | 'gruselino';
export type Role = 'host' | 'guest';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Session { id: string; game: GameId; expires: number; internet: boolean }
export interface Frame { version: 1; session: string; game: GameId; role: Role; sequence: number; kind: 'hello' | 'data'; data: Json }

export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const isGame = (value: unknown): value is GameId => value === 'phase10' || value === 'gruselino';
export function isJson(value: unknown, depth = 0): value is Json {
  if (depth > 16) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every(item => isJson(item, depth + 1));
  return isRecord(value) && Object.keys(value).length <= 1000 && Object.values(value).every(item => isJson(item, depth + 1));
}
export function encodeFrame(frame: Frame): string {
  if (!isJson(frame.data)) throw new Error('Ungültige Nachricht.');
  const raw = JSON.stringify(frame);
  if (new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) throw new Error('Die Nachricht ist zu groß.');
  return raw;
}
export function readFrame(raw: unknown, session: Session, remote: Role): Frame {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES || new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) throw new Error('Ungültige Nachricht.');
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || value.session !== session.id || value.game !== session.game || value.role !== remote || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1 || !['hello', 'data'].includes(String(value.kind)) || !isJson(value.data)) throw new Error('Die Nachricht gehört nicht zu dieser Verbindung.');
  return value as unknown as Frame;
}
