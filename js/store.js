/* ── FIREBASE CONFIG ──────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB5xaEAc0K6mpBioSD0IpxyIJdbPB7pXI8",
  authDomain: "calculation-be25c.firebaseapp.com",
  projectId: "calculation-be25c",
  storageBucket: "calculation-be25c.firebasestorage.app",
  messagingSenderId: "998074965418",
  appId: "1:998074965418:web:e6314cc93ef07040bc1fd3",
  measurementId: "G-T14CWTR10Q"
};

/* ── GLOBAL STATE ─────────────────────────────────────── */
const STATE_KEY = 'sehri_state_v2';
const ADMIN_PIN_KEY = 'sehri_admin_pin';   // default: 1234
const TEAM_PIN_KEY  = 'sehri_team_pin';    // default: 0000

// 0 = Guest, 1 = Team, 2 = Admin
const ACCESS = { GUEST: 0, TEAM: 1, ADMIN: 2 };
let accessLevel = ACCESS.ADMIN; // Defaulting to Admin for testing ease

let state = {
  members: [],     // { id, name, inSehri, inAftari }
  expenses: [],    // { id, type, date, desc, items:[{name, amount}], splitAmong:[] }
  collections: [], // { id, type, date, amountPerPerson, memberIds, note }
  pins: { admin: '1234', team: '0000' } // synced from Firestore
};

let db = null; // Global Firestore reference

/* ── LOCAL STORAGE ────────────────────────────────────── */
function saveToLocalStorage() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(_) {}
}
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch(_) {}
}

/* ── FIREBASE INITIALIZATION ──────────────────────────── */
function initFirebase(config) {
  try {
    let app;
    try {
      app = firebase.app('sehri');
    } catch(_) {
      app = firebase.initializeApp(config, 'sehri');
    }
    db = firebase.firestore(app);

    const onSnapErr = (err) => {
      console.error('Firestore error:', err);
      setFbStatus('<i class="ph-fill ph-warning-circle"></i> ' + err.message, 'err');
    };

    // Note: We use renderAll() which will be defined in app.js
    db.collection('members').onSnapshot(snap => {
      state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage(); 
      if (typeof renderAll === 'function') renderAll();
    }, onSnapErr);

    db.collection('expenses').orderBy('date','desc').onSnapshot(snap => {
      state.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage(); 
      if (typeof renderAll === 'function') renderAll();
    }, onSnapErr);

    db.collection('collections').orderBy('date','desc').onSnapshot(snap => {
      state.collections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage(); 
      if (typeof renderAll === 'function') renderAll();
    }, onSnapErr);

    db.collection('settings').doc('pins').onSnapshot(snap => {
      if (snap.exists) {
        state.pins = snap.data();
        saveToLocalStorage();
      } else {
        db.collection('settings').doc('pins').set(state.pins);
      }
    }, onSnapErr);

    setFbStatus('<i class="ph-fill ph-check-circle"></i> Connected', 'ok');
    if (typeof hideLoadingScreen === 'function') hideLoadingScreen();

  } catch(e) {
    console.error('Firebase init error:', e);
    setFbStatus('<i class="ph-fill ph-warning-circle"></i> ' + e.message, 'err');
    if (typeof hideLoadingScreen === 'function') hideLoadingScreen();
  }
}

function fbSet(col, id, data) {
  if (db) db.collection(col).doc(id).set(data).catch(e => console.error('fbSet',e));
}
function fbDelete(col, id) {
  if (db) db.collection(col).doc(id).delete().catch(e => console.error('fbDel',e));
}

function setFbStatus(msg, cls) {
  ['firebase-status','firebase-status-small'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = msg; el.className = 'firebase-status ' + cls; }
  });
  const dot = document.getElementById('firebase-status-dot');
  if (dot) dot.innerHTML = cls === 'ok' ? '<i class="ph-fill ph-check-circle"></i>' : cls === 'err' ? '<i class="ph-fill ph-warning-circle"></i>' : '<i class="ph-fill ph-hourglass"></i>';
}

function num(n) { return (Number(n)||0).toLocaleString(); }
function formatPKR(n) { return 'PKR ' + num(n); }
function setEl(id, val) { const e=document.getElementById(id); if(e) e.textContent=val; }
