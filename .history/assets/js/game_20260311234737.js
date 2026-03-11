/**
 * ═══════════════════════════════════════════════════════════════
 *  One Chance – game.js v1.4.0
 *
 *  Rollen:
 *    spieler   – normaler Spieler, gibt Hinweise, kann raten
 *    zuschauer – sieht alles (Wort + Eingaben), zählt nicht zum Limit
 *    moderator – wie Zuschauer + kann Hinweise streichen + Verdikt
 *    tv        – TV-Spieler: rät immer, sieht nichts bis die Hints kommen
 *
 *  Spielphasen:
 *    lobby → clue → mod-review (optional) → reveal → guess → result
 *
 *  Datenbankstruktur:
 *  /lobbies/{code}/
 *    ├── host, phase, maxPlayers, category
 *    ├── secretWord, guesserUID, guess, verdict
 *    ├── modUID          – UID des Moderators (optional)
 *    ├── tvUID           – UID des TV-Spielers (optional)
 *    ├── modStrikes/     – { uid: true }  manuell vom Mod gestrichene Hinweise
 *    ├── kicked/         – { uid: true }
 *    ├── players/        – { uid: { name, role, ready } }
 *    └── clues/          – { uid: string }
 *
 * ═══════════════════════════════════════════════════════════════
 */

// ── Logger ─────────────────────────────────────────────────────
function log(msg, data = null) {
  const ts = new Date().toLocaleTimeString("de-AT");
  data !== null
    ? console.log(`[OneChance ${ts}] ${msg}`, data)
    : console.log(`[OneChance ${ts}] ${msg}`);
}
log("game.js v1.4.0 geladen");

// ══════════════════════════════════════════════════════════════
//  WORTLISTEN nach Kategorie
//  Die Arrays kommen aus den separaten words-*.js Dateien
// ══════════════════════════════════════════════════════════════
const WORD_LISTS = {
  leicht:
    typeof WORDS_LEICHT !== "undefined"
      ? WORDS_LEICHT
      : ["Strand", "Wolke", "Elefant"],
  mittel:
    typeof WORDS_MITTEL !== "undefined"
      ? WORDS_MITTEL
      : ["Nostalgie", "Paradoxon"],
  schwer:
    typeof WORDS_SCHWER !== "undefined"
      ? WORDS_SCHWER
      : ["Epiphanie", "Palimpsest"],
  fsk18:
    typeof WORDS_FSK18 !== "undefined"
      ? WORDS_FSK18
      : ["Flirt", "Liebeskummer"],
};

function getRandomWord(category) {
  const list = WORD_LISTS[category] || WORD_LISTS.leicht;
  return list[Math.floor(Math.random() * list.length)];
}

// ══════════════════════════════════════════════════════════════
//  ZUSTAND
// ══════════════════════════════════════════════════════════════
const State = {
  uid: null,
  name: null,
  role: "spieler", // spieler | zuschauer | moderator | tv
  lobbyCode: null,
  isHost: false,
  isMod: false, // ist dieser User Moderator?
  isTV: false, // ist dieser User TV-Spieler?
  isGuesser: false,
  isViewer: false, // Zuschauer (zählt nicht zum Limit)
  phase: null,
  secretWord: null,
  guesserUID: null,
  modUID: null,
  tvUID: null,
  hostUID: null, // FIX: gecacht, damit renderPlayerList() synchron bleibt
  maxPlayers: 8,
  category: "leicht",
  players: {},
  clues: {},
  modStrikes: {}, // vom Mod manuell gestrichene Clue-UIDs
  db: null,
  listeners: [], // normale Listener – werden bei Phasenwechsel geleert
  _centralRef: null, // Firebase-Ref des zentralen Listeners (nie in listeners[])
  _centralFn: null, // Callback des zentralen Listeners
};

// ── DOM-Referenzen ─────────────────────────────────────────────
const screens = {
  start: document.getElementById("screen-start"),
  lobby: document.getElementById("screen-lobby"),
  clue: document.getElementById("screen-clue"),
  guesserWait: document.getElementById("screen-guesser-wait"),
  modReview: document.getElementById("screen-mod-review"),
  reveal: document.getElementById("screen-reveal"),
  guess: document.getElementById("screen-guess"),
  tvWait: document.getElementById("screen-tv-wait"),
  observer: document.getElementById("screen-observer"),
  result: document.getElementById("screen-result"),
};

// ══════════════════════════════════════════════════════════════
//  PERSISTENZ (localStorage)
// ══════════════════════════════════════════════════════════════
function getOrCreateUID() {
  let uid = localStorage.getItem("onechance_uid");
  if (!uid) {
    uid = "u_" + Math.random().toString(36).slice(2, 11);
    localStorage.setItem("onechance_uid", uid);
    log("Neue UID:", uid);
  } else {
    log("UID geladen:", uid);
  }
  return uid;
}
function loadSavedName() {
  return localStorage.getItem("onechance_name") || "";
}
function saveName(n) {
  localStorage.setItem("onechance_name", n);
}

// ══════════════════════════════════════════════════════════════
//  FIREBASE
// ══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBwrDM4sBowMX5ozhllSZOmy0tItp0iFJM",
  authDomain: "one-chance-63038.firebaseapp.com",
  databaseURL:
    "https://one-chance-63038-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "one-chance-63038",
  storageBucket: "one-chance-63038.firebasestorage.app",
  messagingSenderId: "19576021800",
  appId: "1:19576021800:web:dce22e95049af27362e61d",
  measurementId: "G-H820F9L3JY",
};

