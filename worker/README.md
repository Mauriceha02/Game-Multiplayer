# Einladungsdienst

Cloudflare Worker zum Austausch kurzlebiger WebRTC-Verbindungsdaten. Keine Handkarten, Punkte oder Spielstände; getrennte Zugangsschlüssel für Gastgeber und Gast. Nach Antwortübernahme oder Ablauf werden Einladungen gelöscht. Links nur an den gewünschten Mitspieler weitergeben.

Zuerst im Hauptordner `npm ci` und `npm run build`, danach mit Node 22 oder neuer:

```sh
cd worker
npm ci
npm run login
npm run check
npm run deploy
```

Die ausgegebene HTTPS-Adresse gehört in `../connection.json`. Erlaubte Website-Herkünfte stehen in `wrangler.json`; Worker-Logs sind deaktiviert. Änderungen am Dienst brauchen ein eigenes Deployment.

Der kostenlose Tarif hat [Nutzungsgrenzen](https://developers.cloudflare.com/durable-objects/platform/pricing/). Bei Ausfall bleibt der Code-Modus verfügbar. Der Dienst vermittelt den Beitritt; die Partie läuft direkt zwischen den Geräten.
