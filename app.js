import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// =====================================================================
// TODO: Hier die eigenen Firebase-Projektdaten eintragen
// (Firebase-Konsole → Projekteinstellungen → "Web-App hinzufügen")
// =====================================================================
const firebaseConfig = {
  apiKey: "AIzaSyA8lCqdKK8ls_JnRgi6iRYPJwxl6Y1XwMY",
  authDomain: "arbeitspakete-sq.firebaseapp.com",
  projectId: "arbeitspakete-sq",
  storageBucket: "arbeitspakete-sq.firebasestorage.app",
  messagingSenderId: "1020946455130",
  appId: "1:1020946455130:web:9921cadfbf37e702be5663"
};

// Team-PIN
const TEAM_PIN = "2345";
const PIN_STORAGE_KEY = "sq-pilotklasse-pin-ok";
const COLLECTION = "arbeitspakete";
// =====================================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const statuses = {
  aufkurs: { label: "Auf Kurs", color: "#10b64a" },
  klaerung: { label: "Klärungsbedarf", color: "#f2bb17" },
  handlung: { label: "Handlungsbedarf", color: "#e21d25" }
};

const defaultTitles = ["Projektplanung","Bedarfsanalyse","Konzeptentwicklung","Ressourcenplanung","Raum & Ausstattung","Zeit- & Stundenplan","Team & Rollen","Qualifizierung","Kommunikation","Pilotdurchführung","Evaluation","Verstetigung"];

const palette = ["#D97B3F","#C0562E","#2FA6A6","#2E8FBF","#3D6FD9","#4F5FCB","#7A5CC9","#9A4FC0","#C247A0","#C34C74","#8A5A3C","#5C6B7A"];

function emptyPackage(order, title) {
  return { order, title: title || "Neues Arbeitspaket", responsible: "", goal: "", task: "", deadline: "", status: "aufkurs", next: "" };
}

// ---------- Zustand ----------
let data = [];               // aktuell angezeigte Arbeitspakete (aus Firestore + lokal-neue, ungespeicherte)
let editing = new Set();     // ids (Firestore-Doc-ID oder "tmp-...") die gerade bearbeitet werden
let tempCards = new Map();   // lokal neue, noch nicht in Firestore gespeicherte Karten: id -> Objekt
let seeded = false;          // verhindert doppeltes Anlegen der Default-Pakete
let drafts = new Map();      // ungespeicherte Eingaben in Karten im Bearbeitungsmodus: id -> Felder
let dragId = null;           // Karte, die gerade per Drag & Drop verschoben wird

// ---------- PIN-Gate ----------
function unlockGate() {
  pinGate.classList.add("hidden");
  signInAnonymously(auth).catch(err => {
    saveState.textContent = "Verbindungsfehler";
    console.error(err);
  });
}

if (localStorage.getItem(PIN_STORAGE_KEY) === "1") {
  unlockGate();
} else {
  pinGate.classList.remove("hidden");
}

pinForm.onsubmit = (e) => {
  e.preventDefault();
  if (pinInput.value === TEAM_PIN) {
    localStorage.setItem(PIN_STORAGE_KEY, "1");
    pinError.classList.add("hidden");
    unlockGate();
  } else {
    pinError.classList.remove("hidden");
    pinInput.value = "";
    pinInput.focus();
  }
};

// ---------- Firebase Auth + Live-Sync ----------
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const col = collection(db, COLLECTION);
  onSnapshot(col, (snapshot) => {
    if (snapshot.empty && !seeded) {
      seeded = true;
      seedDefaults(col);
      return; // die Seed-Schreibvorgänge lösen selbst wieder onSnapshot aus
    }
    const fromDb = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    data = [...fromDb, ...tempCards.values()];
    saveState.textContent = "Bereit";
    render();
  }, (err) => {
    saveState.textContent = "Verbindungsfehler";
    console.error(err);
  });
}, (err) => {
  console.error(err);
});

async function seedDefaults(col) {
  const batch = writeBatch(db);
  defaultTitles.forEach((t, i) => {
    const ref = doc(col);
    batch.set(ref, emptyPackage(i + 1, t));
  });
  await batch.commit();
}

// ---------- Helfer ----------
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function fmtDate(v) {
  if (!v) return "–";
  const [y, m, d] = v.split("-");
  return (y && m && d) ? `${d}.${m}.${y}` : v;
}

