# Einladungsdienst

Cloudflare Worker mit kurzlebigen Einladungen für zwei Geräte. Nutzt SQLite-Durable-Objects aus dem Workers-Free-Tarif. Es wird kein kostenpflichtiger Tarif gebucht. Wenn das kostenlose Kontingent aufgebraucht ist, schlägt der Dienst fehl; der Code-Modus bleibt verfügbar. [Tarif und Grenzen](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Einmalig mit Node 22 oder neuer:

```sh
cd worker
npm ci
npm run login
npm run check
npm run deploy
```

Vorher im Game-Multiplayer-Hauptordner `npm ci` und `npm run build` ausführen. `check` prüft das Deployment lokal; `deploy` veröffentlicht im angemeldeten Cloudflare-Konto. Keinen temporären Vorschau-Account verwenden. Die ausgegebene `https://games-connect.<konto>.workers.dev`-Adresse in `../connection.json` unter `url` eintragen. Danach Modul testen, committen und pushen, seine Commit-ID in Gruselinos `multiplayer.json` aktualisieren und anschließend Gruselinos Commit-ID in der Spiele-App aktualisieren.

Die Herkunft `https://mauriceha02.github.io` ist freigegeben; `/Games/`, `/Phase10/` und `/Gruselino/` haben dieselbe Herkunft. Eine spätere eigene Domain muss in `wrangler.json` ergänzt werden. Lokal testen: `npm run dev -- --var ALLOWED_ORIGINS:http://localhost:5176`.

Der Dienst speichert ausschließlich WebRTC-Verbindungsdaten einschließlich Netzwerkadressen sowie getrennte zufällige Schlüssel für Gastgeber und Mitspieler. Keine Handkarten, Punkte oder Solospielstände. Zugriffe benötigen den jeweiligen Schlüssel; eine Antwort kann nicht überschrieben werden. Nach Übernahme der Antwort werden die Daten gelöscht, andernfalls nach spätestens 15 Minuten per Alarm. Einladungslinks berechtigen zum Beitritt und gehören nur an den gewünschten Mitspieler.

Anfragen sind in Größe und Häufigkeit begrenzt; Zugangsschlüssel stehen im Authorization-Header, nicht in der Dienst-URL. Worker-Logs sind deaktiviert. Die Herkunftsprüfung ergänzt die Zugangsschlüssel und ersetzt keine Anmeldung. Cloudflare verarbeitet die für den Betrieb nötigen Netzwerkdaten. Der Dienst verbessert den Beitritt; er ersetzt keinen TURN-Server für blockierte Direktverbindungen.