function initFirebase() {
  try {
    if (firebase.apps.length === 0) firebase.initializeApp(FIREBASE_CONFIG);
    State.db = firebase.database();
    log("Firebase verbunden");
    return true;
  } catch (e) {
    log("Firebase-Fehler:", e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════════
function showScreen(name) {
  log("Screen:", name);
  Object.entries(screens).forEach(([k, el]) =>
    el.classList.toggle("active", k === name),
  );

  // Host-Abbruch-Button auf allen Spielscreens (nicht auf start/lobby/result)
  const gameScreens = [
    "clue",
    "guesserWait",
    "modReview",
    "reveal",
    "guess",
    "tvWait",
    "observer",
  ];
  if (State.isHost) {
    injectHostAbortButton();
    showHostAbortButton(gameScreens.includes(name));
  }

  // Leave-Button für Nicht-Hosts: auf Spielscreens + Lobby
  if (!State.isHost && State.lobbyCode) {
    injectLeaveButton();
    // Auf Lobby-Screen: eigener Button dort vorhanden (btn-leave-lobby)
    // Floating Leave-Button nur auf Spielscreens
    showLeaveButton(gameScreens.includes(name));
  } else {
    showLeaveButton(false);
  }
}

function showToast(msg, duration = 3000) {
  log("Toast:", msg);
  let t = document.getElementById("oc-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "oc-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), duration);
}

function generateLobbyCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += c[Math.floor(Math.random() * c.length)];
  log("Code:", code);
  return code;
}

function removeAllListeners() {
  // Normale Listener entfernen (Lobby-Details, Clues, etc.)
  // Der zentrale Root-Listener (_centralRef) bleibt aktiv – er überlebt Phasenwechsel!
  State.listeners.forEach(({ ref, event, fn }) => ref.off(event, fn));
  State.listeners = [];
  log("Normale Listener entfernt (zentraler Listener bleibt aktiv)");
}

function removeCentralListener() {
  // Nur beim echten Verlassen der Lobby aufrufen (Start-Screen).
  if (State._centralRef && State._centralFn) {
    State._centralRef.off("value", State._centralFn);
    State._centralRef = null;
    State._centralFn = null;
    log("Zentraler Listener entfernt");
  }
}

function addListener(ref, event, fn) {
  ref.on(event, fn);
  State.listeners.push({ ref, event, fn });
}

// Slider-Fill (CSS-Variable für Gradient)
function updateSliderFill(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--val", pct + "%");
}

// Kategorie-Label
const CAT_LABELS = {
  leicht: "😊 Leicht",
  mittel: "🤔 Mittel",
  schwer: "🧠 Schwer",
  fsk18: "🔞 FSK18",
};

// ══════════════════════════════════════════════════════════════
//  QR-CODE GENERIEREN
// ══════════════════════════════════════════════════════════════
function generateQR(code) {
  const area = document.getElementById("qr-area");
  const qrDiv = document.getElementById("qrcode");
  if (!area || !qrDiv) return;

  const link = generateInviteLink(code);
  qrDiv.innerHTML = "";

  try {
    new QRCode(qrDiv, {
      text: link,
      width: 160,
      height: 160,
      colorDark: "#e8eaf6",
      colorLight: "#1e2235",
    });
    area.classList.remove("hidden");
    log("QR-Code generiert für:", link);
  } catch (e) {
    log("QR-Fehler:", e);
  }
}

// ══════════════════════════════════════════════════════════════
//  EINLADE-LINK
// ══════════════════════════════════════════════════════════════
function generateInviteLink(code) {
  return window.location.href.split("?")[0].split("#")[0] + "?lobby=" + code;
}

function copyInviteLink() {
  const link = generateInviteLink(State.lobbyCode);
  navigator.clipboard
    .writeText(link)
    .then(() => {
      showToast("🔗 Link kopiert!");
      const btn = document.getElementById("btn-invite-link");
      btn.textContent = "✓ Kopiert!";
      setTimeout(() => (btn.textContent = "🔗 Link kopieren"), 2000);
    })
    .catch(() => prompt("Link:", link));
}

function shareWhatsApp() {
  const link = generateInviteLink(State.lobbyCode);
  const text = encodeURIComponent(
    `Komm in meine One Chance Lobby!\nCode: ${State.lobbyCode}\n${link}`,
  );
  window.open(`https://wa.me/?text=${text}`, "_blank");
}

// ══════════════════════════════════════════════════════════════
//  HOST-RECONNECT
// ══════════════════════════════════════════════════════════════
async function checkHostReconnect(uid) {
  const savedCode = localStorage.getItem("onechance_lobby");
  if (!savedCode) return false;
  log("Reconnect-Check für:", savedCode);

  try {
    const snap = await State.db.ref(`lobbies/${savedCode}`).once("value");
    if (!snap.exists()) {
      localStorage.removeItem("onechance_lobby");
      return false;
    }
    const data = snap.val();
    if (data.host !== uid) {
      localStorage.removeItem("onechance_lobby");
      return false;
    }

    const savedName = loadSavedName() || "Host";
    await State.db
      .ref(`lobbies/${savedCode}/players/${uid}`)
      .set({ name: savedName, role: "spieler", ready: false });

    State.lobbyCode = savedCode;
    State.isHost = true;
    State.hostUID = uid; // FIX: Host-UID cachen
    State.name = savedName;
    State.maxPlayers = data.maxPlayers || 8;
    State.category = data.category || "leicht";
    State.modUID = data.modUID || null;
    State.tvUID = data.tvUID || null;

    showToast("🔄 Als Host wiederverbunden!");
    enterLobbyScreen(); // enterLobbyScreen ruft startCentralListener() selbst auf
    return true;
  } catch (e) {
    log("Reconnect-Fehler:", e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  SPIELER-RECONNECT (war beim Spielstart dabei, Seite neu geladen)
//  Prüft ob die UID noch in einer laufenden Lobby registriert ist
//  und springt direkt in die aktuelle Spielphase.
// ══════════════════════════════════════════════════════════════
async function checkPlayerReconnect(uid) {
  const savedCode = localStorage.getItem("onechance_player_lobby");
  if (!savedCode) return false;
  log("Spieler-Reconnect-Prüfung für Lobby:", savedCode);

  try {
    const snap = await State.db.ref(`lobbies/${savedCode}`).once("value");
    if (!snap.exists()) {
      localStorage.removeItem("onechance_player_lobby");
      return false;
    }

    const data = snap.val();
    const players = data.players || {};

    // Spieler muss noch in der Spielerliste stehen
    if (!players[uid]) {
      log("UID nicht mehr in Lobby – kein Reconnect");
      localStorage.removeItem("onechance_player_lobby");
      return false;
    }

    // Nicht in der Lobby-Phase reconnecten (das ist normaler Beitritt)
    if (data.phase === "lobby") {
      log("Lobby-Phase – normaler Beitritt statt Reconnect");
      return false;
    }

    log("Spieler-Reconnect erfolgreich! Phase:", data.phase);

    // State wiederherstellen
    State.lobbyCode = savedCode;
    State.name = players[uid].name;
    State.role = players[uid].role || "spieler";
    State.isHost = data.host === uid;
    State.hostUID = data.host;
    State.isMod = uid === data.modUID;
    State.isTV = uid === data.tvUID;
    State.isViewer = State.role === "zuschauer";
    State.maxPlayers = data.maxPlayers || 8;
    State.category = data.category || "leicht";
    State.modUID = data.modUID || null;
    State.tvUID = data.tvUID || null;
    State.secretWord = data.secretWord;
    State.guesserUID = data.guesserUID;
    State.isGuesser = uid === data.guesserUID;
    State.clues = data.clues || {};
    State.modStrikes = data.modStrikes || {};
    State.players = players;
    State.phase = data.phase;

    // Name vorausfüllen
    document.getElementById("input-name").value = State.name;

    showToast("🔄 Wiederverbunden!");

    // Globalen Phasen-Listener starten damit Host-Abbruch funktioniert
    startCentralListener();

    // Direkt in die aktuelle Phase springen
    handlePhaseChange(data.phase);
    return true;
  } catch (e) {
    log("Spieler-Reconnect-Fehler:", e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  LOBBY ERSTELLEN / BEITRETEN
// ══════════════════════════════════════════════════════════════
async function joinOrCreateLobby(name, code, role) {
  log("joinOrCreate – Name:", name, "Code:", code || "(neu)", "Rolle:", role);
  const db = State.db;

  if (code) {
    const snap = await db.ref(`lobbies/${code}`).once("value");
    if (!snap.exists()) throw new Error("Lobby nicht gefunden.");
    const data = snap.val();
    if (data.phase !== "lobby")
      throw new Error("Das Spiel hat bereits begonnen.");

    const kicked = data.kicked || {};
    if (kicked[State.uid])
      throw new Error("Du wurdest aus dieser Lobby entfernt.");

    // Zuschauer und Moderator zählen nicht zum Limit
    if (role !== "zuschauer") {
      const modUID = data.modUID || null;
      const playerEntries = Object.entries(data.players || {});
      // Aktive Spieler = keine Zuschauer, kein Mod
      const activeCount = playerEntries.filter(
        ([uid, p]) => p.role !== "zuschauer" && uid !== modUID,
      ).length;
      const limit = data.maxPlayers || 8;
      const isRejoin = !!(data.players && data.players[State.uid]);
      if (!isRejoin && activeCount >= limit) {
        throw new Error(`Die Lobby ist voll (max. ${limit} Spieler).`);
      }
    }

    await db
      .ref(`lobbies/${code}/players/${State.uid}`)
      .set({ name, role, ready: false });

    State.lobbyCode = code;
    State.isHost = data.host === State.uid;
    State.hostUID = data.host; // FIX: Host-UID cachen
    State.maxPlayers = data.maxPlayers || 8;
    State.category = data.category || "leicht";
    State.modUID = data.modUID || null;
    State.tvUID = data.tvUID || null;
    log("Lobby beigetreten:", code);
    // Reconnect-Code für Spieler speichern
    localStorage.setItem("onechance_player_lobby", code);
  } else {
    const newCode = generateLobbyCode();
    await db.ref(`lobbies/${newCode}`).set({
      host: State.uid,
      phase: "lobby",
      maxPlayers: State.maxPlayers,
      category: State.category,
      secretWord: null,
      guesserUID: null,
      guess: null,
      verdict: null,
      modUID: null,
      tvUID: null,
      modStrikes: {},
      kicked: {},
      players: { [State.uid]: { name, role: "spieler", ready: false } },
      clues: {},
    });
    State.lobbyCode = newCode;
    State.isHost = true;
    State.hostUID = State.uid; // FIX: Host-UID cachen
    localStorage.setItem("onechance_lobby", newCode);
    localStorage.setItem("onechance_player_lobby", newCode); // auch als Spieler speichern
    log("Neue Lobby:", newCode);
  }

  saveName(name);
  State.role = role;
  State.isMod = State.uid === State.modUID;
  State.isTV = State.uid === State.tvUID;
  State.isViewer = role === "zuschauer";

  window.addEventListener("beforeunload", () => {
    if (!State.isHost)
      db.ref(`lobbies/${State.lobbyCode}/players/${State.uid}`).remove();
  });
}

// ══════════════════════════════════════════════════════════════
//  KICK & ROLLEN-MANAGEMENT (Host + Mod)
// ══════════════════════════════════════════════════════════════
async function kickPlayer(uid) {
  const name = State.players[uid]?.name || "Spieler";
  log("Kick:", name);
  await State.db.ref(`lobbies/${State.lobbyCode}/kicked/${uid}`).set(true);
  await State.db.ref(`lobbies/${State.lobbyCode}/players/${uid}`).remove();
  showToast(`🚫 ${name} entfernt.`);
}

async function setModerator(uid) {
  const name = State.players[uid]?.name || "Spieler";
  const current = State.modUID;
  if (current === uid) {
    // Moderator entfernen
    await State.db.ref(`lobbies/${State.lobbyCode}/modUID`).set(null);
    showToast(`${name} ist kein Moderator mehr.`);
  } else {
    await State.db.ref(`lobbies/${State.lobbyCode}/modUID`).set(uid);
    showToast(`${name} ist jetzt Moderator.`);
  }
}

async function setTVPlayer(uid) {
  const name = State.players[uid]?.name || "Spieler";
  const current = State.tvUID;
  if (current === uid) {
    await State.db.ref(`lobbies/${State.lobbyCode}/tvUID`).set(null);
    document.getElementById("qr-area")?.classList.add("hidden");
    showToast(`TV-Spieler entfernt.`);
  } else {
    await State.db.ref(`lobbies/${State.lobbyCode}/tvUID`).set(uid);
    generateQR(State.lobbyCode);
    showToast(`📺 ${name} ist jetzt TV-Spieler.`);
  }
}

// ══════════════════════════════════════════════════════════════
//  SPIELER-LIMIT & KATEGORIE
// ══════════════════════════════════════════════════════════════
async function updateMaxPlayers(val) {
  State.maxPlayers = parseInt(val, 10);
  await State.db
    .ref(`lobbies/${State.lobbyCode}/maxPlayers`)
    .set(State.maxPlayers);
  showToast(`👥 Limit: ${State.maxPlayers}`);
}

async function updateCategory(cat) {
  State.category = cat;
  await State.db.ref(`lobbies/${State.lobbyCode}/category`).set(cat);
  showToast(`📚 Kategorie: ${CAT_LABELS[cat]}`);
}

// ══════════════════════════════════════════════════════════════
//  LOBBY-SCREEN
// ══════════════════════════════════════════════════════════════
function enterLobbyScreen() {
  log("Lobby-Screen – isHost:", State.isHost, "role:", State.role);
  removeAllListeners();

  document.getElementById("lobby-code-display").textContent = State.lobbyCode;
  document.getElementById("category-display").textContent =
    CAT_LABELS[State.category] || State.category;

  const hostControls = document.getElementById("host-controls");
  const waitingMsg = document.getElementById("waiting-msg");
  const inviteArea = document.getElementById("invite-area");

  if (State.isHost) {
    hostControls.classList.remove("hidden");
    waitingMsg.classList.add("hidden");
    const sel = document.getElementById("lobby-slider-max");
    if (sel) {
      sel.value = String(State.maxPlayers);
      updateSliderFill(sel);
      document.getElementById("lobby-slider-val").textContent =
        State.maxPlayers;
    }
    // Kategorie-Chips im Lobby setzen
    document.querySelectorAll("#lobby-category-chips .chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.cat === State.category);
    });
  } else {
    hostControls.classList.add("hidden");
    waitingMsg.classList.remove("hidden");
    // Leave-Button im Lobby-Screen für Nicht-Hosts einblenden
    document.getElementById("btn-leave-lobby").classList.remove("hidden");
  }

  if (inviteArea) inviteArea.classList.remove("hidden");

  // QR-Code falls TV-Spieler vorhanden
  if (State.tvUID) generateQR(State.lobbyCode);

  // ── Kicked-Listener ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/kicked/${State.uid}`),
    "value",
    (snap) => {
      if (snap.val() === true) {
        removeCentralListener();
        removeAllListeners();
        localStorage.removeItem("onechance_lobby");
        localStorage.removeItem("onechance_player_lobby");
        State.lobbyCode = null;
        State.isHost = false;
        showScreen("start");
        showToast("🚫 Du wurdest aus der Lobby entfernt.");
      }
    },
  );

  // ── Host-UID einmalig laden und cachen (synchrone Basis für renderPlayerList) ──
  State.db
    .ref(`lobbies/${State.lobbyCode}/host`)
    .once("value")
    .then((snap) => {
      State.hostUID = snap.val();
      log("hostUID gecacht:", State.hostUID);
    });

  // ── Spielerliste ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/players`),
    "value",
    (snap) => {
      State.players = snap.val() || {};
      renderPlayerList();
      updateStartButton();
    },
  );

  // ── modUID / tvUID live ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/modUID`),
    "value",
    (snap) => {
      State.modUID = snap.val();
      State.isMod = State.uid === State.modUID;
      renderPlayerList();
    },
  );
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/tvUID`),
    "value",
    (snap) => {
      State.tvUID = snap.val();
      State.isTV = State.uid === State.tvUID;
      if (State.tvUID) generateQR(State.lobbyCode);
      else document.getElementById("qr-area")?.classList.add("hidden");
      renderPlayerList();
    },
  );

  // ── Kategorie live ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/category`),
    "value",
    (snap) => {
      if (snap.val()) {
        State.category = snap.val();
        document.getElementById("category-display").textContent =
          CAT_LABELS[snap.val()] || snap.val();
      }
    },
  );

  // ── Limit live ──
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/maxPlayers`),
    "value",
    (snap) => {
      if (snap.val()) State.maxPlayers = snap.val();
    },
  );

  // ── Zentraler Root-Listener (Spielstart + Lobby-gelöscht) ──
  // startCentralListener() verwaltet EINEN einzigen Listener für alle Events.
  startCentralListener();

  showScreen("lobby");
}

// ── Spielerliste rendern ──────────────────────────────────────
// KEIN async/await hier – State.hostUID ist bereits gecacht,
// damit parallele Listener-Aufrufe sich nicht kumulieren
function renderPlayerList() {
  const list = document.getElementById("player-list");
  list.innerHTML = ""; // einmal löschen, dann synchron neu aufbauen

  const activeCount = Object.entries(State.players).filter(
    ([uid, p]) => p.role !== "zuschauer" && uid !== State.modUID,
  ).length;
  document.getElementById("player-count").textContent =
    `${activeCount} / ${State.maxPlayers}`;

  const hostUID = State.hostUID; // synchron aus State lesen – kein Firebase-Call

  // Sofort rendern (kein then/await → kein Race Condition)
  (function renderEntries() {
    Object.entries(State.players).forEach(([uid, player]) => {
      const li = document.createElement("li");

      const avatar = document.createElement("div");
      avatar.className = "player-avatar";
      avatar.textContent = (player.name || "?")[0].toUpperCase();

      const nameEl = document.createElement("span");
      nameEl.className = "player-name";
      nameEl.textContent = player.name;

      li.appendChild(avatar);
      li.appendChild(nameEl);

      // Badges
      if (uid === hostUID) {
        const b = document.createElement("span");
        b.className = "host-badge";
        b.textContent = "HOST";
        li.appendChild(b);
      }
      if (uid === State.modUID) {
        const b = document.createElement("span");
        b.className = "mod-badge";
        b.textContent = "MOD";
        li.appendChild(b);
      }
      if (uid === State.tvUID) {
        const b = document.createElement("span");
        b.className = "tv-badge";
        b.textContent = "📺 TV";
        li.appendChild(b);
      }
      if (player.role === "zuschauer") {
        const b = document.createElement("span");
        b.className = "viewer-badge";
        b.textContent = "👁 Zuschauer";
        li.appendChild(b);
      }
      if (uid === State.uid && uid !== hostUID) {
        const b = document.createElement("span");
        b.className = "me-badge";
        b.textContent = "Du";
        li.appendChild(b);
      }

      // Aktionsbuttons (Host oder Mod können kicken; nur Host setzt Rollen)
      if ((State.isHost || State.isMod) && uid !== State.uid) {
        const actions = document.createElement("div");
        actions.className = "player-actions";

        // Kick
        const kickBtn = document.createElement("button");
        kickBtn.className = "btn-kick";
        kickBtn.title = `${player.name} entfernen`;
        kickBtn.textContent = "✕";
        kickBtn.addEventListener("click", () => {
          if (confirm(`${player.name} wirklich entfernen?`)) kickPlayer(uid);
        });
        actions.appendChild(kickBtn);

        // Moderator (nur Host)
        if (State.isHost && player.role !== "zuschauer") {
          const modBtn = document.createElement("button");
          modBtn.className = "btn-role-action";
          modBtn.title =
            uid === State.modUID
              ? "Moderator entfernen"
              : "Als Moderator setzen";
          modBtn.textContent = uid === State.modUID ? "🔵" : "⭐";
          modBtn.addEventListener("click", () => setModerator(uid));
          actions.appendChild(modBtn);
        }

        // TV-Spieler (nur Host, nur echte Spieler)
        if (State.isHost && player.role !== "zuschauer") {
          const tvBtn = document.createElement("button");
          tvBtn.className = "btn-role-action btn-tv-action";
          tvBtn.title =
            uid === State.tvUID
              ? "TV-Spieler entfernen"
              : "Als TV-Spieler markieren";
          tvBtn.textContent = uid === State.tvUID ? "📺✕" : "📺";
          tvBtn.addEventListener("click", () => setTVPlayer(uid));
          actions.appendChild(tvBtn);
        }

        li.appendChild(actions);
      }

      list.appendChild(li);
    });
  })(); // IIFE sofort ausführen
}

function updateStartButton() {
  const activeCount = Object.entries(State.players).filter(
    ([uid, p]) => p.role !== "zuschauer" && uid !== State.modUID,
  ).length;
  const btn = document.getElementById("btn-start");
  const hint = document.getElementById("host-hint");
  if (!btn) return;
  btn.disabled = activeCount < 3;
  hint.textContent =
    activeCount >= 3
      ? `${activeCount} Spieler bereit – los geht's!`
      : `Mindestens 3 Spieler benötigt (aktuell: ${activeCount}).`;
}

// ══════════════════════════════════════════════════════════════
//  SPIEL STARTEN
// ══════════════════════════════════════════════════════════════
async function startGame() {
  log("Spiel starten – Kategorie:", State.category);

  // Mögliche Rater: alle aktiven Spieler OHNE Zuschauer
  const activePlayers = Object.entries(State.players).filter(
    ([uid, p]) => p.role !== "zuschauer",
  );

  let guesserUID;

  if (State.tvUID && State.players[State.tvUID]) {
    // TV-Spieler ist immer Rater
    guesserUID = State.tvUID;
    log("TV-Spieler ist Rater:", State.players[guesserUID]?.name);
  } else {
    // Zufälligen Rater wählen
    const idx = Math.floor(Math.random() * activePlayers.length);
    guesserUID = activePlayers[idx][0];

    // Wenn Host raten würde und es keinen Moderator gibt → zufälligen anderen als Wort-Wächter setzen
    if (guesserUID === State.uid && !State.modUID) {
      log(
        "Host wäre Rater ohne Mod – Wort wird trotzdem zufällig gewählt, Mod-Funktion temporär übertragen",
      );
      // Keinen automatischen Mod setzen – der Host sieht das Wort nicht (er ist Rater)
    }
    log("Zufälliger Rater:", State.players[guesserUID]?.name);
  }

  const word = getRandomWord(State.category);
  log("Gesuchtes Wort:", word);

  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: "clue",
    secretWord: word,
    guesserUID: guesserUID,
    clues: {},
    modStrikes: {},
    guess: null,
    verdict: null,
  });

  // Globaler Phasen-Listener für alle Clients starten
  // (wird bei enterLobbyScreen via removeAllListeners gestoppt und neu gestartet)
  startCentralListener();
}

