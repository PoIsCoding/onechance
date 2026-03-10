/**
 * ═══════════════════════════════════════════════════════════════
 *  One Chance – Multiplayer Ratespiel
 *  game.js – Spiellogik, Firebase-Verbindung, UI-Steuerung
 *
 *  Architektur:
 *  - Firebase Realtime Database als Echtzeit-Backend
 *  - Lobby-System mit zufälligem 6-stelligen Code
 *  - Spielphasen: lobby → clue → reveal → guess → result
 *
 *  Datenbankstruktur:
 *  /lobbies/{code}/
 *    ├── host:        string        (UID des Hosts)
 *    ├── phase:       string        (lobby|clue|reveal|guess|result)
 *    ├── secretWord:  string        (gesuchtes Wort)
 *    ├── guesserUID:  string        (wer rät)
 *    ├── guess:       string        (Antwort des Raters)
 *    ├── players/
 *    │   └── {uid}: { name, ready }
 *    └── clues/
 *        └── {uid}: string         (Hinweis jedes Wortgebers)
 *
 * ═══════════════════════════════════════════════════════════════
 */

// ── Logger-Hilfsfunktion ──────────────────────────────────────
// Einheitliches Logging mit Zeitstempel und Präfix
function log(message, data = null) {
  const ts = new Date().toLocaleTimeString('de-AT');
  if (data !== null) {
    console.log(`[OneChance ${ts}] ${message}`, data);
  } else {
    console.log(`[OneChance ${ts}] ${message}`);
  }
}

log('Skript geladen – initialisiere Spielumgebung');

// ── Wortliste ─────────────────────────────────────────────────
// Vielfältige, gut ratbare Begriffe auf Deutsch
const WORD_LIST = [
  'Strand','Wolke','Gitarre','Drache','Elefant','Vulkan',
  'Pyramide','Kompass','Tintenfisch','Laterne','Schiff',
  'Kristall','Wüste','Bibliothek','Feuerwerk','Igel','Ballon',
  'Leuchtturm','Ozeam','Zauberer','Tornado','Brücke','Nostalgie',
  'Safari','Pinguin','Mondschein','Kamin','Ninja','Wasserfall',
  'Rucksack','Dschungel','Labyrinth','Schatzkarte','Geysir',
  'Wetterfahne','Sternschnuppe','Fischmarkt','Kletterwand',
  'Sandburg','Thermoskanne','Zeitkapsel','Sonnenuhr','Gondel',
  'Wildnis','Kaleidoskop','Trampolin','Höhlenmalerei','Zirkus',
  'Boomerang','Kolosseum','Mangrove','Eisberg','Karawane'
];

// ── Spielzustand ──────────────────────────────────────────────
const State = {
  uid:         null,   // Eindeutige User-ID dieser Browser-Session
  name:        null,   // Spielername
  lobbyCode:   null,   // Aktueller Lobby-Code
  isHost:      false,  // Ist dieser Spieler der Host?
  isGuesser:   false,  // Ist dieser Spieler der Rater?
  phase:       null,   // Aktuelle Spielphase
  secretWord:  null,   // Das gesuchte Wort
  guesserUID:  null,   // UID des Raters
  players:     {},     // { uid: { name, ready } }
  clues:       {},     // { uid: clueText }
  db:          null,   // Firebase Database-Referenz
  listeners:   [],     // Aktive Firebase-Listener (zum Aufräumen)
};

// ── DOM-Referenzen ────────────────────────────────────────────
const screens = {
  start:        document.getElementById('screen-start'),
  lobby:        document.getElementById('screen-lobby'),
  clue:         document.getElementById('screen-clue'),
  guesserWait:  document.getElementById('screen-guesser-wait'),
  reveal:       document.getElementById('screen-reveal'),
  guess:        document.getElementById('screen-guess'),
  result:       document.getElementById('screen-result'),
};

