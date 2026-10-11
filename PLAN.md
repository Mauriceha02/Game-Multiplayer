# Multiplayer

## Erster Schritt

Zwei Geräte verbinden, dieselbe Partie erkennen und einen gemeinsamen Testzähler anzeigen. Einladungs- und Antwortcode manuell austauschen; keine Anmeldung und kein eigener Vermittlungsserver. Das ist ein Verbindungstest, noch kein Mehrspielermodus der Spiele.

- `src/network/`: Verbindungscodes, geprüfte Nachrichten und WebRTC-Datenkanal.
- `src/demo/`: Testoberfläche und gemeinsamer Zähler.
- `public/`: eigene Symbole; `scripts/`: Build; `tests/`: Prüfungen.
- `bundle/`: erzeugtes Modul für spätere Einbindung; nicht ins Repository übernehmen.

## Verbindung

Ein Gastgeber erzeugt eine zufällige Sitzung und wählt das Spiel. Der Gast übernimmt Sitzung und Spiel aus der Einladung. Beide tauschen vollständig gesammelte Verbindungsdaten aus. Einladung und Antwort gelten 15 Minuten; eine Antwort für eine andere Sitzung wird zurückgewiesen. Codes dürfen nur an den gewünschten Mitspieler gehen.

WLAN-Verbindung ohne externe ICE-Server ist die Vorgabe. Optional kann der Gastgeber einen STUN-Dienst für zusätzliche Verbindungswege einschalten. Das hilft nicht in jedem Netz; ohne TURN gibt es keine Verbindungsgarantie. Kamera und Mikrofon werden nicht angefragt. Browser- und Routerverhalten auf zwei echten iPhones prüfen, einschließlich Heim-WLAN und Rückkehr aus dem Hintergrund. Beim Abbruch neu verbinden; automatische Wiederaufnahme folgt mit den Spielen.

Geordneter, zuverlässiger Datenkanal. Beide Seiten bestätigen Protokoll, Spiel, Rolle und Sitzung, bevor Anwendungsnachrichten erlaubt werden. Nachrichten haben fortlaufende Nummern und eine Größenbegrenzung von 16 KiB. Doppelte Nachrichten bleiben wirkungslos; fremde Sitzungen, ungültige Daten und falsche Reihenfolgen schließen die Verbindung. Spielmodule müssen zusätzlich jede Aktion nach ihren Regeln prüfen.

## Danach

1. Gruselino: Gastgeber deckt auf; beide bestätigen die geladene Karte vor dem gemeinsamen Start. Antworten an den Gastgeber senden, pro Karte nur einen Gewinn vergeben. Netzverzögerung bei der Gewinnerentscheidung berücksichtigen; keine perfekte Zeitgleichheit behaupten.
2. Phase10: mehrere menschliche Controller zulassen. Gastgeber hält Stapel und vollständigen Zustand; Gäste bekommen nur öffentliche Daten und die eigene Hand. Jede Aktion gegen Spieler, Zug und aktuelle Zustandsnummer prüfen.
3. Gemeinsamer Startbildschirm mit Erstellen/Beitreten, Verbindungsstatus und Wiederaufnahme. Lokale Solospielstände getrennt halten.

Die bestehenden Spiele werden hier nicht dupliziert. Ihre Regeln und Oberflächen bleiben in ihren Repositories; sie binden eine festgelegte Version dieses Moduls ein.

## Quellen

- [WebRTC-Verbindungsaufbau](https://webrtc.org/getting-started/peer-connections)
- [WebRTC-Datenkanäle](https://webrtc.org/getting-started/data-channels)
- [ICE gathering](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceGatheringState)