// ══════════════════════════════════════════════════════════════
//  PHASENWECHSEL
// ══════════════════════════════════════════════════════════════
async function handlePhaseChange(phase) {
  log("Phase:", phase);

  const snap = await State.db.ref(`lobbies/${State.lobbyCode}`).once("value");
  const data = snap.val();

  State.phase = phase;
  State.secretWord = data.secretWord;
  State.guesserUID = data.guesserUID;
  State.modUID = data.modUID || null;
  State.tvUID = data.tvUID || null;
  State.isMod = State.uid === State.modUID;
  State.isTV = State.uid === State.tvUID;
  State.isGuesser = State.uid === State.guesserUID;
  State.isViewer = State.role === "zuschauer";
  State.clues = data.clues || {};
  State.modStrikes = data.modStrikes || {};

  switch (phase) {
    case "clue":
      enterCluePhase();
      break;
    case "mod-review":
      enterModReviewPhase();
      break;
    case "reveal":
      enterRevealPhase();
      break;
    case "guess":
      enterGuessPhase();
      break;
    case "result":
      enterResultPhase(data.guess, data.verdict);
      break;
  }
}

// ══════════════════════════════════════════════════════════════
//  PHASE: CLUE
// ══════════════════════════════════════════════════════════════
function enterCluePhase() {
  log(
    "Clue-Phase – isGuesser:",
    State.isGuesser,
    "isTV:",
    State.isTV,
    "isViewer:",
    State.isViewer,
    "isMod:",
    State.isMod,
  );

  if (State.isViewer || State.isMod) {
    // Zuschauer & Mod: Observer-Screen mit Wort + Eingaben
    enterObserverScreen();
    watchCluesForObserver();
    return;
  }

  if (State.isGuesser || State.isTV) {
    // Rater / TV-Spieler: Warte-Screen ohne Wort
    showScreen(State.isTV ? "tvWait" : "guesserWait");
    return;
  }

  // Normaler Spieler → Hinweis eingeben
  document.getElementById("secret-word-display").textContent = State.secretWord;
  document.getElementById("input-clue").value = "";
  document.getElementById("input-clue").disabled = false;
  document.getElementById("btn-submit-clue").disabled = false;
  document.getElementById("clue-submitted-msg").classList.add("hidden");
  showScreen("clue");
  watchForAllCluesSubmitted();
}

