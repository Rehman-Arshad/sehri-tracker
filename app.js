// ─────────────────────────────────────────────
//  Sehri & Aftari Expense Tracker — app.js
//  Storage: localStorage (offline) + Firebase (online)
// ─────────────────────────────────────────────

/* ── STATE ─────────────────────────────────────────────── */
let state = {
  members: [],       // { id, name }
  expenses: [],      // { id, date, desc, splits: [{type, amount, memberIds}] }
  collections: [],   // { id, date, amountPerPerson, memberIds, note }
};

let isManagerMode = false;
let pendingAction = null;
let pinBuffer = '';
const PIN_KEY = 'sehri_manager_pin';
const STATE_KEY = 'sehri_state';
let splitRowCount = 0;
let currentHistoryFilter = 'all';

// Firebase refs (set after config loaded)
let db = null;
let fbExpensesRef = null;
let fbMembersRef = null;
let fbCollectionsRef = null;

/* ── INIT ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  tryInitFirebase();
  renderAll();
  setTodayAsDefault();
});

function setTodayAsDefault() {
  const today = new Date().toISOString().split('T')[0];
  const dateInputs = ['exp-date', 'collect-date'];
  dateInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

/* ── LOCAL STORAGE ─────────────────────────────────────── */
function saveToLocalStorage() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadFromLocalStorage() {
  const raw = localStorage.getItem(STATE_KEY);
  if (raw) {
    try { state = { ...state, ...JSON.parse(raw) }; }
    catch(e) { console.warn('State parse error', e); }
  }
}

/* ── FIREBASE CONFIG (hardcoded so everyone auto-connects) ── */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB5xaEAc0K6mpBioSD0IpxyIJdbPB7pXI8",
  authDomain: "calculation-be25c.firebaseapp.com",
  projectId: "calculation-be25c",
  storageBucket: "calculation-be25c.firebasestorage.app",
  messagingSenderId: "998074965418",
  appId: "1:998074965418:web:e6314cc93ef07040bc1fd3",
  measurementId: "G-T14CWTR10Q"
};

/* ── FIREBASE SETUP ────────────────────────────────────── */
function tryInitFirebase() {
  initFirebase(FIREBASE_CONFIG);
}

function initFirebase(config) {
  try {
    // Delete existing app if any
    try { firebase.app('sehri-tracker').delete(); } catch(_) {}

    const app = firebase.initializeApp(config, 'sehri-tracker');
    db = firebase.firestore(app);

    // Listen: members
    db.collection('members').onSnapshot(snap => {
      state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage();
      renderAll();
    });

    // Listen: expenses
    db.collection('expenses').orderBy('date', 'desc').onSnapshot(snap => {
      state.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage();
      renderAll();
    });

    // Listen: collections
    db.collection('collections').orderBy('date', 'desc').onSnapshot(snap => {
      state.collections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage();
      renderAll();
    });

    setFirebaseStatus('✅ Connected to Firebase — real-time sync active', 'ok');
  } catch(e) {
    console.error('Firebase init error', e);
    setFirebaseStatus('❌ Firebase connection failed. Check your config.', 'err');
  }
}


function setFirebaseStatus(msg, cls) {
  const el = document.getElementById('firebase-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'firebase-status ' + cls;
}

/* ── FIREBASE WRITE HELPERS ────────────────────────────── */
async function fbSet(collName, id, data) {
  if (!db) return;
  await db.collection(collName).doc(id).set(data);
}

async function fbDelete(collName, id) {
  if (!db) return;
  await db.collection(collName).doc(id).delete();
}

/* ── RENDER ALL ────────────────────────────────────────── */
function renderAll() {
  renderDashboard();
  renderMembers();
  renderHistory();
  renderContributions();
  updateManagerUI();
}

/* ── DASHBOARD ─────────────────────────────────────────── */
function renderDashboard() {
  const totalCollected = getTotalCollected();
  const totalSpent = getTotalSpent();
  const poolBalance = totalCollected - totalSpent;

  document.getElementById('pool-balance').textContent = formatPKR(poolBalance);
  document.getElementById('pool-balance').style.color = poolBalance < 0 ? 'var(--red)' : '#fff';
  document.getElementById('pool-sub').textContent =
    `${formatPKR(totalCollected)} collected − ${formatPKR(totalSpent)} spent`;
  document.getElementById('total-collected').textContent = formatPKR(totalCollected);
  document.getElementById('total-spent').textContent = formatPKR(totalSpent);
  document.getElementById('total-members').textContent = state.members.length;

  // Recent entries: last 5 expenses + collections merged and sorted
  const recent = getRecentEntries(5);
  const el = document.getElementById('recent-list');
  if (recent.length === 0) {
    el.innerHTML = '<div class="empty-state">No entries yet — add your first expense!</div>';
  } else {
    el.innerHTML = recent.map(entry => renderEntryCard(entry, false)).join('');
  }
}

function getTotalCollected() {
  return state.collections.reduce((sum, c) => {
    return sum + (c.amountPerPerson * c.memberIds.length);
  }, 0);
}

function getTotalSpent() {
  return state.expenses.reduce((sum, e) => {
    return sum + e.splits.reduce((s, sp) => s + Number(sp.amount), 0);
  }, 0);
}

function getRecentEntries(n) {
  const expenses = state.expenses.map(e => ({ ...e, _type: 'expense' }));
  const collections = state.collections.map(c => ({ ...c, _type: 'collection' }));
  return [...expenses, ...collections]
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, n);
}

