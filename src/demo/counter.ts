import { isRecord, type Json, type Role } from '../network/protocol.js';

export interface Counter { revision: number; count: number; last: Role | null }
export const emptyCounter = (): Counter => ({ revision: 0, count: 0, last: null });
export function readCounter(value: Json): Counter {
  if (!isRecord(value) || value.type !== 'snapshot' || !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.count) || value.count !== value.revision || (value.count as number) < 0 || (value.count as number) > 1000000 || (value.last !== null && value.last !== 'host' && value.last !== 'guest') || ((value.count === 0) !== (value.last === null))) throw new Error('Ungültiger Zählerstand.');
  return { revision: value.revision as number, count: value.count as number, last: value.last as Role | null };
}
export class CounterHost {
  value: Counter = emptyCounter();
  private requests: Record<Role, number> = { host: 0, guest: 0 };
  apply(role: Role, message: Json): boolean {
    if (!isRecord(message) || message.type !== 'increment' || !Number.isSafeInteger(message.request) || (message.request as number) < 1 || (message.request as number) > 1000000) throw new Error('Ungültiger Testpunkt.');
    const request = message.request as number;
    if (request <= this.requests[role]) return false;
    if (request !== this.requests[role] + 1 || this.value.count >= 1000000) throw new Error('Der Testpunkt passt nicht zur Partie.');
    this.requests[role] = request;
    this.value = { revision: this.value.revision + 1, count: this.value.count + 1, last: role };
    return true;
  }
  snapshot(): Json { return { type: 'snapshot', ...this.value }; }
}