async function submitClue() {
  const text = document.getElementById("input-clue").value.trim();
  if (!text) return;
  log("Hinweis:", text);
  document.getElementById("input-clue").disabled = true;
  document.getElementById("btn-submit-clue").disabled = true;
  document.getElementById("clue-submitted-msg").classList.remove("hidden");
  await State.db.ref(`lobbies/${State.lobbyCode}/clues/${State.uid}`).set(text);
}

function watchForAllCluesSubmitted() {
  // Läuft bei ALLEN Wortgebern (inkl. Host falls er Wortgeber ist).
  // Spielerzahl wird direkt aus Firebase gelesen – nicht aus lokalem State –
  // damit der Vergleich auch nach einem Reload korrekt ist.
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/clues`),
    "value",
    async (snap) => {
      const clues = snap.val() || {};
      const clueCount = Object.keys(clues).length;
      if (clueCount === 0) return; // Initialer Reset beim Spielstart ignorieren

      // Spielerliste frisch aus Firebase lesen (State.players kann veraltet sein)
      const playersSnap = await State.db
        .ref(`lobbies/${State.lobbyCode}/players`)
        .once("value");
      const players = playersSnap.val() || {};
      const guesserUID = State.guesserUID;

      // Wortgeber = alle aktiven Spieler OHNE Zuschauer, OHNE Rater, OHNE Moderator
      // (Mod gibt keinen Hinweis – würde sonst den Zähler aufblähen)
      const modUID = State.modUID;
      const givers = Object.entries(players).filter(
        ([uid, p]) =>
          p.role !== "zuschauer" && uid !== guesserUID && uid !== modUID,
      );

      log(`Clues: ${clueCount}/${givers.length} – isHost: ${State.isHost}`);

      // Nur der Host schreibt die Phase – aber jeder Client prüft
      if (clueCount >= givers.length && givers.length > 0 && State.isHost) {
        // Sicherstellen dass wir noch in der clue-Phase sind (kein Doppel-Trigger)
        const phaseSnap = await State.db
          .ref(`lobbies/${State.lobbyCode}/phase`)
          .once("value");
        if (phaseSnap.val() !== "clue") {
          log("Phase bereits gewechselt – kein Doppel-Trigger");
          return;
        }
        const nextPhase = State.modUID ? "mod-review" : "reveal";
        log("Alle Hinweise eingegangen – wechsle zu:", nextPhase);
        await State.db
          .ref(`lobbies/${State.lobbyCode}`)
          .update({ phase: nextPhase, clues });
      }
    },
  );
}

// ══════════════════════════════════════════════════════════════
//  PHASE: MOD-REVIEW (Moderator prüft Hinweise)
// ══════════════════════════════════════════════════════════════
function enterModReviewPhase() {
  log("Mod-Review – isMod:", State.isMod, "isViewer:", State.isViewer);

  if (State.isMod) {
    renderModReviewList();
    showScreen("modReview");
    return;
  }

  if (State.isViewer) {
    enterObserverScreen();
    watchCluesForObserver();
    return;
  }

  if (State.isGuesser || State.isTV) {
    showScreen(State.isTV ? "tvWait" : "guesserWait");
    return;
  }

  // Wortgeber warten
  showScreen("guesserWait");
  document.querySelector("#screen-guesser-wait .wait-title").textContent =
    "Moderator prüft…";
}

function renderModReviewList() {
  const list = document.getElementById("mod-clue-list");
  list.innerHTML = "";

  Object.entries(State.clues).forEach(([uid, text], i) => {
    const li = document.createElement("li");
    const bullet = document.createElement("div");
    bullet.className = "clue-bullet";
    bullet.textContent = i + 1;

    const textNode = document.createTextNode(text);

    const strikeBtn = document.createElement("button");
    strikeBtn.className = "btn-mod-strike";
    strikeBtn.textContent = "✕ Streichen";
    strikeBtn.dataset.uid = uid;
    strikeBtn.dataset.struck = "false";

    strikeBtn.addEventListener("click", () => {
      const isStruck = strikeBtn.dataset.struck === "true";
      if (isStruck) {
        // Rückgängig
        li.classList.remove("mod-struck");
        strikeBtn.textContent = "✕ Streichen";
        strikeBtn.dataset.struck = "false";
        strikeBtn.classList.remove("undone");
      } else {
        li.classList.add("mod-struck");
        strikeBtn.textContent = "↩ Zurück";
        strikeBtn.dataset.struck = "true";
        strikeBtn.classList.add("undone");
      }
    });

    li.appendChild(bullet);
    li.appendChild(textNode);
    li.appendChild(strikeBtn);
    list.appendChild(li);
  });
}

async function confirmModReview() {
  log("Mod bestätigt Prüfung");

  // Gestrichene UIDs sammeln
  const struckUIDs = {};
  document
    .querySelectorAll('#mod-clue-list .btn-mod-strike[data-struck="true"]')
    .forEach((btn) => {
      struckUIDs[btn.dataset.uid] = true;
    });

  log("Gestrichene Clue-UIDs:", Object.keys(struckUIDs));

  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: "reveal",
    modStrikes: struckUIDs,
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASE: REVEAL (Animiertes Durchstreichen – OHNE Rater)
// ══════════════════════════════════════════════════════════════
async function enterRevealPhase() {
  log("Reveal – isGuesser:", State.isGuesser, "isTV:", State.isTV);

  // Rater / TV-Spieler sehen diesen Screen NICHT
  if (State.isGuesser || State.isTV) {
    showScreen(State.isTV ? "tvWait" : "guesserWait");
    document.querySelector("#screen-guesser-wait .wait-title").textContent =
      "Gleich geht's los…";
    // Auf Guess-Phase warten
    watchForPhase("guess");
    return;
  }

  if (State.isViewer || State.isMod) {
    enterObserverScreen();
    watchCluesForObserver();
    // Warten bis guess Phase
    watchForPhase("guess");
    return;
  }

  // Wortgeber & Host: Animation anzeigen
  const snap = await State.db.ref(`lobbies/${State.lobbyCode}`).once("value");
  const data = snap.val();
  State.clues = data.clues || {};
  State.modStrikes = data.modStrikes || {};

  const allEntries = Object.entries(State.clues);
  const duplicates = findDuplicates(allEntries.map(([, t]) => t));

  // Hinweise die das Geheimwort enthalten (oder darin enthalten sind) → auch streichen
  const secretHits = new Set(
    allEntries
      .filter(([, t]) => isContainedInSecretWord(t, State.secretWord))
      .map(([, t]) => normalizeClue(t)),
  );

  // Alle automatisch zu streichenden Texte zusammenfassen
  const autoStrike = new Set([...duplicates, ...secretHits]);

  log(
    "Duplikate:",
    [...duplicates],
    "| Geheimwort-Treffer:",
    [...secretHits],
    "| Mod-Strikes:",
    Object.keys(State.modStrikes),
  );

  const list = document.getElementById("clue-list");
  list.innerHTML = "";
  allEntries.forEach(([uid, text], i) => {
    const li = document.createElement("li");
    const bullet = document.createElement("div");
    bullet.className = "clue-bullet";
    bullet.textContent = i + 1;
    li.appendChild(bullet);
    li.appendChild(document.createTextNode(text));
    li.dataset.text = normalizeClue(text);
    li.dataset.uid = uid;
    list.appendChild(li);
  });

  showScreen("reveal");

  // Zuerst Mod-Strikes sofort grau markieren
  Object.keys(State.modStrikes).forEach((uid) => {
    const el = list.querySelector(`li[data-uid="${uid}"]`);
    if (el) el.classList.add("mod-struck");
  });

  // Dann Duplikate + Geheimwort-Treffer animiert streichen (nach 800ms)
  setTimeout(() => animateStrikethrough(autoStrike), 800);

  // Countdown-Ring nach der Animation starten
  const animDuration = 800 + autoStrike.size * 500 + 400;
  setTimeout(() => startRevealCountdown(5), animDuration);
}

// Normalisiert einen Text für den Vergleich:
// Kleinschreibung, Trimmen, Umlaute belassen (ä/ö/ü bleiben erhalten,
// da "Schatten" vs "SCHATTEN" bereits durch toLowerCase abgedeckt ist)
function normalizeClue(text) {
  return text.toLowerCase().trim();
}

// Gibt ein Set aller normalisierten Texte zurück die mehr als einmal vorkommen
function findDuplicates(texts) {
  const seen = new Set();
  const dupes = new Set();
  texts.forEach((t) => {
    const n = normalizeClue(t);
    seen.has(n) ? dupes.add(n) : seen.add(n);
  });
  return dupes;
}

// Prüft ob ein Hinweis-Wort im Geheimwort enthalten ist (oder umgekehrt).
// Beispiel: Gesucht "Käsekuchen" → "Käse" und "Kuchen" werden gestrichen.
// Außerdem: Gesucht "Kuchen" → "Käsekuchen" als Hinweis würde ebenfalls gestrichen.
function isContainedInSecretWord(clueText, secretWord) {
  if (!secretWord) return false;
  const clue = normalizeClue(clueText);
  const secret = normalizeClue(secretWord);
  // Hinweis ist Teilstring des Geheimworts ODER Geheimwort ist Teilstring des Hinweises
  return secret.includes(clue) || clue.includes(secret);
}

function animateStrikethrough(dupes) {
  if (!dupes.size) return;
  let delay = 0;
  document.querySelectorAll("#clue-list li").forEach((li) => {
    if (dupes.has(li.dataset.text)) {
      setTimeout(() => li.classList.add("strike"), delay);
      delay += 500;
    }
  });
}

// Countdown-Ring – automatische Weiterleitung nach N Sekunden
function startRevealCountdown(seconds) {
  const area = document.getElementById("reveal-countdown");
  const circle = document.getElementById("countdown-circle");
  const numEl = document.getElementById("countdown-num");
  const circum = 226; // 2 * PI * 36

  area.classList.remove("hidden");
  numEl.textContent = seconds;
  circle.style.strokeDashoffset = 0;

  let remaining = seconds;
  const tick = setInterval(async () => {
    remaining--;
    numEl.textContent = remaining;
    circle.style.strokeDashoffset = circum - (remaining / seconds) * circum;

    if (remaining <= 0) {
      clearInterval(tick);
      log("Countdown abgelaufen – wechsle zu Guess");
      await proceedToGuess();
    }
  }, 1000);
}

async function proceedToGuess() {
  log("Zu Guess-Phase");

  const snap = await State.db.ref(`lobbies/${State.lobbyCode}`).once("value");
  const data = snap.val();
  const clues = data.clues || {};
  const strikes = data.modStrikes || {};
  const dupes = findDuplicates(Object.values(clues));

  // Valide Hinweise: nicht doppelt, kein Geheimwort-Treffer, nicht vom Mod gestrichen
  const validClues = {};
  Object.entries(clues).forEach(([uid, text]) => {
    const isDupe = dupes.has(normalizeClue(text));
    const isSecretHit = isContainedInSecretWord(text, data.secretWord);
    const isStruck = !!strikes[uid];
    if (!isDupe && !isSecretHit && !isStruck) validClues[uid] = text;
  });

  log("Valide Hinweise:", validClues);

  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: "guess",
    clues: validClues,
  });
}

// ══════════════════════════════════════════════════════════════
//  ZUSCHAUER / MOD OBSERVER-SCREEN
// ══════════════════════════════════════════════════════════════
function enterObserverScreen() {
  log("Observer-Screen – Wort:", State.secretWord);

  const badge = document.getElementById("observer-role-badge");
  if (State.isMod) {
    badge.className = "role-badge mod";
    badge.textContent = "Moderator";
  } else {
    badge.className = "role-badge viewer";
    badge.textContent = "Zuschauer";
  }

  document.getElementById("observer-secret-word").textContent =
    State.secretWord || "—";
  document.getElementById("observer-clue-list").innerHTML = "";
  document.getElementById("observer-guess-area").classList.add("hidden");
  showScreen("observer");
}

function watchCluesForObserver() {
  addListener(
    State.db.ref(`lobbies/${State.lobbyCode}/clues`),
    "value",
    (snap) => {
      const clues = snap.val() || {};
      const list = document.getElementById("observer-clue-list");
      if (!list) return;
      list.innerHTML = "";
      Object.entries(clues).forEach(([uid, text], i) => {
        const li = document.createElement("li");
        const bullet = document.createElement("div");
        bullet.className = "clue-bullet";
        bullet.textContent = i + 1;
        li.appendChild(bullet);
        li.appendChild(
          document.createTextNode(
            `${State.players[uid]?.name || "?"}: ${text}`,
          ),
        );
        list.appendChild(li);
      });
    },
  );
}

function watchForPhase(_targetPhase) {
  // Leer – der zentrale Listener (startCentralListener) reagiert bereits
  // auf alle Phasenwechsel. Diese Funktion bleibt als No-Op erhalten
  // damit bestehende Aufrufe keinen Fehler werfen.
  log("watchForPhase: zentraler Listener übernimmt –", _targetPhase);
}

// ══════════════════════════════════════════════════════════════
//  PHASE: GUESS
// ══════════════════════════════════════════════════════════════
async function enterGuessPhase() {
  log("Guess – isGuesser:", State.isGuesser, "isTV:", State.isTV);

  const snap = await State.db
    .ref(`lobbies/${State.lobbyCode}/clues`)
    .once("value");
  State.clues = snap.val() || {};
  const validClues = Object.values(State.clues);

  if (State.isViewer || State.isMod) {
    // Observer weiter aktualisieren + auf Antwort warten
    watchForPhase("result");
    addListener(
      State.db.ref(`lobbies/${State.lobbyCode}/guess`),
      "value",
      (snap) => {
        if (snap.val()) {
          document
            .getElementById("observer-guess-area")
            .classList.remove("hidden");
          document.getElementById("observer-guess-word").textContent =
            snap.val();
        }
      },
    );
    return;
  }

  if (State.isGuesser || State.isTV) {
    // Hinweise anzeigen
    const list = document.getElementById("guesser-clue-list");
    list.innerHTML = "";
    validClues.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
    document.getElementById("input-guess").value = "";
    // Rater-Karte zentrieren
    document
      .querySelector("#screen-guess .clue-card")
      .classList.add("guesser-mode");
    showScreen("guess");
    return;
  }

  // Wortgeber warten
  document.querySelector("#screen-guesser-wait .wait-title").textContent =
    "Der Rater denkt nach…";
  showScreen("guesserWait");
  watchForPhase("result");
}

async function submitGuess() {
  const text = document.getElementById("input-guess").value.trim();
  if (!text) return;
  log("Antwort:", text);

  // Bei TV-Modus: kein automatisches Richtig/Falsch – Mod/Host entscheidet
  if (State.isTV) {
    await State.db.ref(`lobbies/${State.lobbyCode}`).update({
      phase: "result",
      guess: text,
      verdict: null, // Wartet auf Moderator-Verdikt
    });
  } else {
    await State.db.ref(`lobbies/${State.lobbyCode}`).update({
      phase: "result",
      guess: text,
    });
  }
}

// ══════════════════════════════════════════════════════════════
//  PHASE: RESULT
// ══════════════════════════════════════════════════════════════
async function enterResultPhase(guess, verdict) {
  log(
    "Result – Antwort:",
    guess,
    "| Verdikt:",
    verdict,
    "| Wort:",
    State.secretWord,
  );

  const isTVMode = !!State.tvUID;
  let correct;

  if (isTVMode && verdict !== null && verdict !== undefined) {
    // TV-Modus: Verdikt vom Mod/Host
    correct = verdict === true || verdict === "true";
  } else if (isTVMode && (verdict === null || verdict === undefined)) {
    // TV-Modus: noch kein Verdikt → Verdikt-Buttons anzeigen
    showVerdictScreen(guess);
    return;
  } else {
    // Normal: automatisch prüfen
    correct =
      guess?.toLowerCase().trim() === State.secretWord?.toLowerCase().trim();
  }

  renderResultScreen(guess, correct);
}

function showVerdictScreen(guess) {
  // Warte-Screen für Spieler, Verdikt-Screen für Mod/Host
  document.getElementById("result-icon").textContent = "🤔";
  document.getElementById("result-title").textContent =
    "Was hat der Rater gesagt?";
  document.getElementById("result-title").className = "result-title";
  document.getElementById("result-guess").innerHTML =
    `Antwort: <strong>${guess || "—"}</strong>`;
  document.getElementById("result-word").innerHTML =
    `Gesuchtes Wort: <strong>${State.secretWord}</strong>`;

  const verdictBtns = document.getElementById("mod-verdict-btns");
  const hostNext = document.getElementById("host-next-controls");
  const waitingNext = document.getElementById("waiting-next-msg");

  // Nur Mod oder (Host wenn kein Mod) sehen Verdikt-Buttons
  const canVerdict = State.isMod || (State.isHost && !State.modUID);
  if (canVerdict) {
    verdictBtns.classList.remove("hidden");
    hostNext.classList.add("hidden");
    waitingNext.classList.add("hidden");
  } else {
    verdictBtns.classList.add("hidden");
    hostNext.classList.add("hidden");
    waitingNext.classList.remove("hidden");
    // Auf Verdikt warten
    addListener(
      State.db.ref(`lobbies/${State.lobbyCode}/verdict`),
      "value",
      (snap) => {
        if (snap.val() !== null && snap.val() !== undefined) {
          renderResultScreen(
            guess,
            snap.val() === true || snap.val() === "true",
          );
        }
      },
    );
  }

  showScreen("result");
}

async function setVerdict(correct) {
  log("Verdikt gesetzt:", correct);
  await State.db.ref(`lobbies/${State.lobbyCode}`).update({ verdict: correct });
  renderResultScreen(
    document
      .getElementById("result-guess")
      .textContent.replace("Antwort: ", ""),
    correct,
  );
}

function renderResultScreen(guess, correct) {
  log("Ergebnis rendern:", correct ? "RICHTIG" : "FALSCH");

  document.getElementById("result-icon").textContent = correct ? "🎉" : "😬";
  document.getElementById("result-title").textContent = correct
    ? "Richtig!"
    : "Leider falsch…";
  document.getElementById("result-title").className =
    "result-title " + (correct ? "correct" : "wrong");

  const guesserName = State.players[State.guesserUID]?.name || "Der Rater";
  document.getElementById("result-guess").innerHTML =
    `<strong>${guesserName}</strong> hat „<strong>${guess || "—"}</strong>" geraten.`;
  document.getElementById("result-word").innerHTML =
    `Das gesuchte Wort war: <strong>${State.secretWord}</strong>`;

  document.getElementById("mod-verdict-btns").classList.add("hidden");

  if (State.isHost) {
    document.getElementById("host-next-controls").classList.remove("hidden");
    document.getElementById("waiting-next-msg").classList.add("hidden");
  } else {
    document.getElementById("host-next-controls").classList.add("hidden");
    document.getElementById("waiting-next-msg").classList.remove("hidden");
  }

  showScreen("result");
}

