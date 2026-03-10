# One Chance 🎯

> Das kooperative Multiplayer-Wort-Ratespiel für den Browser

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://DEIN-USER.github.io/one-chance/)
[![Version](https://img.shields.io/badge/Version-1.1.0-blue)](#)
[![Lizenz](https://img.shields.io/badge/Lizenz-MIT-lightgrey)](#)

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
├── index.html              ← Einstiegspunkt (einzige Datei im Root)
├── README.md               ← Diese Datei
├── CHANGELOG.md            ← Versionshistorie
├── .gitignore              ← Git-Ausnahmen
└── assets/
    ├── css/
    │   └── style.css       ← Gesamtes Styling
    └── js/
        └── game.js         ← Spiellogik + Firebase-Integration
```

> GitHub Pages benötigt `index.html` im Root – alle anderen Dateien liegen in `assets/`.

---

## ⚙️ Einrichtung

### Schritt 1 – Firebase-Projekt vorbereiten

1. Öffne [console.firebase.google.com](https://console.firebase.google.com/)
2. Wähle dein Projekt **One Chance**
3. Klicke auf **„+ App hinzufügen"** → Web-Symbol **`</>`**
4. App-Nickname vergeben → **Registrieren**
5. Die angezeigte Konfiguration (JSON) kopieren
6. Im linken Menü: **Build → Realtime Database → Datenbank erstellen**
   - Region wählen (z.B. `europe-west1`)
   - **Testmodus** auswählen → Fertig

### Schritt 2 – Datenbankregeln setzen

In Firebase Console → **Realtime Database → Regeln**:

```json
{
  "rules": {
    "lobbies": {
      "$lobbyCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

→ **Veröffentlichen**

### Schritt 3 – Spiel starten

Öffne `index.html` lokal oder über GitHub Pages.  
Beim **ersten Start** erscheint automatisch ein Einrichtungsdialog – Firebase-Konfiguration einfügen und speichern.

Die Konfiguration wird im `localStorage` des Browsers gespeichert (einmalig pro Gerät).

---

## 🚀 Deployment via GitHub Pages

```bash
# 1. Repository initialisieren
git init
git add .
git commit -m "feat: initial release v1.1.0"
git branch -M main

# 2. Remote hinzufügen und pushen
git remote add origin https://github.com/DEIN-USER/one-chance.git
git push -u origin main
```

**GitHub Repository Settings → Pages:**
- Source: `Deploy from a branch`
- Branch: `main` / `/ (root)`
- → **Save**

Das Spiel ist dann unter `https://DEIN-USER.github.io/one-chance/` erreichbar.

---

## 🛠️ Technologien

| Technologie | Zweck |
|---|---|
| Vanilla HTML / CSS / JS | Kein Build-Prozess nötig |
| Firebase Realtime Database | Echtzeit-Multiplayer-Synchronisierung |
| Google Fonts (Syne + DM Sans) | Typografie |
| GitHub Pages | Kostenloses statisches Hosting |

---

## 🐛 Debugging

Alle Aktionen werden in der **Browser-Konsole** protokolliert (`F12 → Console`).  
Log-Einträge sind mit `[OneChance HH:MM:SS]` präfixiert.

---

## 📄 Lizenz

MIT – freie Verwendung, Änderung und Weitergabe erlaubt.