/* ── MEMBERS ───────────────────────────────────────────── */
function renderMembers() {
  const el = document.getElementById('members-list');
  if (state.members.length === 0) {
    el.innerHTML = '<div class="empty-state">No members yet — add roommates!</div>';
    return;
  }
  el.innerHTML = state.members.map(m => {
    const { contributed, owed, balance } = getMemberBalance(m.id);
    const balClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero';
    const balSign = balance > 0 ? '+' : '';
    const initials = m.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    return `
      <div class="member-card">
        <div class="member-avatar">${initials}</div>
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-meta">Paid: ${formatPKR(contributed)} · Share: ${formatPKR(owed)}</div>
        </div>
        <div>
          <div class="member-balance ${balClass}">${balSign}${formatPKR(balance)}</div>
          <div class="member-balance-label">${balance >= 0 ? 'credit' : 'owes'}</div>
        </div>
        ${isManagerMode ? `<button class="member-remove" onclick="removeMember('${m.id}')" title="Remove">🗑️</button>` : ''}
      </div>`;
  }).join('');
}

function getMemberBalance(memberId) {
  // contributed = sum of collections where this member is included
  const contributed = state.collections
    .filter(c => c.memberIds.includes(memberId))
    .reduce((sum, c) => sum + Number(c.amountPerPerson), 0);

  // owed = sum of splits where this member is included
  const owed = state.expenses.reduce((sum, e) => {
    return sum + e.splits.reduce((s, sp) => {
      if (sp.memberIds.includes(memberId)) {
        return s + Number(sp.amount) / sp.memberIds.length;
      }
      return s;
    }, 0);
  }, 0);

  return { contributed, owed, balance: contributed - owed };
}

/* ── HISTORY ───────────────────────────────────────────── */
function renderHistory() {
  let expenses = state.expenses;
  if (currentHistoryFilter !== 'all') {
    expenses = expenses.filter(e =>
      e.splits.some(s => s.type === currentHistoryFilter)
    );
  }
  const el = document.getElementById('history-list');
  if (expenses.length === 0) {
    el.innerHTML = '<div class="empty-state">No expenses found</div>';
    return;
  }
  el.innerHTML = expenses
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .map(e => renderEntryCard({ ...e, _type: 'expense' }, true))
    .join('');
}