// ══════════════════════════════════════════════════════════════
//  GLOBALER PHASEN-LISTENER
//  Läuft während des Spiels bei ALLEN Clients.
//  Reagiert auf Phasenwechsel (inkl. Host-Abbruch zurück zu 'lobby').
// ══════════════════════════════════════════════════════════════
//  ZENTRALER LOBBY-LISTENER
//  EIN einziger Root-Listener pro Lobby-Session für ALLE Clients.
//  Reagiert auf: Spielstart, Phasenwechsel, Abbruch, Lobby-Löschung.
//  Wird in enterLobbyScreen() gestartet und läuft durch alle Phasen.
// ══════════════════════════════════════════════════════════════
function startCentralListener() {
  // Guard: nur einmal pro Lobby registrieren.
  // Überlebt removeAllListeners() – wird nur durch removeCentralListener() gestoppt.
  if (State._centralFn) {
    log("Zentraler Listener läuft bereits – kein Doppel-Start");
    return;
  }

  log("Zentraler Listener gestartet für Lobby:", State.lobbyCode);
  const ref = State.db.ref(`lobbies/${State.lobbyCode}`);

  const fn = (snap) => {
    // ── Lobby gelöscht (closeLobby / endGame vom Host) ──
    if (!snap.exists()) {
      log("Lobby nicht mehr vorhanden – alle zurück zum Start");
      removeCentralListener();
      removeAllListeners();
      localStorage.removeItem("onechance_lobby");
      localStorage.removeItem("onechance_player_lobby");
      State.lobbyCode = null;
      State.isHost = false;
      showHostAbortButton(false);
      showScreen("start");
      showToast("🚪 Die Lobby wurde vom Host geschlossen.");
      return;
    }

    const data = snap.val();
    const phase = data?.phase;
    if (!phase) return;

    // ── Rater hat die Lobby verlassen während laufendem Spiel ──
    const activePhases = ["clue", "mod-review", "reveal", "guess"];
    if (
      activePhases.includes(phase) &&
      data.guesserUID &&
      State.isHost &&
      !(data.players && data.players[data.guesserUID])
    ) {
      log("Rater nicht mehr in der Lobby – alle zurück zur Lobby");
      (async () => {
        await State.db.ref(`lobbies/${State.lobbyCode}`).update({
          phase: "lobby",
          secretWord: null,
          guesserUID: null,
          clues: {},
          modStrikes: {},
          guess: null,
          verdict: null,
        });
        showToast("🚶 Der Rater hat die Lobby verlassen – zurück zur Lobby.");
      })();
      return;
    }

    // ── Phase zurück zu lobby (forceBackToLobby / nextRound) ──
    if (phase === "lobby" && State.phase && State.phase !== "lobby") {
      log("Phase → lobby: alle Clients zurück in Lobby-Screen");
      State.phase = "lobby";
      removeAllListeners(); // normale Listener leeren (zentraler bleibt!)
      showHostAbortButton(false);
      enterLobbyScreen(); // registriert neue normale Listener
      return;
    }

    // ── Normaler Phasenwechsel (clue / reveal / guess / result / ...) ──
    if (phase !== "lobby" && phase !== State.phase) {
      handlePhaseChange(phase);
    }
  };

  // Direkt bei Firebase registrieren – NICHT über addListener(),
  // damit removeAllListeners() ihn nicht entfernt.
  ref.on("value", fn);
  State._centralRef = ref;
  State._centralFn = fn;
}