// ── Einmalige User-ID generieren ──────────────────────────────
// Wird im sessionStorage gespeichert, damit Browser-Reload sicher ist
function getOrCreateUID() {
  let uid = sessionStorage.getItem('onechance_uid');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 11);
    sessionStorage.setItem('onechance_uid', uid);
    log('Neue UID erstellt:', uid);
  } else {
    log('Bestehende UID geladen:', uid);
  }
  return uid;
}

// ══════════════════════════════════════════════════════════════
//  FIREBASE KONFIGURATION (fest eingebaut)
//  databaseURL kommt aus der Realtime Database in Firebase Console
// ══════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBwrDM4sBowMX5ozhllSZOmy0tItp0iFJM",
  authDomain:        "one-chance-63038.firebaseapp.com",
  databaseURL:       "https://one-chance-63038-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "one-chance-63038",
  storageBucket:     "one-chance-63038.firebasestorage.app",
  messagingSenderId: "19576021800",
  appId:             "1:19576021800:web:dce22e95049af27362e61d",
  measurementId:     "G-H820F9L3JY",
};

// Firebase initialisieren und Datenbankverbindung herstellen
function initFirebase() {
  try {
    // Verhindert Doppel-Initialisierung bei Page-Reloads
    if (firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
      log('Firebase-App initialisiert');
    }
    State.db = firebase.database();
    log('Firebase Realtime Database verbunden:', FIREBASE_CONFIG.databaseURL);
    return true;
  } catch (e) {
    log('Firebase-Initialisierung fehlgeschlagen:', e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  SCREEN-MANAGER
// ══════════════════════════════════════════════════════════════

// Nur den gewünschten Screen einblenden, alle anderen ausblenden
function showScreen(name) {
  log('Screen wechseln zu:', name);
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

// ══════════════════════════════════════════════════════════════
//  LOBBY-CODE GENERATOR
// ══════════════════════════════════════════════════════════════

// 6-stelligen alphanumerischen Code generieren (nur Großbuchstaben + Ziffern)
function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Verwechslungsfreie Zeichen
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  log('Lobby-Code generiert:', code);
  return code;
}

// ══════════════════════════════════════════════════════════════
//  FIREBASE LISTENER MANAGEMENT
// ══════════════════════════════════════════════════════════════

// Alle aktiven Firebase-Listener sauber entfernen
function removeAllListeners() {
  log(`${State.listeners.length} Firebase-Listener werden entfernt`);
  State.listeners.forEach(({ ref, event, fn }) => {
    ref.off(event, fn);
  });
  State.listeners = [];
}

// Neuen Listener registrieren und in Liste aufnehmen
function addListener(ref, event, fn) {
  ref.on(event, fn);
  State.listeners.push({ ref, event, fn });
}

// ══════════════════════════════════════════════════════════════
//  LOBBY ERSTELLEN / BEITRETEN
// ══════════════════════════════════════════════════════════════

async function joinOrCreateLobby(name, code) {
  log('Lobby beitreten/erstellen – Name:', name, 'Code:', code || '(neu)');

  const db = State.db;

  if (code) {
    // ── Bestehendes Lobby beitreten ──
    const lobbyRef = db.ref(`lobbies/${code}`);
    const snap = await lobbyRef.once('value');

    if (!snap.exists()) {
      log('Lobby nicht gefunden:', code);
      throw new Error('Lobby nicht gefunden. Überprüfe den Code.');
    }

    const data = snap.val();
    if (data.phase !== 'lobby') {
      throw new Error('Das Spiel hat bereits begonnen.');
    }

    // Spieler eintragen
    await db.ref(`lobbies/${code}/players/${State.uid}`).set({
      name: name,
      ready: false,
    });

    State.lobbyCode = code;
    State.isHost    = false;
    log('Lobby beigetreten:', code);
  } else {
    // ── Neue Lobby erstellen ──
    const newCode = generateLobbyCode();
    await db.ref(`lobbies/${newCode}`).set({
      host:       State.uid,
      phase:      'lobby',
      secretWord: null,
      guesserUID: null,
      guess:      null,
      players: {
        [State.uid]: { name: name, ready: false }
      },
      clues: {},
    });

    State.lobbyCode = newCode;
    State.isHost    = true;
    log('Neue Lobby erstellt:', newCode);
  }

  // Cleanup-Hook: Spieler beim Tab-Schließen entfernen
  window.addEventListener('beforeunload', () => {
    db.ref(`lobbies/${State.lobbyCode}/players/${State.uid}`).remove();
  });
}

// ══════════════════════════════════════════════════════════════
//  LOBBY-SCREEN: Spielerliste & Phasenwatcher
// ══════════════════════════════════════════════════════════════

function enterLobbyScreen() {
  log('Lobby-Screen betreten – Code:', State.lobbyCode);

  // Lobby-Code anzeigen
  document.getElementById('lobby-code-display').textContent = State.lobbyCode;

  // Host-Controls vs. Wartetext
  const hostControls = document.getElementById('host-controls');
  const waitingMsg   = document.getElementById('waiting-msg');
  if (State.isHost) {
    hostControls.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
  } else {
    hostControls.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }

  // ── Spielerliste live beobachten ──
  const playersRef = State.db.ref(`lobbies/${State.lobbyCode}/players`);
  addListener(playersRef, 'value', (snap) => {
    State.players = snap.val() || {};
    log('Spielerliste aktualisiert:', Object.keys(State.players).length, 'Spieler');
    renderPlayerList();
    updateStartButton();
  });

  // ── Phasenwechsel beobachten ──
  const phaseRef = State.db.ref(`lobbies/${State.lobbyCode}/phase`);
  addListener(phaseRef, 'value', (snap) => {
    const phase = snap.val();
    log('Phase geändert:', phase);
    if (phase && phase !== 'lobby') {
      handlePhaseChange(phase);
    }
  });

  showScreen('lobby');
}

// Spielerliste im DOM rendern
function renderPlayerList() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';

  // Host-UID aus Datenbank holen (ist beim ersten Render verfügbar)
  State.db.ref(`lobbies/${State.lobbyCode}/host`).once('value').then(snap => {
    const hostUID = snap.val();

    Object.entries(State.players).forEach(([uid, player]) => {
      const li = document.createElement('li');

      // Avatar mit Initial
      const avatar = document.createElement('div');
      avatar.className = 'player-avatar';
      avatar.textContent = (player.name || '?')[0].toUpperCase();

      const nameEl = document.createElement('span');
      nameEl.className = 'player-name';
      nameEl.textContent = player.name;

      li.appendChild(avatar);
      li.appendChild(nameEl);

      // Host-Abzeichen
      if (uid === hostUID) {
        const badge = document.createElement('span');
        badge.className = 'host-badge';
        badge.textContent = 'HOST';
        li.appendChild(badge);
      }

      list.appendChild(li);
    });
  });
}

// Start-Button freischalten ab 3 Spielern
function updateStartButton() {
  const count   = Object.keys(State.players).length;
  const btn     = document.getElementById('btn-start');
  const hint    = document.getElementById('host-hint');

  if (count >= 3) {
    btn.disabled = false;
    hint.textContent = `${count} Spieler bereit – Spiel kann gestartet werden!`;
    log('Start-Button freigeschalten:', count, 'Spieler');
  } else {
    btn.disabled = true;
    hint.textContent = `Mindestens 3 Spieler werden benötigt (aktuell: ${count}).`;
  }
}

// ══════════════════════════════════════════════════════════════
//  SPIEL STARTEN (nur Host)
// ══════════════════════════════════════════════════════════════

async function startGame() {
  log('Spiel wird gestartet – wähle zufälligen Rater und Wort');

  const playerUIDs = Object.keys(State.players);

  // Zufälligen Rater wählen
  const guesserIndex = Math.floor(Math.random() * playerUIDs.length);
  const guesserUID   = playerUIDs[guesserIndex];

  // Zufälliges Wort wählen
  const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];

  log('Rater:', State.players[guesserUID]?.name, '| Wort:', word);

  // Datenbank aktualisieren – alle Clients erhalten die Phase automatisch
  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase:      'clue',
    secretWord: word,
    guesserUID: guesserUID,
    clues:      {},
    guess:      null,
  });

  log('Spielstart in Datenbank geschrieben');
}