function filterHistory(type, btn) {
  currentHistoryFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

/* ── CONTRIBUTIONS ─────────────────────────────────────── */
function renderContributions() {
  const el = document.getElementById('contributions-list');
  if (state.collections.length === 0) {
    el.innerHTML = '<div class="empty-state">No collections yet</div>';
    return;
  }
  el.innerHTML = state.collections
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .map(c => renderEntryCard({ ...c, _type: 'collection' }, true))
    .join('');
}

/* ── ENTRY CARD ────────────────────────────────────────── */
function renderEntryCard(entry, showDelete) {
  if (entry._type === 'collection') {
    const total = entry.amountPerPerson * entry.memberIds.length;
    const names = entry.memberIds.map(id => getMemberName(id)).join(', ');
    return `
      <div class="entry-card">
        <div class="entry-header">
          <div>
            <span class="entry-tag tag-collection">💰 Collection</span>
            <span class="entry-title">${escHtml(entry.note || 'Money Collected')}</span>
          </div>
          ${showDelete && isManagerMode ? `<button class="entry-delete" onclick="deleteCollection('${entry.id}')">🗑️</button>` : ''}
        </div>
        <div class="entry-splits">
          <div class="entry-split-row">
            <span>${formatDate(entry.date)}</span>
            <span class="entry-amount">+${formatPKR(total)}</span>
          </div>
          <div class="entry-split-row">
            <span>PKR ${entry.amountPerPerson}/person × ${entry.memberIds.length}</span>
            <span style="color:var(--text3)">${names}</span>
          </div>
        </div>
      </div>`;
  }

  // expense
  const totalAmt = entry.splits.reduce((s, sp) => s + Number(sp.amount), 0);
  const splitsHTML = entry.splits.map(sp => {
    const names = sp.memberIds.map(id => getMemberName(id)).join(', ');
    const perHead = (Number(sp.amount) / sp.memberIds.length).toFixed(0);
    return `
      <div class="entry-split-row">
        <span><span class="entry-tag tag-${sp.type}">${capFirst(sp.type)}</span>${names}</span>
        <span>${formatPKR(sp.amount)} (${formatPKR(perHead)}/ea)</span>
      </div>`;
  }).join('');

  return `
    <div class="entry-card">
      <div class="entry-header">
        <div>
          <div class="entry-title">${escHtml(entry.desc || 'Expense')}</div>
          <div class="entry-date">${formatDate(entry.date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="entry-amount">−${formatPKR(totalAmt)}</span>
          ${showDelete && isManagerMode ? `<button class="entry-delete" onclick="deleteExpense('${entry.id}')">🗑️</button>` : ''}
        </div>
      </div>
      <div class="entry-splits">${splitsHTML}</div>
    </div>`;
}

/* ── ADD EXPENSE MODAL ─────────────────────────────────── */
let activeSplitRows = [];

function openExpenseModal() {
  splitRowCount = 0;
  activeSplitRows = [];
  const container = document.getElementById('expense-splits-container');
  container.innerHTML = '';
  addSplitRow();
  setTodayAsDefault();
  document.getElementById('exp-desc').value = '';
  document.getElementById('expense-modal').classList.remove('hidden');
}

function closeExpenseModal() {
  document.getElementById('expense-modal').classList.add('hidden');
}

function addSplitRow() {
  splitRowCount++;
  const rowId = 'split-' + splitRowCount;
  activeSplitRows.push(rowId);

  const container = document.getElementById('expense-splits-container');
  const memberCheckboxes = state.members.map(m => `
    <label class="check-item" id="${rowId}-chk-${m.id}" onclick="toggleCheckItem('${rowId}-chk-${m.id}', '${m.id}', '${rowId}')">
      <input type="checkbox" value="${m.id}" class="split-checkbox-${rowId}" />
      <span class="check-box"></span>
      <span class="check-name">${escHtml(m.name)}</span>
    </label>`).join('');

  const div = document.createElement('div');
  div.className = 'split-row-card';
  div.id = rowId;
  div.innerHTML = `
    <div class="split-row-header">
      <span class="split-row-title">Split ${splitRowCount}</span>
      ${splitRowCount > 1 ? `<button class="split-remove-btn" onclick="removeSplitRow('${rowId}')">×</button>` : ''}
    </div>
    <div class="split-type-row">
      <button class="type-pill selected" data-row="${rowId}" data-type="sehri" onclick="selectType(this, '${rowId}')">🌅 Sehri</button>
      <button class="type-pill" data-row="${rowId}" data-type="aftari" onclick="selectType(this, '${rowId}')">🌙 Aftari</button>
      <button class="type-pill" data-row="${rowId}" data-type="other" onclick="selectType(this, '${rowId}')">📦 Other</button>
    </div>
    <div class="split-amount-row">
      <input type="number" class="text-input split-amount-input" id="${rowId}-amount" placeholder="Amount (PKR)" />
    </div>
    <div class="split-members-label" style="margin-top:10px">Split among:</div>
    ${state.members.length > 0 ? `<div class="checkbox-grid">${memberCheckboxes}</div>` : '<p style="font-size:12px;color:var(--text3)">Add members first</p>'}
  `;
  container.appendChild(div);

  // Select all by default
  state.members.forEach(m => {
    const el = document.getElementById(`${rowId}-chk-${m.id}`);
    if (el) el.classList.add('checked');
    const cb = el?.querySelector('input[type=checkbox]');
    if (cb) cb.checked = true;
  });
}

function removeSplitRow(rowId) {
  document.getElementById(rowId)?.remove();
  activeSplitRows = activeSplitRows.filter(r => r !== rowId);
}

function selectType(btn, rowId) {
  const row = document.getElementById(rowId);
  row.querySelectorAll('.type-pill').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function toggleCheckItem(labelId, memberId, rowId) {
  const label = document.getElementById(labelId);
  const cb = label.querySelector('input[type=checkbox]');
  label.classList.toggle('checked');
  cb.checked = !cb.checked;
}

function submitExpense() {
  const date = document.getElementById('exp-date').value;
  const desc = document.getElementById('exp-desc').value.trim();
  if (!date) { alert('Please select a date'); return; }

  const splits = [];
  for (const rowId of activeSplitRows) {
    const row = document.getElementById(rowId);
    if (!row) continue;
    const amount = parseFloat(document.getElementById(`${rowId}-amount`).value);
    if (!amount || amount <= 0) { alert('Please enter a valid amount for each split'); return; }
    const selectedType = row.querySelector('.type-pill.selected')?.dataset.type || 'other';
    const memberIds = [];
    row.querySelectorAll(`input[type=checkbox]`).forEach(cb => {
      if (cb.checked) memberIds.push(cb.value);
    });
    if (memberIds.length === 0) { alert('Select at least one member for each split'); return; }
    splits.push({ type: selectedType, amount, memberIds });
  }

  if (splits.length === 0) { alert('Add at least one split'); return; }

  const expense = {
    id: 'exp-' + Date.now(),
    date,
    desc: desc || formatDate(date),
    splits,
  };

  state.expenses.unshift(expense);
  saveToLocalStorage();
  renderAll();
  fbSet('expenses', expense.id, expense);
  closeExpenseModal();
}

/* ── DELETE ────────────────────────────────────────────── */
function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  saveToLocalStorage();
  renderAll();
  fbDelete('expenses', id);
}

function deleteCollection(id) {
  if (!confirm('Delete this collection?')) return;
  state.collections = state.collections.filter(c => c.id !== id);
  saveToLocalStorage();
  renderAll();
  fbDelete('collections', id);
}

/* ── COLLECT MONEY MODAL ───────────────────────────────── */
function openCollectModal() {
  const el = document.getElementById('collect-member-checkboxes');
  el.innerHTML = state.members.map(m => `
    <label class="check-item checked" id="col-chk-${m.id}" onclick="toggleCheckItem('col-chk-${m.id}','${m.id}','collect')">
      <input type="checkbox" value="${m.id}" class="collect-checkbox" checked />
      <span class="check-box"></span>
      <span class="check-name">${escHtml(m.name)}</span>
    </label>`).join('');
  setTodayAsDefault();
  document.getElementById('collect-amount').value = '';
  document.getElementById('collect-note').value = '';
  document.getElementById('collect-modal').classList.remove('hidden');
}

function closeCollectModal() { document.getElementById('collect-modal').classList.add('hidden'); }

function submitCollection() {
  const date = document.getElementById('collect-date').value;
  const amount = parseFloat(document.getElementById('collect-amount').value);
  const note = document.getElementById('collect-note').value.trim();

  if (!date || !amount || amount <= 0) {
    alert('Please fill in the date and amount'); return;
  }

  const memberIds = [];
  document.querySelectorAll('.collect-checkbox').forEach(cb => {
    if (cb.checked) memberIds.push(cb.value);
  });
  if (memberIds.length === 0) { alert('Select at least one member'); return; }

  const collection = {
    id: 'col-' + Date.now(),
    date,
    amountPerPerson: amount,
    memberIds,
    note,
  };

  state.collections.unshift(collection);
  saveToLocalStorage();
  renderAll();
  fbSet('collections', collection.id, collection);
  closeCollectModal();
}

/* ── ADD MEMBER ────────────────────────────────────────── */
function openAddMemberModal() {
  document.getElementById('new-member-name').value = '';
  document.getElementById('add-member-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-member-name').focus(), 100);
}