// ══════════════════════════════════════════════════════════════
//  HOST: ZURÜCK ZUR LOBBY (jederzeit aus laufendem Spiel)
// ══════════════════════════════════════════════════════════════
async function forceBackToLobby() {
  if (!State.isHost) return;
  if (!confirm("Runde abbrechen und zurück zur Lobby?")) return;

  log("Host bricht Runde ab – zurück zur Lobby");
  // Phasenwechsel auf lobby – der zentrale Listener aller Clients reagiert darauf
  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: "lobby",
    secretWord: null,
    guesserUID: null,
    clues: {},
    modStrikes: {},
    guess: null,
    verdict: null,
  });

  // Host selbst zurück in die Lobby
  removeAllListeners();
  showHostAbortButton(false);
  enterLobbyScreen();
}

// ── Host-Abbruch-Overlay: wird auf allen Spielscreens angezeigt ──
function injectHostAbortButton() {
  // Nur einmal injizieren
  if (document.getElementById("host-abort-btn")) return;

  const btn = document.createElement("button");
  btn.id = "host-abort-btn";
  btn.textContent = "↩ Zur Lobby";
  btn.title = "Runde abbrechen und zur Lobby";
  btn.addEventListener("click", forceBackToLobby);
  document.body.appendChild(btn);
  log("Host-Abbruch-Button eingefügt");
}

