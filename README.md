# Game-Multiplayer

WebRTC-Verbindung für Phase10 und Gruselino. `dist/` enthält den Verbindungstest, `bundle/` das gemeinsame Modul.

```sh
npm ci
npm run dev
```

Öffnen: http://localhost:5176. Prüfen: `npm test`. Build: `npm run build`.

Einladungslinks nutzen den [Cloudflare-Dienst](worker/README.md), dessen Adresse in `connection.json` steht. Ohne Internet bleibt der Code-Modus verfügbar. Einladungen gelten 15 Minuten; beide Geräte geöffnet lassen. Die optionale Internet-Hilfe nutzt Google STUN, ohne TURN-Relay.

Updates: zuerst dieses Repository pushen, dann die Commit-ID in Gruselinos `multiplayer.json` und anschließend Gruselinos Commit-ID in der Spiele-App aktualisieren.
