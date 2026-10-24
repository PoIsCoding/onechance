# One Chance 🎯

> Das kooperative Multiplayer-Wort-Ratespiel für den Browser

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://poiscoding.github.io/onechance/)
[![Firebase Hosting](https://img.shields.io/badge/Firebase%20Hosting-Live-orange)](https://one-chance-63038.web.app/)
[![Version](https://img.shields.io/badge/Version-1.8.1-blue)](#)
[![Lizenz](https://img.shields.io/badge/Lizenz-Custom-lightgrey)](LICENSE)

---

## 🎮 Spielprinzip

1. Alle Spieler betreten eine gemeinsame **Lobby** per Code
2. Der Host startet das Spiel – eine zufällige Person wird zum **Rater**
3. Alle anderen sehen dasselbe geheime Wort und geben je **einen Hinweis-Begriff** ein
4. Doppelte Hinweise werden **animiert gestrichen**
5. Der Rater sieht die verbleibenden Hinweise und muss das Wort **erraten**

---

## 📁 Dateistruktur

```
one-chance/
├── index.html              ← Einstiegspunkt
├── stats.html              ← Statistik-Dashboard mit Google-Login
├── firebase.json           ← Firebase-Hosting-Konfiguration
├── .firebaserc             ← Firebase-Projektzuordnung
├── scripts/
│   └── prepare-hosting.cjs  ← Erstellt den Veröffentlichungsordner public/
├── README.md               ← Diese Datei
├── CHANGELOG.md            ← Versionshistorie
├── .gitignore              ← Git-Ausnahmen
└── assets/
    ├── css/
    │   └── style.css       ← Gesamtes Styling
    └── js/
        └── game.js         ← Spiellogik + Firebase-Integration
```

---

## 🛠️ Technologien

| Technologie                   | Zweck                                 |
| ----------------------------- | ------------------------------------- |
| Vanilla HTML / CSS / JS       | Kein Build-Prozess nötig              |
| Firebase Realtime Database    | Echtzeit-Multiplayer-Synchronisierung |
| Google Fonts (Syne + DM Sans) | Typografie                            |
| GitHub Pages                  | Kostenloses statisches Hosting        |
| Firebase Hosting              | Zusätzliches statisches Hosting mit HTTPS |

---

## 🌐 Firebase Hosting

Das Spiel ist zusätzlich unter **https://one-chance-63038.web.app/** erreichbar.
Die alternative Firebase-Adresse lautet **https://one-chance-63038.firebaseapp.com/**.
GitHub Pages bleibt parallel bestehen. Beide Websites verwenden dasselbe bestehende
Firebase-Projekt `one-chance-63038` und dieselbe Multiplayer-Datenbank.

### Änderungen veröffentlichen

Voraussetzung: Node.js mit npm und ein Google-Konto mit Hosting-Zugriff auf das Projekt.
Im Projektordner ausführen:

```powershell
npx firebase-tools login
npx firebase-tools deploy --only hosting --project one-chance-63038
```

Vor jeder Veröffentlichung erstellt `scripts/prepare-hosting.cjs` automatisch den
Ordner `public/` neu. Er enthält ausschließlich `index.html`, `stats.html` und
`assets/`. Lokale Notizen, `.history`, Git-Dateien und Konfigurationen werden nicht
veröffentlicht. Der Befehl veröffentlicht ausschließlich Hosting; Datenbankregeln
und andere Firebase-Dienste werden dabei nicht geändert.

Ein Git-Push aktualisiert weiterhin GitHub Pages. Firebase wird mit dem obigen
Deploy-Befehl separat aktualisiert.

---

## 🐛 Debugging

Alle Aktionen werden in der **Browser-Konsole** protokolliert (`F12 → Console`).  
Log-Einträge sind mit `[OneChance HH:MM:SS]` präfixiert.

---

## 📄 Lizenz

Custom License – das Spielen ist erlaubt, Kopieren/Modifizieren/Weitergeben des Quellcodes nicht. Siehe [LICENSE](LICENSE).