function showHostAbortButton(visible) {
  const btn = document.getElementById("host-abort-btn");
  if (!btn) return;
  btn.style.display = visible ? "block" : "none";
}

// ══════════════════════════════════════════════════════════════
//  NÄCHSTE RUNDE / BEENDEN
// ══════════════════════════════════════════════════════════════
async function nextRound() {
  log("Nächste Runde");
  removeAllListeners();
  showHostAbortButton(false);
  await State.db.ref(`lobbies/${State.lobbyCode}`).update({
    phase: "lobby",
    secretWord: null,
    guesserUID: null,
    clues: {},
    modStrikes: {},
    guess: null,
    verdict: null,
  });
  setTimeout(() => enterLobbyScreen(), 300);
}

async function endGame() {
  log("Spiel beenden");
  removeCentralListener(); // Host verlässt – zentralen Listener stoppen
  removeAllListeners();
  showHostAbortButton(false);
  await State.db.ref(`lobbies/${State.lobbyCode}`).remove();
  localStorage.removeItem("onechance_lobby");
  localStorage.removeItem("onechance_player_lobby");
  State.lobbyCode = null;
  State.isHost = false;
  showScreen("start");
}

async function closeLobby() {
  // Host schließt die Lobby komplett – alle Clients landen auf dem Start-Screen.
  // Das Löschen des Firebase-Nodes triggert den zentralen Listener bei allen Clients.
  if (!State.isHost) return;
  if (
    !confirm(
      "Lobby wirklich schließen? Alle Spieler werden zurück zum Start gesetzt.",
    )
  )
    return;

  log("Host schließt Lobby:", State.lobbyCode);
  removeCentralListener(); // zentralen Listener zuerst stoppen (Host braucht ihn nicht mehr)
  removeAllListeners();
  await State.db.ref(`lobbies/${State.lobbyCode}`).remove();
  localStorage.removeItem("onechance_lobby");
  localStorage.removeItem("onechance_player_lobby");
  State.lobbyCode = null;
  State.isHost = false;
  showScreen("start");
}