function closeAddMemberModal() { document.getElementById('add-member-modal').classList.add('hidden'); }

function submitAddMember() {
  const name = document.getElementById('new-member-name').value.trim();
  if (!name) { alert('Please enter a name'); return; }
  if (state.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    alert('Member already exists'); return;
  }
  const member = { id: 'mbr-' + Date.now(), name };
  state.members.push(member);
  saveToLocalStorage();
  renderAll();
  fbSet('members', member.id, member);
  closeAddMemberModal();
}

function removeMember(id) {
  if (!confirm('Remove this member? Their expense shares will remain in history.')) return;
  state.members = state.members.filter(m => m.id !== id);
  saveToLocalStorage();
  renderAll();
  fbDelete('members', id);
}

/* ── PIN SYSTEM ────────────────────────────────────────── */
function requireManager(action) {
  if (isManagerMode) { action(); return; }
  pendingAction = action;
  pinBuffer = '';
  updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
  document.getElementById('pin-overlay').classList.remove('hidden');
}

function pinInput(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) checkPin();
}

function pinClear() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots span');
  dots.forEach((d, i) => {
    d.classList.toggle('filled', i < pinBuffer.length);
  });
}

function checkPin() {
  const savedPin = localStorage.getItem(PIN_KEY) || '1234';
  if (pinBuffer === savedPin) {
    isManagerMode = true;
    closePinOverlay();
    renderAll();
    if (pendingAction) { pendingAction(); pendingAction = null; }
  } else {
    document.getElementById('pin-error').classList.remove('hidden');
    pinBuffer = '';
    updatePinDots();
    // Shake animation
    const card = document.querySelector('.pin-card');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'shake 0.4s ease';
  }
}

