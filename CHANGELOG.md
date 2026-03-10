# Changelog – One Chance

Alle relevanten Änderungen am Projekt werden hier dokumentiert.  
Format: [Semantische Versionierung](https://semver.org/lang/de/) `vMAJOR.MINOR.PATCH`

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