// ══════════════════════════════════════════════════════════════
//  PHASENWECHSEL HANDLER
// ══════════════════════════════════════════════════════════════

async function handlePhaseChange(phase) {
  log('Phasenwechsel wird verarbeitet:', phase);

  // Aktuelle Spieldaten laden
  const snap = await State.db.ref(`lobbies/${State.lobbyCode}`).once('value');
  const data  = snap.val();

  State.phase      = phase;
  State.secretWord = data.secretWord;
  State.guesserUID = data.guesserUID;
  State.isGuesser  = (State.uid === State.guesserUID);
  State.clues      = data.clues || {};

  log('Aktualisierte Zustandsdaten:', {
    phase,
    secretWord: State.secretWord,
    isGuesser:  State.isGuesser,
    clueCount:  Object.keys(State.clues).length,
  });

  switch (phase) {

    case 'clue':
      enterCluePhase();
      break;

    case 'reveal':
      enterRevealPhase();
      break;

    case 'guess':
      enterGuessPhase();
      break;

    case 'result':
      enterResultPhase(data.guess);
      break;
  }
}

// ══════════════════════════════════════════════════════════════
//  PHASE: HINWEIS GEBEN
// ══════════════════════════════════════════════════════════════

function enterCluePhase() {
  log('Hinweis-Phase startet – isGuesser:', State.isGuesser);

  if (State.isGuesser) {
    // Rater wartet
    showScreen('guesserWait');
    watchForReveal();
  } else {
    // Wortgeber: Geheimwort anzeigen + Hinweis eingeben
    document.getElementById('secret-word-display').textContent = State.secretWord;
    document.getElementById('input-clue').value = '';
    document.getElementById('input-clue').disabled = false;
    document.getElementById('btn-submit-clue').disabled = false;
    document.getElementById('clue-submitted-msg').classList.add('hidden');

    showScreen('clue');
    watchForAllCluesSubmitted();
  }
}

