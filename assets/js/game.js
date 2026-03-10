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
 *  Neu in v1.3.0:
 *  - Host-Reconnect: UID liegt in localStorage (überlebt Reload).
 *    Beim Seitenaufruf wird geprüft ob noch eine Host-Lobby aktiv
 *    ist – falls ja, kehrt der Host automatisch zurück.
 *  - Spieler-Limit: Host kann max. Spieleranzahl (3–12) setzen.
 *    Beitrittsversuche über dem Limit werden blockiert.
 *  - Spieler kicken: Host sieht ✕-Button neben jedem Spieler.
 *    Gekickte Spieler werden zur kicked/-Liste hinzugefügt und
 *    sehen sofort den Start-Screen mit Hinweis.
 *  - Einlade-Link: Generiert URL mit ?lobby=CODE. WhatsApp-Teilen.
 *    Beim Öffnen wird der Code automatisch vorausgefüllt.
 *
 *  Datenbankstruktur:
 *  /lobbies/{code}/
 *    ├── host:        string          (UID des Hosts)
 *    ├── phase:       string          (lobby|clue|reveal|guess|result)
 *    ├── maxPlayers:  number          (Spieler-Limit, default 8)
 *    ├── secretWord:  string
 *    ├── guesserUID:  string
 *    ├── guess:       string
 *    ├── kicked/
 *    │   └── {uid}: true             (gekickte UIDs)
 *    ├── players/
 *    │   └── {uid}: { name, ready }
 *    └── clues/
 *        └── {uid}: string
 *
 * ═══════════════════════════════════════════════════════════════
 */

// ── Logger ────────────────────────────────────────────────────
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
const WORD_LIST = [
  'Strand','Wolke','Gitarre','Drache','Elefant','Vulkan',
  'Pyramide','Kompass','Tintenfisch','Laterne','Schiff',
  'Kristall','Wüste','Bibliothek','Feuerwerk','Igel','Ballon',
  'Leuchtturm','Ozean','Zauberer','Tornado','Brücke','Nostalgie',
  'Safari','Pinguin','Mondschein','Kamin','Ninja','Wasserfall',
  'Rucksack','Dschungel','Labyrinth','Schatzkarte','Geysir',
  'Wetterfahne','Sternschnuppe','Fischmarkt','Kletterwand',
  'Sandburg','Thermoskanne','Zeitkapsel','Sonnenuhr','Gondel',
  'Wildnis','Kaleidoskop','Trampolin','Höhlenmalerei','Zirkus',
  'Boomerang','Kolosseum','Mangrove','Eisberg','Karawane',
];

// ── Spielzustand ──────────────────────────────────────────────
const State = {
  uid:         null,
  name:        null,
  lobbyCode:   null,
  isHost:      false,
  isGuesser:   false,
  phase:       null,
  secretWord:  null,
  guesserUID:  null,
  maxPlayers:  8,
  players:     {},
  clues:       {},
  db:          null,
  listeners:   [],
};

// ── DOM-Referenzen ────────────────────────────────────────────
const screens = {
  start:       document.getElementById('screen-start'),
  lobby:       document.getElementById('screen-lobby'),
  clue:        document.getElementById('screen-clue'),
  guesserWait: document.getElementById('screen-guesser-wait'),
  reveal:      document.getElementById('screen-reveal'),
  guess:       document.getElementById('screen-guess'),
  result:      document.getElementById('screen-result'),
};

// ══════════════════════════════════════════════════════════════
//  USER-ID & NAME (localStorage – überlebt Seiten-Reload)
// ══════════════════════════════════════════════════════════════

function getOrCreateUID() {
  let uid = localStorage.getItem('onechance_uid');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 11);
    localStorage.setItem('onechance_uid', uid);
    log('Neue UID erstellt:', uid);
  } else {
    log('UID aus localStorage:', uid);
  }
  return uid;
}

function loadSavedName() {
  return localStorage.getItem('onechance_name') || '';
}

function saveName(name) {
  localStorage.setItem('onechance_name', name);
}

// ══════════════════════════════════════════════════════════════
//  FIREBASE KONFIGURATION
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

