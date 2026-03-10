# Changelog – One Chance

Alle relevanten Änderungen am Projekt werden hier dokumentiert.  
Format: [Semantische Versionierung](https://semver.org/lang/de/) `vMAJOR.MINOR.PATCH`

---

## [v1.4.0] – 2025-XX-XX

### Neu: Rollen
- **Zuschauer**: Spieler können beim Beitreten "Zuschauer" wählen. Sie sehen in Echtzeit das Geheimwort und alle Eingaben. Sie zählen nicht zum Spielerlimit.
- **Moderator**: Host kann einen Spieler als Moderator setzen. Moderatoren sehen alles wie Zuschauer, können aber nach der Clue-Phase manuell Hinweise streichen (Regelverstoß). Erst nach ihrer Bestätigung sehen Wortgeber die Animations-Phase.
- **TV-Spieler**: Host markiert einen Spieler als TV-Spieler. Dieser rät immer (nie Wortgeber), sieht erst nach der Reveal-Animation die Hinweise und sitzt mit dem Rücken zum Fernseher. Richtig/Falsch wird durch Mod oder Host bestätigt.

### Neu: Spielmechanik
- **Moderator-Prüfungsphase** (`mod-review`): Wenn ein Moderator existiert, kommt nach der Clue-Phase ein eigener Screen für den Mod zum manuellen Streichen von Hinweisen.
- **Automatische Weiterleitung** nach Reveal: Countdown-Ring (5 Sek.) ersetzt den "Weiter"-Button – kein Admin-Klick mehr nötig.
- **Verdikt-System** (TV-Modus): Moderator (oder Host) sieht "✓ Richtig / ✗ Falsch" Buttons und entscheidet das Ergebnis manuell.
- **Rater sieht Reveal NICHT mehr**: Rater und TV-Spieler bleiben auf dem Warte-Screen während die Durchstreich-Animation läuft.

### Neu: Kategorien & Wortlisten
- 4 Wortlisten als separate Dateien: `words-leicht.js`, `words-mittel.js`, `words-schwer.js`, `words-fsk18.js`
- Kategorie-Auswahl per Chips auf Start-Screen und in der Lobby (Host kann ändern)
- Kategorie wird in Firebase gespeichert und für alle Clients sichtbar

### Neu: UI
- **QR-Code** in Lobby wenn TV-Spieler gesetzt – schnelles Beitreten mit Smartphone
- **Schieberegler** für Spieler-Limit (statt Dropdown)
- **Responsivität**: Logo bricht nicht mehr aus dem Container; Geheimwort skaliert automatisch mit der Textlänge; Layout nutzt auf großen Screens (Desktop, TV) viel mehr Platz (Lobby zweispaltig)
- Neuer Badge-Typ: `mod-badge` (lila), `tv-badge` (rot), überarbeitete Aktionsbuttons in Spielerliste
- Kick-Rechte für Moderatoren ergänzt

### Dateien
```
assets/words/words-leicht.js   ← neu
assets/words/words-mittel.js   ← neu
assets/words/words-schwer.js   ← neu
assets/words/words-fsk18.js    ← neu
```

---

## [v1.3.0] – 2025-XX-XX

### Neu
- **Host-Reconnect**: UID wird in `localStorage` gespeichert (statt `sessionStorage`).
  Beim Seitenaufruf wird geprüft ob noch eine aktive Host-Lobby existiert – falls ja,
  kehrt der Host automatisch zur Lobby zurück ohne neu beitreten zu müssen.
- **Spieler-Limit**: Host kann die maximale Spieleranzahl (3–12) festlegen –
  sowohl beim Erstellen einer Lobby (Start-Screen) als auch danach in der Lobby.
  Beitrittsversuche über dem Limit werden mit Fehlermeldung blockiert.
- **Spieler kicken**: Host sieht neben jedem Spieler einen ✕-Button.
  Gekickte Spieler werden in `/kicked/` eingetragen, erhalten sofort einen
  Toast-Hinweis und landen auf dem Start-Screen.
- **Einlade-Link**: Generiert einen direkten URL mit `?lobby=CODE`.
  Button zum Kopieren + WhatsApp-Teilen-Button in der Lobby.
  Beim Öffnen des Links wird der Code automatisch ins Beitrittsfeld eingetragen.
- **Toast-Benachrichtigungen**: Kurze animierte Einblendungen für Systemereignisse
  (Kick, Reconnect, Link kopiert, Limit gesetzt).
- **Letzter Name**: Wird in `localStorage` gespeichert und beim nächsten Start vorausgefüllt.
- **Spielerzähler**: Zeigt `X / Limit` in der Lobby-Überschrift.
- **Ich-Badge**: Spieler sehen ihr eigenes Profil in der Liste mit „Du"-Markierung.

### Geändert
- `getOrCreateUID()` nutzt jetzt `localStorage` statt `sessionStorage`
- `enterLobbyScreen()` ruft `removeAllListeners()` auf (verhindert doppelte Listener bei Rundenende)
- `watchForResult()` als eigenständiger Listener statt separater Funktion konsolidiert

---

## [v1.2.0] – 2025-XX-XX

### Geändert
- Firebase-Konfiguration direkt in `assets/js/game.js` eingebaut (kein Setup-Modal mehr nötig)
- `databaseURL` der Realtime Database (`europe-west1`) ergänzt
- Config-Modal komplett entfernt aus `index.html` und `game.js`
- `loadFirebaseConfig()` und `saveFirebaseConfig()` entfernt (nicht mehr benötigt)
- `initFirebase()` benötigt keinen Parameter mehr – nutzt `FIREBASE_CONFIG` direkt
- Fehlermeldung im Start-Screen als Fallback bei Firebase-Verbindungsfehler

---

## [v1.1.0] – 2025-XX-XX

### Geändert
- Projekt umbenannt von „Just One" zu **„One Chance"**
- Dateistruktur reorganisiert: CSS und JS liegen jetzt in `assets/css/` bzw. `assets/js/`
- Nur `index.html` liegt im Root-Verzeichnis (GitHub Pages kompatibel)
- `localStorage`- und `sessionStorage`-Schlüssel auf `onechance_*` umgestellt
- Logger-Präfix von `[JustOne]` auf `[OneChance]` aktualisiert
- `CHANGELOG.md` hinzugefügt
- `README.md` überarbeitet mit Firebase-Schritt-für-Schritt-Anleitung
- `.gitignore` hinzugefügt

### Dateistruktur
```
one-chance/
├── index.html
├── README.md
├── CHANGELOG.md
├── .gitignore
└── assets/
    ├── css/style.css
    └── js/game.js
```

---

## [v1.0.0] – 2025-XX-XX

### Neu
- Lobby-System mit zufälligem 6-stelligen Code
- Beliebig viele Spieler (Minimum: 3)
- Zufällige Rater-Zuteilung pro Runde
- Geheimwort nur für Wortgeber sichtbar
- Hinweis-Eingabe mit Firebase-Echtzeit-Synchronisierung
- Animierte Streich-Animation für doppelte Hinweise
- Rater-Screen mit gefilterten (validen) Hinweisen
- Ergebnis-Auswertung mit Richtig/Falsch-Anzeige
- Mehrere Runden in derselben Lobby möglich
- Firebase-Konfiguration via UI-Modal (kein Code-Edit nötig)
- Browser-Konsolen-Logger mit Zeitstempel für alle Spielaktionen
- Dunkles Design mit animierten Hintergrund-Orbs
- Vollständig responsiv (Mobile + Desktop)