// Hinweis abschicken
async function submitClue() {
  const clueText = document.getElementById('input-clue').value.trim();

  if (!clueText) {
    log('Leerer Hinweis – wird ignoriert');
    return;
  }

  log('Hinweis wird abgeschickt:', clueText);

  // Eingabe deaktivieren
  document.getElementById('input-clue').disabled = true;
  document.getElementById('btn-submit-clue').disabled = true;
  document.getElementById('clue-submitted-msg').classList.remove('hidden');

  // In Datenbank schreiben
  await State.db.ref(`lobbies/${State.lobbyCode}/clues/${State.uid}`).set(clueText);
  log('Hinweis gespeichert');
}

// Warten bis alle Wortgeber ihren Hinweis eingegeben haben
function watchForAllCluesSubmitted() {
  const cluesRef = State.db.ref(`lobbies/${State.lobbyCode}/clues`);
  addListener(cluesRef, 'value', async (snap) => {
    const clues      = snap.val() || {};
    const clueCount  = Object.keys(clues).length;
    const giversCount = Object.keys(State.players).length - 1; // Rater zählt nicht

    log(`Hinweise eingegangen: ${clueCount} / ${giversCount}`);

    // Wenn alle Hinweise da sind und dieser Spieler Host ist → Phase wechseln
    if (clueCount >= giversCount && State.isHost) {
      log('Alle Hinweise vorhanden – wechsle zu Reveal-Phase');
      await State.db.ref(`lobbies/${State.lobbyCode}`).update({
        phase: 'reveal',
        clues: clues,
      });
    }
  });
}

