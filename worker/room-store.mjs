import { readSignal, matchAnswer } from '../public/app/network/signals.js';

export class RoomError extends Error { constructor(status, message) { super(message); this.status = status; } }
const invalid = () => { throw new RoomError(400, 'Ungültige Anfrage.'); };
const keyOK = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export class RoomStore {
  constructor(storage) { this.storage = storage; }
  async handle(method, resource, key, body, now = Date.now()) {
    if (!keyOK(key)) throw new RoomError(401, 'Einladung fehlt.');
    let room = await this.storage.get('room');
    if (room && room.expires <= now) { await this.erase(); room = null; }
    if (method === 'PUT' && resource === '') {
      if (room) throw new RoomError(409, 'Einladung existiert bereits.');
      if (!body || typeof body.offer !== 'string' || body.offer.length > 34816 || !keyOK(body.guest) || key === body.guest) invalid();
      let offer; try { offer = readSignal(body.offer, now); } catch { invalid(); }
      if (offer.type !== 'offer') invalid();
      room = { host: key, guest: body.guest, expires: offer.expires, offer: body.offer, answer: null };
      await this.storage.put('room', room); await this.storage.setAlarm(room.expires);
      return { expires: room.expires };
    }
    if (!room) throw new RoomError(410, 'Einladung beendet.');
    const host = key === room.host, guest = key === room.guest;
    if (!host && !guest) throw new RoomError(403, 'Einladung ungültig.');
    if (method === 'GET' && resource === 'offer' && guest) {
      if (room.answer !== null) throw new RoomError(409, 'Einladung wird bereits verwendet.');
      return { offer: room.offer };
    }
    if (method === 'GET' && resource === 'answer' && host) return { answer: room.answer };
    if (method === 'POST' && resource === 'answer' && guest) {
      if (!body || typeof body.answer !== 'string' || body.answer.length > 34816) invalid();
      if (room.answer !== null) throw new RoomError(409, 'Einladung wird bereits verwendet.');
      try { matchAnswer(readSignal(body.answer, now), readSignal(room.offer, now)); } catch { invalid(); }
      room.answer = body.answer; await this.storage.put('room', room);
      return { accepted: true };
    }
    if (method === 'DELETE' && resource === '' && host) { await this.erase(); return { closed: true }; }
    throw new RoomError(403, 'Aktion nicht erlaubt.');
  }
  async erase() { await this.storage.deleteAll(); await this.storage.deleteAlarm(); }
}