function initFirebase() {
  try {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
      log('Firebase initialisiert');
    }
    State.db = firebase.database();
    log('Realtime Database verbunden');
    return true;
  } catch (e) {
    log('Firebase-Fehler:', e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  SCREEN-MANAGER
// ══════════════════════════════════════════════════════════════

function showScreen(name) {
  log('Screen:', name);
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

// ══════════════════════════════════════════════════════════════
//  TOAST-BENACHRICHTIGUNG
// ══════════════════════════════════════════════════════════════

function showToast(message, duration = 3000) {
  log('Toast:', message);
  let toast = document.getElementById('oc-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'oc-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ══════════════════════════════════════════════════════════════
//  LOBBY-CODE GENERATOR
// ══════════════════════════════════════════════════════════════

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  log('Code generiert:', code);
  return code;
}

// ══════════════════════════════════════════════════════════════
//  FIREBASE LISTENER MANAGEMENT
// ══════════════════════════════════════════════════════════════

function removeAllListeners() {
  log(`${State.listeners.length} Listener entfernen`);
  State.listeners.forEach(({ ref, event, fn }) => ref.off(event, fn));
  State.listeners = [];
}

function addListener(ref, event, fn) {
  ref.on(event, fn);
  State.listeners.push({ ref, event, fn });
}

// ══════════════════════════════════════════════════════════════
//  HOST-RECONNECT
//  Beim Start prüfen ob der User noch eine aktive Host-Lobby hat.
//  Der Lobby-Code wird in localStorage gespeichert wenn eine neue
//  Lobby erstellt wird und beim Beenden wieder gelöscht.
// ══════════════════════════════════════════════════════════════

async function checkHostReconnect(uid) {
  log('Host-Reconnect-Prüfung für UID:', uid);

  const savedCode = localStorage.getItem('onechance_lobby');
  if (!savedCode) {
    log('Kein gespeicherter Lobby-Code');
    return false;
  }

  log('Gespeicherter Code:', savedCode);

  try {
    const snap = await State.db.ref(`lobbies/${savedCode}`).once('value');

    if (!snap.exists()) {
      log('Lobby existiert nicht mehr – bereinige localStorage');
      localStorage.removeItem('onechance_lobby');
      return false;
    }

    const data = snap.val();

    if (data.host !== uid) {
      log('User ist nicht (mehr) Host dieser Lobby');
      localStorage.removeItem('onechance_lobby');
      return false;
    }

    log('Reconnect erfolgreich! Lobby:', savedCode);

    // Spieler-Eintrag erneuern (war evtl. beim Schließen gelöscht worden)
    const savedName = loadSavedName() || 'Host';
    await State.db.ref(`lobbies/${savedCode}/players/${uid}`).set({
      name:  savedName,
      ready: false,
    });

    State.lobbyCode  = savedCode;
    State.isHost     = true;
    State.name       = savedName;
    State.maxPlayers = data.maxPlayers || 8;

    showToast('🔄 Als Host wiederverbunden!');
    enterLobbyScreen();
    return true;

  } catch (e) {
    log('Reconnect-Fehler:', e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  EINLADE-LINK
// ══════════════════════════════════════════════════════════════

function generateInviteLink(code) {
  const base = window.location.href.split('?')[0].split('#')[0];
  return `${base}?lobby=${code}`;
}

function copyInviteLink() {
  const link = generateInviteLink(State.lobbyCode);
  navigator.clipboard.writeText(link).then(() => {
    log('Einlade-Link kopiert:', link);
    showToast('🔗 Link kopiert!');
    const btn = document.getElementById('btn-invite-link');
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => btn.textContent = '🔗 Link kopieren', 2000);
  }).catch(() => {
    // Fallback: Prompt öffnen
    prompt('Link manuell kopieren:', link);
  });
}

function shareWhatsApp() {
  const link = generateInviteLink(State.lobbyCode);
  const text = encodeURIComponent(
    `Komm in meine One Chance Lobby!\nCode: ${State.lobbyCode}\n${link}`
  );
  window.open(`https://wa.me/?text=${text}`, '_blank');
  log('WhatsApp-Teilen geöffnet');
}

// ══════════════════════════════════════════════════════════════
//  SPIELER KICKEN (nur Host)
// ══════════════════════════════════════════════════════════════

async function kickPlayer(uid) {
  const playerName = State.players[uid]?.name || 'Spieler';
  log('Kick:', playerName, uid);

  try {
    // 1. Kick-Eintrag setzen → Client erkennt dies und verlässt Lobby
    await State.db.ref(`lobbies/${State.lobbyCode}/kicked/${uid}`).set(true);
    // 2. Spieler aus Spielerliste entfernen
    await State.db.ref(`lobbies/${State.lobbyCode}/players/${uid}`).remove();

    log('Spieler gekickt:', playerName);
    showToast(`🚫 ${playerName} wurde entfernt.`);
  } catch (e) {
    log('Kick-Fehler:', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  SPIELER-LIMIT SETZEN (nur Host)
// ══════════════════════════════════════════════════════════════

async function updateMaxPlayers(newLimit) {
  const limit = parseInt(newLimit, 10);
  State.maxPlayers = limit;
  log('Spieler-Limit:', limit);
  await State.db.ref(`lobbies/${State.lobbyCode}/maxPlayers`).set(limit);
  showToast(`👥 Limit: ${limit} Spieler`);
}

// ══════════════════════════════════════════════════════════════
//  LOBBY ERSTELLEN / BEITRETEN
// ══════════════════════════════════════════════════════════════

async function joinOrCreateLobby(name, code) {
  log('joinOrCreateLobby – Name:', name, '| Code:', code || '(neu)');
  const db = State.db;

  if (code) {
    // ── Bestehendes Lobby beitreten ──
    const snap = await db.ref(`lobbies/${code}`).once('value');
    if (!snap.exists()) throw new Error('Lobby nicht gefunden. Überprüfe den Code.');

    const data = snap.val();
    if (data.phase !== 'lobby') throw new Error('Das Spiel hat bereits begonnen.');

    // Wurde dieser User gekickt?
    const kicked = data.kicked || {};
    if (kicked[State.uid]) throw new Error('Du wurdest aus dieser Lobby entfernt.');

    // Spieler-Limit prüfen (Rejoin zählt nicht als neuer Slot)
    const currentCount = Object.keys(data.players || {}).length;
    const limit        = data.maxPlayers || 8;
    const isRejoin     = !!(data.players && data.players[State.uid]);
    if (!isRejoin && currentCount >= limit) {
      throw new Error(`Die Lobby ist voll (max. ${limit} Spieler).`);
    }

    await db.ref(`lobbies/${code}/players/${State.uid}`).set({ name, ready: false });

    State.lobbyCode  = code;
    State.isHost     = (data.host === State.uid);
    State.maxPlayers = limit;
    log('Beigetreten:', code, '| isHost:', State.isHost);

  } else {
    // ── Neue Lobby erstellen ──
    const newCode = generateLobbyCode();
    await db.ref(`lobbies/${newCode}`).set({
      host:       State.uid,
      phase:      'lobby',
      maxPlayers: State.maxPlayers,
      secretWord: null,
      guesserUID: null,
      guess:      null,
      kicked:     {},
      players:    { [State.uid]: { name, ready: false } },
      clues:      {},
    });

    State.lobbyCode = newCode;
    State.isHost    = true;

    // Lobby-Code für Host-Reconnect in localStorage speichern
    localStorage.setItem('onechance_lobby', newCode);
    log('Neue Lobby erstellt:', newCode, '| Limit:', State.maxPlayers);
  }

  saveName(name);

  // Beim Tab-Schließen: Nur Gäste entfernen sich automatisch.
  // Der Host-Eintrag bleibt für Reconnect.
  window.addEventListener('beforeunload', () => {
    if (!State.isHost) {
      db.ref(`lobbies/${State.lobbyCode}/players/${State.uid}`).remove();
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  LOBBY-SCREEN
// ══════════════════════════════════════════════════════════════

function enterLobbyScreen() {
  log('Lobby-Screen – Code:', State.lobbyCode, '| isHost:', State.isHost);

  removeAllListeners(); // Doppelte Listener verhindern

  document.getElementById('lobby-code-display').textContent = State.lobbyCode;

  const hostControls = document.getElementById('host-controls');
  const waitingMsg   = document.getElementById('waiting-msg');
  const inviteArea   = document.getElementById('invite-area');
  const limitDisplay = document.getElementById('limit-display');

  if (State.isHost) {
    hostControls.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
    // Limit-Dropdown auf aktuellen Wert setzen
    const sel = document.getElementById('select-max-players');
    if (sel) sel.value = String(State.maxPlayers);
  } else {
    hostControls.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }

  // Einlade-Bereich für alle sichtbar
  if (inviteArea) inviteArea.classList.remove('hidden');

  // ── Kicked-Listener: Prüfen ob DIESER User rausgeworfen wurde ──
  const kickedRef = State.db.ref(`lobbies/${State.lobbyCode}/kicked/${State.uid}`);
  addListener(kickedRef, 'value', (snap) => {
    if (snap.val() === true) {
      log('Dieser Spieler wurde gekickt');
      removeAllListeners();
      localStorage.removeItem('onechance_lobby');
      State.lobbyCode = null;
      State.isHost    = false;
      showScreen('start');
      showToast('🚫 Du wurdest aus der Lobby entfernt.');
    }
  });

  // ── Spielerliste live ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/players`),
    'value',
    (snap) => {
      State.players = snap.val() || {};
      log('Spieler:', Object.keys(State.players).length);
      renderPlayerList();
      updateStartButton();
    }
  );

  // ── Spieler-Limit live beobachten (für Gäste) ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/maxPlayers`),
    'value',
    (snap) => {
      const limit = snap.val();
      if (limit) {
        State.maxPlayers = limit;
        if (limitDisplay) limitDisplay.textContent = `Max. ${limit} Spieler`;
      }
    }
  );

  // ── Phasenwechsel ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/phase`),
    'value',
    (snap) => {
      const phase = snap.val();
      log('Phase:', phase);
      if (phase && phase !== 'lobby') handlePhaseChange(phase);
    }
  );

  showScreen('lobby');
}

// ── Spielerliste rendern ──────────────────────────────────────
function renderPlayerList() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';

  State.db.ref(`lobbies/${State.lobbyCode}/host`).once('value').then(snap => {
    const dbHostUID = snap.val();
    const count     = Object.keys(State.players).length;

    // Spielerzähler
    const counter = document.getElementById('player-count');
    if (counter) counter.textContent = `${count} / ${State.maxPlayers}`;

    Object.entries(State.players).forEach(([uid, player]) => {
      const li = document.createElement('li');

      // Avatar
      const avatar = document.createElement('div');
      avatar.className   = 'player-avatar';
      avatar.textContent = (player.name || '?')[0].toUpperCase();

      const nameEl = document.createElement('span');
      nameEl.className   = 'player-name';
      nameEl.textContent = player.name;

      li.appendChild(avatar);
      li.appendChild(nameEl);

      // Host-Badge
      if (uid === dbHostUID) {
        const badge = document.createElement('span');
        badge.className   = 'host-badge';
        badge.textContent = 'HOST';
        li.appendChild(badge);
      }

      // Ich-Badge (für Gäste)
      if (uid === State.uid && uid !== dbHostUID) {
        const meBadge = document.createElement('span');
        meBadge.className   = 'me-badge';
        meBadge.textContent = 'Du';
        li.appendChild(meBadge);
      }

      // Kick-Button: nur für Host, nicht für sich selbst
      if (State.isHost && uid !== State.uid) {
        const kickBtn = document.createElement('button');
        kickBtn.className   = 'btn-kick';
        kickBtn.title       = `${player.name} entfernen`;
        kickBtn.textContent = '✕';
        kickBtn.addEventListener('click', () => {
          if (confirm(`${player.name} wirklich aus der Lobby entfernen?`)) {
            kickPlayer(uid);
          }
        });
        li.appendChild(kickBtn);
      }

      list.appendChild(li);
    });
  });
}

// Start-Button freischalten ab 3 Spielern
function updateStartButton() {
  const count = Object.keys(State.players).length;
  const btn   = document.getElementById('btn-start');
  const hint  = document.getElementById('host-hint');
  if (!btn) return;

  btn.disabled = count < 3;
  hint.textContent = count >= 3
    ? `${count} Spieler bereit – los geht's!`
    : `Mindestens 3 Spieler benötigt (aktuell: ${count}).`;
}

// ══════════════════════════════════════════════════════════════
//  SPIEL STARTEN
// ══════════════════════════════════════════════════════════════

async function startGame() {
  log('Spiel starten');
  const playerUIDs   = Object.keys(State.players);
  const guesserUID   = playerUIDs[Math.floor(Math.random() * playerUIDs.length)];
  const word         = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];

  log('Rater:', State.players[guesserUID]?.name, '| Wort:', word);

  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase:      'clue',
    secretWord: word,
    guesserUID: guesserUID,
    clues:      {},
    guess:      null,
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASENWECHSEL
// ══════════════════════════════════════════════════════════════

async function handlePhaseChange(phase) {
  log('Phasenwechsel:', phase);

  const snap = await State.db.ref(`lobbies/${State.lobbyCode}`).once('value');
  const data  = snap.val();

  State.phase      = phase;
  State.secretWord = data.secretWord;
  State.guesserUID = data.guesserUID;
  State.isGuesser  = (State.uid === State.guesserUID);
  State.clues      = data.clues || {};

  switch (phase) {
    case 'clue':   enterCluePhase();         break;
    case 'reveal': enterRevealPhase();        break;
    case 'guess':  enterGuessPhase();         break;
    case 'result': enterResultPhase(data.guess); break;
  }
}

// ══════════════════════════════════════════════════════════════
//  PHASE: CLUE
// ══════════════════════════════════════════════════════════════

function enterCluePhase() {
  log('Clue-Phase – isGuesser:', State.isGuesser);
  if (State.isGuesser) {
    showScreen('guesserWait');
  } else {
    document.getElementById('secret-word-display').textContent = State.secretWord;
    document.getElementById('input-clue').value    = '';
    document.getElementById('input-clue').disabled = false;
    document.getElementById('btn-submit-clue').disabled = false;
    document.getElementById('clue-submitted-msg').classList.add('hidden');
    showScreen('clue');
    watchForAllCluesSubmitted();
  }
}

async function submitClue() {
  const clueText = document.getElementById('input-clue').value.trim();
  if (!clueText) return;

  log('Hinweis:', clueText);
  document.getElementById('input-clue').disabled      = true;
  document.getElementById('btn-submit-clue').disabled = true;
  document.getElementById('clue-submitted-msg').classList.remove('hidden');

  await State.db.ref(`lobbies/${State.lobbyCode}/clues/${State.uid}`).set(clueText);
}

function watchForAllCluesSubmitted() {
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/clues`),
    'value',
    async (snap) => {
      const clues       = snap.val() || {};
      const clueCount   = Object.keys(clues).length;
      const giversCount = Object.keys(State.players).length - 1;

      log(`Clues: ${clueCount}/${giversCount}`);

      if (clueCount >= giversCount && State.isHost) {
        await State.db.ref(`lobbies/${State.lobbyCode}`).update({
          phase: 'reveal',
          clues: clues,
        });
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
//  PHASE: REVEAL
// ══════════════════════════════════════════════════════════════

async function enterRevealPhase() {
  log('Reveal-Phase');

  const snap  = await State.db.ref(`lobbies/${State.lobbyCode}/clues`).once('value');
  State.clues = snap.val() || {};

  const allClues   = Object.entries(State.clues);
  const duplicates = findDuplicates(allClues.map(([, t]) => t));
  log('Duplikate:', [...duplicates]);

  const list = document.getElementById('clue-list');
  list.innerHTML = '';
  allClues.forEach(([uid, text], i) => {
    const li     = document.createElement('li');
    const bullet = document.createElement('div');
    bullet.className   = 'clue-bullet';
    bullet.textContent = i + 1;
    li.appendChild(bullet);
    li.appendChild(document.createTextNode(text));
    li.dataset.text = text.toLowerCase().trim();
    list.appendChild(li);
  });

  showScreen('reveal');
  setTimeout(() => animateStrikethrough(duplicates), 800);

  const animMs = 800 + duplicates.size * 500 + 1200;
  setTimeout(() => {
    if (State.isHost) {
      document.getElementById('btn-to-guess').classList.remove('hidden');
    }
  }, animMs);
}

function findDuplicates(texts) {
  const seen  = new Set();
  const dupes = new Set();
  texts.forEach(t => {
    const n = t.toLowerCase().trim();
    if (seen.has(n)) dupes.add(n);
    else seen.add(n);
  });
  return dupes;
}

function animateStrikethrough(duplicates) {
  if (!duplicates.size) return;
  let delay = 0;
  document.querySelectorAll('#clue-list li').forEach(li => {
    if (duplicates.has(li.dataset.text)) {
      setTimeout(() => li.classList.add('strike'), delay);
      delay += 500;
    }
  });
}

async function proceedToGuess() {
  log('Zu Guess-Phase');
  const snap  = await State.db.ref(`lobbies/${State.lobbyCode}/clues`).once('value');
  const clues = snap.val() || {};
  const dupes = findDuplicates(Object.values(clues));

  const validClues = {};
  Object.entries(clues).forEach(([uid, text]) => {
    if (!dupes.has(text.toLowerCase().trim())) validClues[uid] = text;
  });

  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: 'guess',
    clues: validClues,
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASE: GUESS
// ══════════════════════════════════════════════════════════════

async function enterGuessPhase() {
  log('Guess-Phase – isGuesser:', State.isGuesser);

  const snap  = await State.db.ref(`lobbies/${State.lobbyCode}/clues`).once('value');
  State.clues = snap.val() || {};

  if (State.isGuesser) {
    const list = document.getElementById('guesser-clue-list');
    list.innerHTML = '';
    Object.values(State.clues).forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
    document.getElementById('input-guess').value = '';
    showScreen('guess');
  } else {
    document.querySelector('#screen-guesser-wait .wait-title').textContent = 'Der Rater denkt nach…';
    showScreen('guesserWait');
    addListener(
      State.db.ref(`lobbies/${State.lobbyCode}/phase`),
      'value',
      (snap) => {
        if (snap.val() === 'result') {
          State.db.ref(`lobbies/${State.lobbyCode}`).once('value').then(s => {
            enterResultPhase(s.val().guess);
          });
        }
      }
    );
  }
}

async function submitGuess() {
  const guessText = document.getElementById('input-guess').value.trim();
  if (!guessText) return;

  log('Antwort:', guessText);
  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: 'result',
    guess: guessText,
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASE: RESULT
// ══════════════════════════════════════════════════════════════

async function enterResultPhase(guess) {
  log('Result-Phase – Antwort:', guess, '| Wort:', State.secretWord);

  const correct = guess?.toLowerCase().trim() === State.secretWord?.toLowerCase().trim();
  log(correct ? '✓ RICHTIG' : '✗ FALSCH');

  document.getElementById('result-icon').textContent  = correct ? '🎉' : '😬';
  document.getElementById('result-title').textContent = correct ? 'Richtig!' : 'Leider falsch…';
  document.getElementById('result-title').className   = 'result-title ' + (correct ? 'correct' : 'wrong');

  const guesserName = State.players[State.guesserUID]?.name || 'Der Rater';
  document.getElementById('result-guess').innerHTML =
    `<strong>${guesserName}</strong> hat „<strong>${guess || '—'}</strong>" geraten.`;
  document.getElementById('result-word').innerHTML =
    `Das gesuchte Wort war: <strong>${State.secretWord}</strong>`;

  if (State.isHost) {
    document.getElementById('host-next-controls').classList.remove('hidden');
    document.getElementById('waiting-next-msg').classList.add('hidden');
  } else {
    document.getElementById('host-next-controls').classList.add('hidden');
    document.getElementById('waiting-next-msg').classList.remove('hidden');
  }

  showScreen('result');
}

// ══════════════════════════════════════════════════════════════
//  NÄCHSTE RUNDE / BEENDEN
// ══════════════════════════════════════════════════════════════

async function nextRound() {
  log('Nächste Runde');
  removeAllListeners();
  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase:      'lobby',
    secretWord: null,
    guesserUID: null,
    clues:      {},
    guess:      null,
  });
  setTimeout(() => enterLobbyScreen(), 300);
}

async function endGame() {
  log('Spiel beenden');
  removeAllListeners();
  await State.db.ref(`lobbies/${State.lobbyCode}`).remove();
  localStorage.removeItem('onechance_lobby');
  State.lobbyCode = null;
  State.isHost    = false;
  showScreen('start');
}

// ══════════════════════════════════════════════════════════════
//  EVENT LISTENER
// ══════════════════════════════════════════════════════════════

document.getElementById('btn-join').addEventListener('click', async () => {
  const name  = document.getElementById('input-name').value.trim();
  const code  = document.getElementById('input-lobby').value.trim().toUpperCase();
  const errEl = document.getElementById('start-error');
  errEl.textContent = '';

  if (!name)     { errEl.textContent = 'Bitte gib deinen Namen ein.'; return; }
  if (!State.db) { errEl.textContent = 'Firebase nicht verbunden.';   return; }

  // Spieler-Limit aus Start-Dropdown (nur wenn neue Lobby)
  const limitSel = document.getElementById('select-max-players-start');
  if (limitSel && !code) State.maxPlayers = parseInt(limitSel.value, 10);

  log('Join-Klick – Name:', name, '| Code:', code || '(neu)');

  try {
    State.uid  = getOrCreateUID();
    State.name = name;
    await joinOrCreateLobby(name, code);
    enterLobbyScreen();
  } catch (e) {
    log('Fehler:', e.message);
    errEl.textContent = e.message;
  }
});

// Enter-Taste
document.getElementById('input-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});
document.getElementById('input-lobby').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// Code kopieren
document.getElementById('btn-copy-code').addEventListener('click', () => {
  const code = document.getElementById('lobby-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('📋 Code kopiert!');
    document.getElementById('btn-copy-code').textContent = '✓';
    setTimeout(() => document.getElementById('btn-copy-code').textContent = '⧉', 1500);
  });
});

// Einlade-Buttons
document.getElementById('btn-invite-link').addEventListener('click', copyInviteLink);
document.getElementById('btn-invite-wa').addEventListener('click', shareWhatsApp);

// Spieler-Limit Dropdown (in Lobby)
document.getElementById('select-max-players').addEventListener('change', e => {
  updateMaxPlayers(e.target.value);
});

// Start
document.getElementById('btn-start').addEventListener('click', startGame);

// Hinweis
document.getElementById('btn-submit-clue').addEventListener('click', submitClue);
document.getElementById('input-clue').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitClue();
});

// Reveal → Guess
document.getElementById('btn-to-guess').addEventListener('click', proceedToGuess);

// Raten
document.getElementById('btn-submit-guess').addEventListener('click', submitGuess);
document.getElementById('input-guess').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitGuess();
});

// Ergebnis
document.getElementById('btn-next-round').addEventListener('click', nextRound);
document.getElementById('btn-end-game').addEventListener('click', endGame);

// ══════════════════════════════════════════════════════════════
//  INITIALISIERUNG
// ══════════════════════════════════════════════════════════════

(async function init() {
  log('Init');

  const ok = initFirebase();
  if (!ok) {
    showScreen('start');
    document.getElementById('start-error').textContent =
      'Firebase-Verbindung fehlgeschlagen. Bitte Seite neu laden.';
    return;
  }

  // UID laden
  State.uid = getOrCreateUID();

  // Letzten Namen vorausfüllen
  const savedName = loadSavedName();
  if (savedName) {
    document.getElementById('input-name').value = savedName;
    log('Letzter Name:', savedName);
  }

  // URL-Parameter: ?lobby=CODE → Einlade-Link
  const urlParams  = new URLSearchParams(window.location.search);
  const lobbyParam = urlParams.get('lobby');
  if (lobbyParam) {
    document.getElementById('input-lobby').value = lobbyParam.toUpperCase();
    log('Lobby aus URL:', lobbyParam);
    showToast(`🎮 Lobby ${lobbyParam} – Namen eingeben und beitreten!`);
  }

  // Host-Reconnect prüfen (nur wenn kein URL-Parameter)
  if (!lobbyParam) {
    const reconnected = await checkHostReconnect(State.uid);
    if (reconnected) return;
  }

  showScreen('start');
})();