// Rater: Warten auf Phase 'reveal'
function watchForReveal() {
  const phaseRef = State.db.ref(`lobbies/${State.lobbyCode}/phase`);
  addListener(phaseRef, 'value', (snap) => {
    const phase = snap.val();
    log('Rater wartet – Phase jetzt:', phase);
    if (phase === 'guess') {
      // Wird durch handlePhaseChange behandelt
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASE: REVEAL – Doppelte Wörter animiert streichen
// ══════════════════════════════════════════════════════════════

async function enterRevealPhase() {
  log('Reveal-Phase startet – verarbeite Hinweise');

  // Aktuelle Clues aus Datenbank laden
  const snap  = await State.db.ref(`lobbies/${State.lobbyCode}/clues`).once('value');
  State.clues = snap.val() || {};

  const allClues = Object.entries(State.clues); // [[uid, text], ...]

  log('Alle Hinweise:', allClues.map(([, t]) => t));

  // Doppelte Wörter finden (case-insensitive)
  const duplicates = findDuplicates(allClues.map(([, t]) => t));
  log('Doppelte Hinweise:', [...duplicates]);

  // Hinweisliste rendern
  const list = document.getElementById('clue-list');
  list.innerHTML = '';

  allClues.forEach(([uid, text], index) => {
    const li = document.createElement('li');

    const bullet = document.createElement('div');
    bullet.className = 'clue-bullet';
    bullet.textContent = index + 1;

    const textNode = document.createTextNode(text);

    li.appendChild(bullet);
    li.appendChild(textNode);
    li.dataset.text = text.toLowerCase();

    list.appendChild(li);
  });

  showScreen('reveal');

  // Streichanimation nach kurzer Verzögerung starten
  setTimeout(() => animateStrikethrough(duplicates), 800);

  // Nach Animation: Weiter-Button anzeigen (nur Host)
  const animDuration = 600 + duplicates.size * 500 + 1200;
  setTimeout(() => {
    log('Streichanimation abgeschlossen');
    if (State.isHost) {
      document.getElementById('btn-to-guess').classList.remove('hidden');
    }
  }, animDuration);
}

// Doppelte Wörter als Set zurückgeben (case-insensitive)
function findDuplicates(texts) {
  const normalized = texts.map(t => t.toLowerCase().trim());
  const seen    = new Set();
  const dupes   = new Set();

  normalized.forEach(t => {
    if (seen.has(t)) dupes.add(t);
    else seen.add(t);
  });

  log('findDuplicates – gefundene Duplikate:', [...dupes]);
  return dupes;
}

// Streichanimation: Duplikate nacheinander durchstreichen
function animateStrikethrough(duplicates) {
  if (duplicates.size === 0) {
    log('Keine Duplikate – überspringe Streichanimation');
    return;
  }

  const items = document.querySelectorAll('#clue-list li');
  let delay = 0;

  items.forEach(li => {
    const text = li.dataset.text;
    if (duplicates.has(text)) {
      setTimeout(() => {
        log('Streiche Hinweis:', li.textContent.trim());
        li.classList.add('strike');
      }, delay);
      delay += 500;
    }
  });
}

// Host: Zur Ratephase wechseln
async function proceedToGuess() {
  log('Host: Wechsle zur Guess-Phase');

  // Valide (nicht gestrichene) Hinweise ermitteln
  const snap  = await State.db.ref(`lobbies/${State.lobbyCode}/clues`).once('value');
  const clues = snap.val() || {};

  const allTexts = Object.values(clues);
  const duplicates = findDuplicates(allTexts);

  // Nur nicht-doppelte Hinweise weitergeben
  const validClues = {};
  Object.entries(clues).forEach(([uid, text]) => {
    if (!duplicates.has(text.toLowerCase().trim())) {
      validClues[uid] = text;
    }
  });

  log('Valide Hinweise für Rater:', validClues);

  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase:  'guess',
    clues:  validClues,
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASE: RATEN
// ══════════════════════════════════════════════════════════════

async function enterGuessPhase() {
  log('Guess-Phase startet – isGuesser:', State.isGuesser);

  // Aktuelle valide Hinweise laden
  const snap  = await State.db.ref(`lobbies/${State.lobbyCode}/clues`).once('value');
  State.clues = snap.val() || {};

  const validClues = Object.values(State.clues);
  log('Hinweise für Rater:', validClues);

  if (State.isGuesser) {
    // Hinweise anzeigen
    const list = document.getElementById('guesser-clue-list');
    list.innerHTML = '';
    validClues.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });

    document.getElementById('input-guess').value = '';
    showScreen('guess');
  } else {
    // Wortgeber warten auf Ergebnis
    showScreen('guesserWait');
    document.querySelector('#screen-guesser-wait .wait-title').textContent = 'Der Rater denkt nach…';

    // Auf Result-Phase warten
    watchForResult();
  }
}

// Wortgeber: Warten bis Ergebnis da ist
function watchForResult() {
  const phaseRef = State.db.ref(`lobbies/${State.lobbyCode}/phase`);
  addListener(phaseRef, 'value', (snap) => {
    const phase = snap.val();
    if (phase === 'result') {
      log('Ergebnis-Phase erkannt – lade Daten');
      State.db.ref(`lobbies/${State.lobbyCode}`).once('value').then(s => {
        const data = s.val();
        enterResultPhase(data.guess);
      });
    }
  });
}

// Raten abschicken
async function submitGuess() {
  const guessText = document.getElementById('input-guess').value.trim();

  if (!guessText) {
    log('Leere Antwort – wird ignoriert');
    return;
  }

  log('Antwort wird abgeschickt:', guessText);

  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: 'result',
    guess: guessText,
  });

  log('Antwort gespeichert – wechsle zu Ergebnis');
}

// ══════════════════════════════════════════════════════════════
//  PHASE: ERGEBNIS
// ══════════════════════════════════════════════════════════════

async function enterResultPhase(guess) {
  log('Ergebnis-Phase startet – Antwort:', guess, '| Wort:', State.secretWord);

  const correct = guess?.toLowerCase().trim() === State.secretWord?.toLowerCase().trim();
  log('Ergebnis:', correct ? '✓ RICHTIG' : '✗ FALSCH');

  document.getElementById('result-icon').textContent  = correct ? '🎉' : '😬';
  document.getElementById('result-title').textContent  = correct ? 'Richtig!' : 'Leider falsch…';
  document.getElementById('result-title').className    = 'result-title ' + (correct ? 'correct' : 'wrong');

  const guesserName = State.players[State.guesserUID]?.name || 'Der Rater';
  document.getElementById('result-guess').innerHTML =
    `<strong>${guesserName}</strong> hat „<strong>${guess || '—'}</strong>" geraten.`;
  document.getElementById('result-word').innerHTML =
    `Das gesuchte Wort war: <strong>${State.secretWord}</strong>`;

  // Host: Nächste Runde / Beenden Buttons
  const hostNext    = document.getElementById('host-next-controls');
  const waitingNext = document.getElementById('waiting-next-msg');
  if (State.isHost) {
    hostNext.classList.remove('hidden');
    waitingNext.classList.add('hidden');
  } else {
    hostNext.classList.add('hidden');
    waitingNext.classList.remove('hidden');
  }

  showScreen('result');
}

// ══════════════════════════════════════════════════════════════
//  NÄCHSTE RUNDE / SPIEL BEENDEN
// ══════════════════════════════════════════════════════════════

async function nextRound() {
  log('Nächste Runde wird gestartet');
  removeAllListeners();

  // Nur Host setzt neue Phase – Lobby-Screen neu aufsetzen ohne Listener zu duplizieren
  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase:      'lobby',
    secretWord: null,
    guesserUID: null,
    clues:      {},
    guess:      null,
  });

  // Kurz warten, dann Lobby-Screen neu aufrufen
  setTimeout(() => {
    enterLobbyScreen();
  }, 300);
}