function statusOptions(current) {
  return Object.entries(statuses).map(([key, s]) =>
    `<option value="${key}" ${key === current ? "selected" : ""}>${s.label}</option>`
  ).join("");
}

function nextOrder() {
  return data.reduce((m, p) => Math.max(m, p.order || 0), 0) + 1;
}

// Farbe und Nummer richten sich nach der Position in der Liste (nicht nach dem
// gespeicherten order-Wert) – so bleibt die Nummerierung 01, 02, 03 … immer lückenlos.
function accentFor(idx) {
  return palette[(idx + palette.length) % palette.length];
}

function numLabel(idx) {
  return String(idx + 1).padStart(2, "0");
}

function persistedList() {
  return data.filter(p => !tempCards.has(p.id));
}

function captureDrafts() {
  document.querySelectorAll(".card.editing").forEach(card => {
    const id = card.dataset.id;
    if (!editing.has(id)) return;
    const d = {};
    card.querySelectorAll("[data-field]").forEach(e => d[e.dataset.field] = e.value);
    drafts.set(id, d);
  });
}

function dropDraft(id) {
  drafts.delete(id);
}

// ---------- Rendering ----------
function cardEdit(p, accent, idx) {
  return `
    <div class="card-head"><div class="card-number">${numLabel(idx)}</div>
      <input class="card-title" data-field="title" value="${esc(p.title)}" placeholder="Titel des Arbeitspakets"></div>
    <div class="card-body">
      <div class="field"><label>Verantwortliche</label><input data-field="responsible" value="${esc(p.responsible)}" placeholder="Name(n)"></div>
      <div class="field"><label>Ziel</label><textarea data-field="goal" placeholder="Ziel eingeben...">${esc(p.goal)}</textarea></div>
      <div class="field"><label>Aufgabe</label><textarea data-field="task" placeholder="Aufgabe eingeben...">${esc(p.task)}</textarea></div>
      <div class="field"><label>Deadline</label><input type="date" data-field="deadline" value="${esc(p.deadline)}"></div>
      <div class="field"><label>Status</label><div class="status-wrap"><i class="status-dot" style="background:${statuses[p.status].color}"></i>
        <select class="status-select" data-field="status">${statusOptions(p.status)}</select></div></div>
      <div class="field"><label>Nächste Schritte</label><textarea data-field="next" placeholder="Nächste Schritte...">${esc(p.next)}</textarea></div>
      <div class="card-footer">
        <button class="mini-btn danger" data-delete="${p.id}">Löschen</button>
        <span class="spacer"></span>
        <button class="mini-btn ghost" data-cancel="${p.id}">Abbrechen</button>
        <button class="mini-btn save" data-save="${p.id}" style="background:${accent}">Speichern</button>
      </div>
    </div>`;
}

function moveControls(p, idx, lastIdx) {
  if (tempCards.has(p.id)) return "";
  return `<div class="move-btns">
    <button type="button" class="move-btn" data-move="${p.id}" data-dir="-1" title="Nach vorne verschieben" aria-label="Nach vorne verschieben" ${idx === 0 ? "disabled" : ""}>‹</button>
    <button type="button" class="move-btn" data-move="${p.id}" data-dir="1" title="Nach hinten verschieben" aria-label="Nach hinten verschieben" ${idx >= lastIdx ? "disabled" : ""}>›</button>
  </div>`;
}

function cardView(p, accent, idx, lastIdx) {
  const s = statuses[p.status];
  return `
    <div class="card-head"><div class="card-top"><div class="card-number">${numLabel(idx)}</div>${moveControls(p, idx, lastIdx)}</div>
      <h3 class="card-title-view">${esc(p.title) || "Ohne Titel"}</h3></div>
    <div class="card-body">
      <div class="field view"><label>Verantwortliche</label><div class="value">${esc(p.responsible) || "–"}</div></div>
      <div class="field view"><label>Ziel</label><div class="value">${esc(p.goal) || "–"}</div></div>
      <div class="field view"><label>Aufgabe</label><div class="value">${esc(p.task) || "–"}</div></div>
      <div class="field view"><label>Deadline</label><div class="value">${fmtDate(p.deadline)}</div></div>
      <div class="field view"><label>Status</label><div class="status-badge"><i class="status-dot" style="background:${s.color}"></i>${s.label}</div></div>
      <div class="field view"><label>Nächste Schritte</label><div class="value">${esc(p.next) || "–"}</div></div>
      <div class="card-footer">
        <button class="mini-btn danger" data-delete="${p.id}">Löschen</button>
        <span class="spacer"></span>
        <button class="mini-btn edit" data-edit="${p.id}" style="background:${accent}">Bearbeiten</button>
      </div>
    </div>`;
}

