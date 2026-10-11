import { LocalPeer, type State } from '../network/peer.js';
import { readSignal } from '../network/signals.js';
import { type GameId, type Json } from '../network/protocol.js';
import { CounterHost, emptyCounter, readCounter } from './counter.js';
import { setupOffline } from './offline.js';

setupOffline();
const element = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Fehlendes Element: ${id}`);
  return node as T;
};
const create = element<HTMLFormElement>('create');
const join = element<HTMLFormElement>('join');
const answer = element<HTMLFormElement>('answer');
const outgoing = element<HTMLTextAreaElement>('outgoing-code');
const incoming = element<HTMLTextAreaElement>('incoming-code');
const reply = element<HTMLTextAreaElement>('answer-code');
let host = new CounterHost();
let counter = emptyCounter();
let requests = 0;
let outgoingCode = '';
let busy = false;
let operation = 0;
let connectionRole: 'host' | 'guest' | null = null;
let chosenGame: GameId = 'phase10';
let inviteLink = '';
let invited = false;
let pendingInvite: string | null = null;

const peer = new LocalPeer({
  onState: (state, message) => {
    const labels: Record<State, string> = { idle: 'Noch nicht verbunden', preparing: 'Verbindung vorbereiten …', waiting: 'Warte auf den Mitspieler', connecting: 'Handys verbinden …', connected: 'Verbunden', interrupted: 'Verbindung unterbrochen', failed: 'Nicht verbunden', closed: 'Verbindung beendet' };
    element('connection-status').textContent = message || labels[state];
    element('connection-status').dataset.state = state;
    element<HTMLButtonElement>('increment').disabled = state !== 'connected';
    element('connected-panel').hidden = !['connected', 'interrupted'].includes(state);
    element('disconnect').hidden = ['idle', 'closed', 'failed'].includes(state);
    if (state === 'connected') {
      element('setup').hidden = true;
      element('exchange').hidden = true;
      element('session-game').textContent = chosenGame === 'phase10' ? 'Phase10' : 'Gruselino';
      element('your-role').textContent = peer.role === 'host' ? 'Du hast eingeladen.' : 'Du bist beigetreten.';
      if (peer.role === 'host') peer.send(host.snapshot());
    }
    if (state === 'failed' || state === 'closed') {
      operation++; busy = false; connectionRole = null; outgoingCode = ''; inviteLink = '';
      outgoing.value = ''; reply.value = ''; incoming.value = '';
      element('exchange').hidden = true; element('setup').hidden = false;
      element('notice').textContent = state === 'failed' ? 'Erstelle eine neue Einladung oder tritt erneut bei.' : '';
      controls();
    }
  },
  onMessage: message => {
    if (peer.role === 'host') {
      if (host.apply('guest', message)) { counter = host.value; peer.send(host.snapshot()); drawCounter(); }
    } else {
      const next = readCounter(message);
      if (next.revision >= counter.revision) { counter = next; drawCounter(); }
    }
  },
});

function controls(): void {
  create.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('button,select,input').forEach(input => { input.disabled = busy; });
  join.querySelector<HTMLButtonElement>('button')!.disabled = busy;
  answer.querySelector<HTMLButtonElement>('button')!.disabled = busy;
  element<HTMLButtonElement>('copy').disabled = !outgoingCode || busy;
  element<HTMLButtonElement>('share').disabled = !outgoingCode || busy;
}
function drawCounter(): void {
  element('counter').textContent = String(counter.count);
  element('last-point').textContent = counter.last ? `Letzter Testpunkt: ${counter.last === peer.role ? 'du' : 'dein Mitspieler'}.` : 'Schicke den ersten Testpunkt.';
}
function showExchange(code: string, role: 'host' | 'guest'): void {
  outgoingCode = code; outgoing.value = code;
  element('setup').hidden = true; element('exchange').hidden = false;
  element('exchange-title').textContent = role === 'host' ? 'Einladung teilen' : 'Antwort zurückgeben';
  element('exchange-help').textContent = role === 'host' ? 'Schicke die Einladung an dein zweites Handy. Dein Mitspieler tritt bei und gibt dir seinen Antwortcode zurück.' : 'Schicke diesen Antwortcode an den Gastgeber. Er fügt ihn im ursprünglichen Fenster ein. Lass dieses Fenster danach geöffnet.';
  answer.hidden = role !== 'host';
  element('outgoing-label').textContent = role === 'host' ? 'Dein Einladungscode' : 'Dein Antwortcode';
}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  const token = ++operation;
  busy = true; controls(); element('notice').textContent = '';
  try { await action(); }
  catch (error) { if (token === operation) element('notice').textContent = error instanceof Error ? error.message : 'Das hat nicht geklappt. Bitte erneut versuchen.'; }
  finally { if (token === operation) { busy = false; controls(); } }
}
function fresh(role: 'host' | 'guest'): void {
  host = new CounterHost(); counter = emptyCounter(); requests = 0; connectionRole = role; drawCounter();
}
create.addEventListener('submit', event => {
  event.preventDefault();
  void run(async () => {
    chosenGame = element<HTMLSelectElement>('game').value as GameId;
    fresh('host');
    const code = await peer.createInvitation(chosenGame, element<HTMLInputElement>('internet').checked);
    showExchange(code, 'host');
    const url = new URL('./', document.baseURI); url.hash = new URLSearchParams({ invite: code }).toString(); inviteLink = url.href;
  });
});
join.addEventListener('submit', event => {
  event.preventDefault();
  void run(async () => {
    const signal = readSignal(incoming.value);
    if (signal.type !== 'offer') throw new Error('Zum Beitreten brauchst du eine Einladung, keinen Antwortcode.');
    chosenGame = signal.game; fresh('guest');
    showExchange(await peer.joinInvitation(incoming.value), 'guest');
  });
});
answer.addEventListener('submit', event => { event.preventDefault(); void run(async () => { await peer.acceptAnswer(reply.value); }); });
element('disconnect').addEventListener('click', () => { peer.close(); });
element('increment').addEventListener('click', () => {
  try {
    const message: Json = { type: 'increment', request: requests + 1 };
    if (peer.role === 'host') { host.apply('host', message); counter = host.value; peer.send(host.snapshot()); drawCounter(); }
    else peer.send(message);
    requests++;
  } catch (error) { element('notice').textContent = error instanceof Error ? error.message : 'Testpunkt konnte nicht gesendet werden.'; }
});
element('copy').addEventListener('click', () => {
  void (async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(outgoingCode);
      else { outgoing.focus(); outgoing.select(); if (!document.execCommand('copy')) throw new Error(); }
      element('notice').textContent = 'Code kopiert.';
    } catch { outgoing.focus(); outgoing.select(); element('notice').textContent = 'Halte den markierten Code gedrückt und wähle „Kopieren“.'; }
  })();
});
element('share').addEventListener('click', () => {
  void (async () => {
    if (!navigator.share) { element('copy').click(); return; }
    try {
      await navigator.share(connectionRole === 'host' ? { title: 'Zusammen spielen', url: inviteLink } : { title: 'Antwortcode für die Einladung', text: outgoingCode });
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) element('notice').textContent = 'Teilen hat nicht geklappt. Du kannst den Code kopieren.'; }
  })();
});
window.addEventListener('pagehide', event => { if (!event.persisted) peer.close(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && peer.state === 'connected') element('notice').textContent = 'Lass beide Geräte geöffnet, damit die Verbindung bestehen bleibt.'; });

function receiveInvitation(invite: string): void {
  try {
    const signal = readSignal(invite);
    if (signal.type !== 'offer') throw new Error('Zum Beitreten brauchst du eine Einladung.');
    if (!['idle', 'closed', 'failed'].includes(peer.state)) {
      pendingInvite = invite;
      element('notice').textContent = 'Du hast bereits eine Einladung oder Verbindung geöffnet. Wähle „Neu beginnen“, um zur neuen Einladung zu wechseln.';
      return;
    }
    incoming.value = invite;
    chosenGame = signal.game;
    element('join-title').textContent = `${signal.game === 'phase10' ? 'Phase10' : 'Gruselino'}: Einladung erhalten`;
    invited = true;
    create.hidden = true;
    element('join').scrollIntoView({ block: 'center' });
  } catch (error) { element('notice').textContent = error instanceof Error ? error.message : 'Einladung konnte nicht geöffnet werden.'; }
}
function receiveLink(): void {
  const invite = new URLSearchParams(window.location.hash.slice(1)).get('invite');
  if (!invite) return;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  receiveInvitation(invite);
}
window.addEventListener('hashchange', receiveLink);
receiveLink();
element('new-invitation').addEventListener('click', () => {
  peer.close(); create.hidden = false;
  if (invited) { invited = false; element('join-title').textContent = 'Einladung annehmen'; }
  if (pendingInvite) { const invite = pendingInvite; pendingInvite = null; receiveInvitation(invite); }
});
controls(); drawCounter();
