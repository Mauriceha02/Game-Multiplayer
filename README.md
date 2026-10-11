# Game-Multiplayer

Gemeinsame WebRTC-Verbindung für Phase10 und Gruselino. `dist/` enthält einen Verbindungstest; `bundle/` liefert das Modul für die Spiele.

`npm ci` → `npm run dev` → http://localhost:5176. Prüfen: `npm test`. Bauen: `npm run build`.

Einladungslinks: Der optionale [Cloudflare-Dienst](worker/README.md) tauscht Einladung und Antwort automatisch aus. Seine HTTPS-Adresse steht in `connection.json`; mit `null` bleibt der bisherige Code-Modus aktiv. Spieler benötigen kein Konto. Einladungen und Verbindungsdaten werden spätestens nach 15 Minuten gelöscht; laufende Spiele nutzen den Dienst nicht.

Ohne Dienst: Auf beiden Geräten dieselbe HTTPS-Seite öffnen, Einladung erstellen, beitreten und den Antwortcode beim Gastgeber einfügen. Die Code-Verbindung funktioniert auch ohne Internet, wenn die App bereits offline gespeichert ist.

Die optionale Internet-Hilfe nutzt Googles STUN-Dienst. Es gibt kein TURN-Relay; verschiedene Netze sind nicht überall erreichbar. Beide Fenster geöffnet lassen. Die Spielstände verbleiben in den jeweiligen Spielen.

GitHub Pages auf **GitHub Actions** stellen, `Dev` in `github-pages` freigeben und pushen. Das veröffentlicht den Verbindungstest, nicht den Cloudflare-Dienst.