function render() {
  captureDrafts(); // ungespeicherte Eingaben anderer geöffneter Karten nicht verlieren
  updateCount();
  const lastIdx = persistedList().length - 1;
  const cards = data.map((p, idx) => {
    const accent = accentFor(idx);
    const isEditing = editing.has(p.id);
    const shown = isEditing && drafts.has(p.id) ? { ...p, ...drafts.get(p.id) } : p;
    const inner = isEditing ? cardEdit(shown, accent, idx) : cardView(p, accent, idx, lastIdx);
    const draggable = !isEditing && !tempCards.has(p.id) ? ' draggable="true"' : "";
    return `<article class="card${isEditing ? " editing" : ""}" data-id="${p.id}"${draggable} style="--accent:${accent}">${inner}</article>`;
  }).join("");
  const addTile = `<button id="addCard" class="card add-card" type="button"><span class="plus">+</span>Neues Arbeitspaket</button>`;
  board.innerHTML = cards + addTile;
  bind();
}

function updateCount() {
  pkgCount.textContent = data.length;
}

function readFields(card, p) {
  card.querySelectorAll("[data-field]").forEach(e => p[e.dataset.field] = e.value);
}

function fieldsOf(p) {
  const { id, ...rest } = p;
  return rest;
}

// ---------- Interaktion ----------
function bind() {
  document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => {
    editing.add(b.dataset.edit);
    render();
    focusCard(b.dataset.edit);
  });

  document.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => {
    const id = b.dataset.cancel;
    if (tempCards.has(id)) {
      tempCards.delete(id);
      data = data.filter(x => x.id !== id);
    }
    editing.delete(id);
    dropDraft(id);
    render();
  });

  document.querySelectorAll("[data-save]").forEach(b => b.onclick = async () => {
    const id = b.dataset.save;
    const card = b.closest(".card");
    const p = data.find(x => x.id === id);
    readFields(card, p);
    try {
      if (tempCards.has(id)) {
        p.order = persistedList().length + 1; // ans Ende der bestehenden Reihenfolge
        const ref = doc(collection(db, COLLECTION));
        await setDoc(ref, fieldsOf(p));
        tempCards.delete(id);
      } else {
        await updateDoc(doc(db, COLLECTION, id), fieldsOf(p));
      }
      editing.delete(id);
      dropDraft(id);
      markSaved(card);
      flash("Arbeitspaket gespeichert.");
    } catch (err) {
      flash("Fehler beim Speichern.");
      console.error(err);
    }
  });

  document.querySelectorAll("[data-delete]").forEach(b => b.onclick = async () => {
    const id = b.dataset.delete;
    const p = data.find(x => x.id === id);
    if (tempCards.has(id)) {
      tempCards.delete(id);
      editing.delete(id);
      dropDraft(id);
      data = data.filter(x => x.id !== id);
      render();
      return;
    }
    if (!confirm(`„${p.title || "Ohne Titel"}“ wirklich löschen?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
      editing.delete(id);
      dropDraft(id);
      flash("Arbeitspaket gelöscht.");
    } catch (err) {
      flash("Fehler beim Löschen.");
      console.error(err);
    }
  });

  document.querySelectorAll('.card.editing [data-field="status"]').forEach(e => e.onchange = () => {
    e.closest(".status-wrap").querySelector(".status-dot").style.background = statuses[e.value].color;
  });

  // Verschieben per Pfeil-Buttons (auch am Handy/Tablet)
  document.querySelectorAll("[data-move]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.move;
    const idx = persistedList().findIndex(x => x.id === id);
    moveCard(id, idx + Number(b.dataset.dir));
  });

  // Verschieben per Drag & Drop (Maus): Karte auf eine andere Karte ziehen
  document.querySelectorAll('.card[draggable="true"]').forEach(c => {
    c.ondragstart = (e) => {
      dragId = c.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
      c.classList.add("dragging");
    };
    c.ondragend = () => {
      dragId = null;
      document.querySelectorAll(".dragging,.drop-target").forEach(x => x.classList.remove("dragging", "drop-target"));
    };
  });
  document.querySelectorAll(".card[data-id]").forEach(c => {
    const targetOk = () => dragId && dragId !== c.dataset.id && !tempCards.has(c.dataset.id);
    c.ondragover = (e) => {
      if (!targetOk()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      c.classList.add("drop-target");
    };
    c.ondragleave = (e) => {
      if (!c.contains(e.relatedTarget)) c.classList.remove("drop-target");
    };
    c.ondrop = (e) => {
      if (!targetOk()) return;
      e.preventDefault();
      const toIdx = persistedList().findIndex(x => x.id === c.dataset.id);
      const id = dragId;
      dragId = null;
      moveCard(id, toIdx);
    };
  });

  addCard.onclick = () => {
    const id = "tmp-" + Date.now();
    const p = { id, ...emptyPackage(nextOrder()) };
    tempCards.set(id, p);
    data.push(p);
    editing.add(id);
    render();
    focusCard(id);
  };
}

// Karte an eine neue Position schieben; die Positionen 1…n werden neu vergeben
// und gemeinsam (atomar) in Firestore gespeichert.
async function moveCard(id, toIdx) {
  const list = persistedList();
  const from = list.findIndex(p => p.id === id);
  if (from < 0 || toIdx < 0 || toIdx >= list.length || from === toIdx) return;

  captureDrafts();
  const [item] = list.splice(from, 1);
  list.splice(toIdx, 0, item);

  const batch = writeBatch(db);
  list.forEach((p, i) => {
    if (p.order !== i + 1) batch.update(doc(db, COLLECTION, p.id), { order: i + 1 });
    p.order = i + 1;
  });
  data = [...list, ...tempCards.values()]; // sofort anzeigen, Firestore zieht nach
  render();
  focusCard(id);

  try {
    await batch.commit();
    saveState.textContent = "Reihenfolge gespeichert · " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    flash("Fehler beim Verschieben.");
    console.error(err);
  }
}

function focusCard(id) {
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    const title = card.querySelector('[data-field="title"]');
    if (title) { title.focus(); title.select(); }
  }
}

function markSaved(card) {
  card.classList.add("just-saved");
  setTimeout(() => card.classList.remove("just-saved"), 900);
  saveState.textContent = "Gespeichert · " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  saveBtn.classList.add("just-saved");
  setTimeout(() => saveBtn.classList.remove("just-saved"), 900);
}

function flash(t) {
  message.textContent = t;
  message.classList.add("show");
  clearTimeout(window.ft);
  window.ft = setTimeout(() => message.classList.remove("show"), 2400);
}

// ---------- Globale Aktionen ----------
saveBtn.onclick = async () => {
  const cards = [...document.querySelectorAll(".card.editing")];
  try {
    for (const card of cards) {
      const id = card.dataset.id;
      const p = data.find(x => x.id === id);
      if (!p) continue;
      readFields(card, p);
      if (tempCards.has(id)) {
        p.order = persistedList().length + 1; // ans Ende der bestehenden Reihenfolge
        const ref = doc(collection(db, COLLECTION));
        await setDoc(ref, fieldsOf(p));
        tempCards.delete(id);
      } else {
        await updateDoc(doc(db, COLLECTION, id), fieldsOf(p));
      }
      editing.delete(id);
      dropDraft(id);
    }
    saveState.textContent = "Gespeichert · " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    saveBtn.classList.add("just-saved");
    setTimeout(() => saveBtn.classList.remove("just-saved"), 900);
    flash("Alle Arbeitspakete gespeichert.");
  } catch (err) {
    flash("Fehler beim Speichern.");
    console.error(err);
  }
};

pdfBtn.onclick = () => window.print();
helpBtn.onclick = () => helpModal.classList.remove("hidden");
closeHelp.onclick = () => helpModal.classList.add("hidden");

// ---------- Installierbar als Desktop-/Startbildschirm-App (PWA) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => console.error("Service Worker:", err));
  });
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.classList.remove("hidden");
});

installBtn.onclick = async () => {
  if (!deferredInstallPrompt) return;
  installBtn.disabled = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.classList.add("hidden");
  installBtn.disabled = false;
};

window.addEventListener("appinstalled", () => {
  installBtn.classList.add("hidden");
  flash("App wurde installiert.");
});