async function endGame() {
  log('Spiel wird beendet – Lobby wird gelöscht');
  removeAllListeners();

  await State.db.ref(`lobbies/${State.lobbyCode}`).remove();

  // Zurück zum Start-Screen
  State.lobbyCode = null;
  State.isHost    = false;
  showScreen('start');
}

// ══════════════════════════════════════════════════════════════
//  FIREBASE CONFIG MODAL – entfernt (Config ist fest eingebaut)
// ══════════════════════════════════════════════════════════════
// Firebase wird direkt über FIREBASE_CONFIG in initFirebase() gestartet.

// ══════════════════════════════════════════════════════════════
//  EVENT LISTENER – START-SCREEN
// ══════════════════════════════════════════════════════════════

document.getElementById('btn-join').addEventListener('click', async () => {
  const name  = document.getElementById('input-name').value.trim();
  const code  = document.getElementById('input-lobby').value.trim().toUpperCase();
  const errEl = document.getElementById('start-error');
  errEl.textContent = '';

  if (!name) {
    errEl.textContent = 'Bitte gib deinen Namen ein.';
    return;
  }

  if (!State.db) {
    errEl.textContent = 'Firebase nicht verbunden. Bitte Seite neu laden.';
    return;
  }

  log('Join-Button geklickt – Name:', name, '| Code:', code || '(neu)');

  try {
    State.uid  = getOrCreateUID();
    State.name = name;

    await joinOrCreateLobby(name, code);
    enterLobbyScreen();
  } catch (e) {
    log('Fehler beim Beitreten:', e.message);
    errEl.textContent = e.message;
  }
});