function closePinOverlay() {
  document.getElementById('pin-overlay').classList.add('hidden');
  pinBuffer = '';
  updatePinDots();
}

function toggleManagerMode() {
  if (isManagerMode) {
    isManagerMode = false;
    pendingAction = null;
    renderAll();
  } else {
    requireManager(() => {});
  }
}

function updateManagerUI() {
  const icon = document.getElementById('manager-icon');
  const badge = document.getElementById('manager-badge');
  if (icon) icon.textContent = isManagerMode ? '🔓' : '🔒';
  if (badge) badge.classList.toggle('active', isManagerMode);

  const statusEl = document.getElementById('manager-status-text');
  if (statusEl) statusEl.textContent = isManagerMode ? '✅ Active — you can edit data' : 'Not active';

  const lockLabel = document.getElementById('actions-lock-label');
  if (lockLabel) lockLabel.style.display = isManagerMode ? 'none' : '';
}

/* ── PIN SETTINGS ──────────────────────────────────────── */
function openSetPinModal() {
  document.getElementById('new-pin-input').value = '';
  document.getElementById('confirm-pin-input').value = '';
  document.getElementById('set-pin-error').classList.add('hidden');
  document.getElementById('set-pin-modal').classList.remove('hidden');
}

function closeSetPinModal() { document.getElementById('set-pin-modal').classList.add('hidden'); }

function saveNewPin() {
  const p1 = document.getElementById('new-pin-input').value.trim();
  const p2 = document.getElementById('confirm-pin-input').value.trim();
  if (p1.length < 4 || p1 !== p2) {
    document.getElementById('set-pin-error').classList.remove('hidden'); return;
  }
  localStorage.setItem(PIN_KEY, p1);
  closeSetPinModal();
  alert('✅ PIN saved successfully!');
}

/* ── FIREBASE CONFIG ───────────────────────────────────── */
function saveFirebaseConfig() {
  const raw = document.getElementById('firebase-config-input').value.trim();
  try {
    const config = JSON.parse(raw);
    if (!config.apiKey) throw new Error('Missing apiKey');
    localStorage.setItem('sehri_fb_config', raw);
    initFirebase(config);
  } catch(e) {
    setFirebaseStatus('❌ Invalid JSON config. Please check and try again.', 'err');
  }
}

/* ── EXPORT ────────────────────────────────────────────── */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sehri-tracker-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAllData() {
  if (!confirm('⚠️ This will permanently delete ALL data. Are you sure?')) return;
  if (!confirm('Last warning — really delete everything?')) return;
  state = { members: [], expenses: [], collections: [] };
  saveToLocalStorage();
  renderAll();
}

/* ── TAB NAVIGATION ────────────────────────────────────── */
function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  btn.classList.add('active');
}

/* ── HELPERS ───────────────────────────────────────────── */
function getMemberName(id) {
  return state.members.find(m => m.id === id)?.name || 'Unknown';
}

function formatPKR(n) {
  const num = parseFloat(n) || 0;
  return 'PKR ' + Math.round(num).toLocaleString('en-PK');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function capFirst(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Add shake keyframe dynamically
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%    {transform:translateX(-8px)}
    40%    {transform:translateX(8px)}
    60%    {transform:translateX(-5px)}
    80%    {transform:translateX(5px)}
  }`;
document.head.appendChild(shakeStyle);