// ══════════════════════════════════════════════════════════════
//  SPIELER / ZUSCHAUER: SPIEL VERLASSEN
// ══════════════════════════════════════════════════════════════
async function leaveGame() {
  // Nur für Nicht-Hosts – Host benutzt "Lobby schließen"
  if (State.isHost) return;
  // In der Lobby: direkt raus ohne Bestätigung
  // Im laufenden Spiel: kurze Bestätigung (Rater-Abgang hat Konsequenzen für alle)
  if (State.phase && State.phase !== "lobby") {
    if (!confirm("Spiel wirklich verlassen?")) return;
  }

  log("Spieler verlässt:", State.uid, "| Phase:", State.phase);

  const lobbyCode = State.lobbyCode;
  const uid = State.uid;
  const phase = State.phase;
  const wasGuesser = State.isGuesser;

  // Eigene Listeners stoppen
  removeCentralListener();
  removeAllListeners();
  showLeaveButton(false);

  // Aus Spielerliste entfernen
  await State.db.ref(`lobbies/${lobbyCode}/players/${uid}`).remove();

  // Falls noch in der Clue-Phase: eigenen Hinweis löschen (wird nicht mehr gewartet)
  if (phase === "clue") {
    await State.db.ref(`lobbies/${lobbyCode}/clues/${uid}`).remove();
    log("Eigener Clue gelöscht – Zähler neu prüfen");
  }

  // Falls der Rater geht: alle zurück zur Lobby
  if (wasGuesser) {
    log("Rater verlässt – alle zurück zur Lobby");
    await State.db.ref(`lobbies/${lobbyCode}`).update({
      phase: "lobby",
      secretWord: null,
      guesserUID: null,
      clues: {},
      modStrikes: {},
      guess: null,
      verdict: null,
    });
  }

  // Eigenen State bereinigen
  localStorage.removeItem("onechance_player_lobby");
  State.lobbyCode = null;
  State.isHost = false;
  State.isGuesser = false;
  showScreen("start");
}

// ── Leave-Button: floating für Nicht-Hosts auf allen Spielscreens ──
function injectLeaveButton() {
  if (document.getElementById("leave-game-btn")) return;
  const btn = document.createElement("button");
  btn.id = "leave-game-btn";
  btn.textContent = "↩ Verlassen";
  btn.title = "Spiel verlassen";
  btn.addEventListener("click", leaveGame);
  document.body.appendChild(btn);
  log("Leave-Button eingefügt");
}

function showLeaveButton(visible) {
  const btn = document.getElementById("leave-game-btn");
  if (!btn) return;
  btn.style.display = visible ? "block" : "none";
}

// ══════════════════════════════════════════════════════════════
//  EVENT LISTENER
// ══════════════════════════════════════════════════════════════

// ── Rollen-Auswahl Buttons ──
let selectedRole = "spieler";
document.querySelectorAll(".role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedRole = btn.dataset.role;
    document
      .querySelectorAll(".role-btn")
      .forEach((b) => (b.className = "role-btn"));
    btn.classList.add(
      selectedRole === "spieler" ? "active-spieler" : "active-zuschauer",
    );
    State.role = selectedRole;
    log("Rolle gewählt:", selectedRole);
  });
});

// ── Kategorien-Chips Start-Screen ──
let selectedCat = "leicht";
document.querySelectorAll("#screen-start .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    selectedCat = chip.dataset.cat;
    document
      .querySelectorAll("#screen-start .chip")
      .forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    State.category = selectedCat;
    log("Kategorie gewählt:", selectedCat);
  });
});

// ── Lobby-Kategorie Chips ──
document.querySelectorAll("#lobby-category-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (!State.isHost) return;
    document
      .querySelectorAll("#lobby-category-chips .chip")
      .forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    updateCategory(chip.dataset.cat);
  });
});

// ── Slider Start-Screen ──
const sliderStart = document.getElementById("slider-max-players");
const sliderDisplay = document.getElementById("slider-val-display");
if (sliderStart) {
  sliderStart.addEventListener("input", () => {
    sliderDisplay.textContent = sliderStart.value;
    State.maxPlayers = parseInt(sliderStart.value, 10);
    updateSliderFill(sliderStart);
  });
  updateSliderFill(sliderStart);
}

// ── URL-Parameter: Neue Lobby-Optionen ausblenden wenn Code vorhanden ──
document.getElementById("input-lobby").addEventListener("input", () => {
  const hasCode =
    document.getElementById("input-lobby").value.trim().length > 0;
  document.getElementById("new-lobby-options").style.opacity = hasCode
    ? "0.4"
    : "1";
});

// ── Slider Lobby ──
const sliderLobby = document.getElementById("lobby-slider-max");
const sliderLobbyVal = document.getElementById("lobby-slider-val");
if (sliderLobby) {
  sliderLobby.addEventListener("input", () => {
    sliderLobbyVal.textContent = sliderLobby.value;
    updateSliderFill(sliderLobby);
  });
  sliderLobby.addEventListener("change", () => {
    if (State.isHost) updateMaxPlayers(sliderLobby.value);
  });
  updateSliderFill(sliderLobby);
}

// ── Join-Button ──
document.getElementById("btn-join").addEventListener("click", async () => {
  const name = document.getElementById("input-name").value.trim();
  const code = document
    .getElementById("input-lobby")
    .value.trim()
    .toUpperCase();
  const errEl = document.getElementById("start-error");
  errEl.textContent = "";

  if (!name) {
    errEl.textContent = "Bitte gib deinen Namen ein.";
    return;
  }
  if (!State.db) {
    errEl.textContent = "Firebase nicht verbunden.";
    return;
  }

  log(
    "Join – Name:",
    name,
    "| Code:",
    code || "(neu)",
    "| Rolle:",
    selectedRole,
  );

  try {
    State.uid = getOrCreateUID();
    State.name = name;
    State.role = selectedRole;
    await joinOrCreateLobby(name, code, selectedRole);
    enterLobbyScreen();
  } catch (e) {
    log("Fehler:", e.message);
    errEl.textContent = e.message;
  }
});

// Enter-Tasten
["input-name", "input-lobby"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-join").click();
  });
});

// Lobby-Code kopieren
document.getElementById("btn-copy-code").addEventListener("click", () => {
  const code = document.getElementById("lobby-code-display").textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast("📋 Code kopiert!");
    document.getElementById("btn-copy-code").textContent = "✓";
    setTimeout(
      () => (document.getElementById("btn-copy-code").textContent = "⧉"),
      1500,
    );
  });
});

// Einlade-Buttons
document
  .getElementById("btn-invite-link")
  .addEventListener("click", copyInviteLink);
document
  .getElementById("btn-invite-wa")
  .addEventListener("click", shareWhatsApp);

// Spiel starten
document.getElementById("btn-start").addEventListener("click", startGame);

// Lobby verlassen (Spieler / Zuschauer)
document.getElementById("btn-leave-lobby").addEventListener("click", leaveGame);

// Lobby schließen (Host)
document
  .getElementById("btn-close-lobby")
  .addEventListener("click", closeLobby);

// Hinweis
document
  .getElementById("btn-submit-clue")
  .addEventListener("click", submitClue);
document.getElementById("input-clue").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitClue();
});

// Mod-Review bestätigen
document
  .getElementById("btn-mod-confirm")
  .addEventListener("click", confirmModReview);

// Raten
document
  .getElementById("btn-submit-guess")
  .addEventListener("click", submitGuess);
document.getElementById("input-guess").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitGuess();
});

// Verdikt (TV-Modus)
document
  .getElementById("btn-verdict-correct")
  .addEventListener("click", () => setVerdict(true));
document
  .getElementById("btn-verdict-wrong")
  .addEventListener("click", () => setVerdict(false));

// Nächste Runde / Beenden
document.getElementById("btn-next-round").addEventListener("click", nextRound);
document.getElementById("btn-end-game").addEventListener("click", endGame);

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
(async function init() {
  log("Init");

  const ok = initFirebase();
  if (!ok) {
    showScreen("start");
    document.getElementById("start-error").textContent =
      "Firebase-Fehler. Bitte neu laden.";
    return;
  }

  State.uid = getOrCreateUID();

  // Letzten Namen vorausfüllen
  const savedName = loadSavedName();
  if (savedName) document.getElementById("input-name").value = savedName;

  // URL-Parameter ?lobby=CODE
  const params = new URLSearchParams(window.location.search);
  const lobbyParam = params.get("lobby");
  if (lobbyParam) {
    document.getElementById("input-lobby").value = lobbyParam.toUpperCase();
    document.getElementById("new-lobby-options").style.opacity = "0.4";
    showToast(`🎮 Lobby ${lobbyParam} – Namen eingeben und beitreten!`);
  }

  // Host-Reconnect oder Spieler-Reconnect (nur ohne URL-Parameter)
  if (!lobbyParam) {
    const hostReconnected = await checkHostReconnect(State.uid);
    if (hostReconnected) return;

    const playerReconnected = await checkPlayerReconnect(State.uid);
    if (playerReconnected) return;
  }

  showScreen("start");
})();
