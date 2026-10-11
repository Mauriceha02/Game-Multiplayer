# Game-Multiplayer

Gemeinsame Verbindung für Phase10 und Gruselino. Der erste Stand ist ein Verbindungstest für zwei Geräte mit gemeinsamem Zähler; die Spiele werden danach angebunden.

`npm ci` → `npm run dev` → http://localhost:5176. Prüfen: `npm test`.
`npm run build` erzeugt `dist/` für GitHub Pages und `bundle/` als wiederverwendbares Netzwerkmodul.

Auf beiden Handys dieselbe HTTPS-Testseite öffnen: Einladung erstellen und teilen, auf dem zweiten Handy beitreten, Antwortcode zurückgeben und im ursprünglichen Fenster einfügen. Dann auf beiden Geräten einen Testpunkt senden. Die Verbindung bleibt nur bestehen, solange die Browser sie offen halten.

Standardmäßig wird nur die direkte Verbindung im WLAN versucht. Die optionale Internet-Hilfe nutzt Googles STUN-Dienst zur Ermittlung von Verbindungswegen; sie überträgt keine Testpunkte. Keine Konten, kein eigener Server, kein TURN-Relay und keine gespeicherten Einladungen. Verbindungscodes laufen nach 15 Minuten ab. WLANs mit Gerätesperren können direkte Verbindungen verhindern; zwei echte iPhones müssen separat geprüft werden.

Veröffentlichen: GitHub Pages auf **GitHub Actions** stellen und `Dev` pushen. Falls die Umgebung `github-pages` Branches einschränkt, `Dev` freigeben. Der Workflow prüft und veröffentlicht die Testseite. [Planung](PLAN.md).