// Enter-Taste in Inputs
document.getElementById('input-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});
document.getElementById('input-lobby').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// ── Lobby-Code kopieren ──
document.getElementById('btn-copy-code').addEventListener('click', () => {
  const code = document.getElementById('lobby-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => {
    log('Lobby-Code in Zwischenablage kopiert:', code);
    document.getElementById('btn-copy-code').textContent = '✓';
    setTimeout(() => {
      document.getElementById('btn-copy-code').textContent = '⧉';
    }, 1500);
  });
});

// ── Spiel starten (Host) ──
document.getElementById('btn-start').addEventListener('click', () => {
  log('Start-Button geklickt');
  startGame();
});

// ── Hinweis abschicken ──
document.getElementById('btn-submit-clue').addEventListener('click', submitClue);
document.getElementById('input-clue').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitClue();
});

// ── Zur Ratephase (Host nach Reveal) ──
document.getElementById('btn-to-guess').addEventListener('click', proceedToGuess);

// ── Antwort abschicken ──
document.getElementById('btn-submit-guess').addEventListener('click', submitGuess);
document.getElementById('input-guess').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitGuess();
});

// ── Nächste Runde / Beenden (Host) ──
document.getElementById('btn-next-round').addEventListener('click', nextRound);
document.getElementById('btn-end-game').addEventListener('click', endGame);

// ══════════════════════════════════════════════════════════════
//  INITIALISIERUNG BEIM SEITENAUFRUF
// ══════════════════════════════════════════════════════════════

(function init() {
  log('Anwendung wird initialisiert');

  // Firebase direkt mit fest eingebauter Config starten – kein Modal nötig
  const ok = initFirebase();
  if (ok) {
    log('Firebase bereit – zeige Start-Screen');
    showScreen('start');
  } else {
    // Fallback: Fehlermeldung im Start-Screen anzeigen
    log('FEHLER: Firebase konnte nicht initialisiert werden');
    showScreen('start');
    document.getElementById('start-error').textContent =
      'Firebase-Verbindung fehlgeschlagen. Bitte Seite neu laden.';
  }
})();
