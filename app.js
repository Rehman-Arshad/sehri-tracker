// ─────────────────────────────────────────────────────────
//  Sehri & Aftari Expense Tracker — app.js v2
//  Features: Separate Sehri/Aftari groups, toasts, Firebase
// ─────────────────────────────────────────────────────────

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

/* ── STATE ────────────────────────────────────────────── */
let state = {
  members: [],     // { id, name, inSehri, inAftari }
  expenses: [],    // { id, date, desc, splits:[{type,amount,memberIds}] }
  collections: [], // { id, date, amountPerPerson, memberIds, note }
};

/* ── ACCESS LEVELS ──────────────────────────────────── */
// 0 = Guest: dashboard summary only (no collections, no member details)
// 1 = Team:  view all tabs, no add/edit/delete
// 2 = Admin: full access
const ACCESS = { GUEST: 0, TEAM: 1, ADMIN: 2 };

const ADMIN_PIN_KEY = 'sehri_admin_pin';   // default: 1234
const TEAM_PIN_KEY  = 'sehri_team_pin';    // default: 0000
const STATE_KEY     = 'sehri_state_v2';

let db = null;
let accessLevel = ACCESS.GUEST;
let pendingAction = null;
let pendingPinMode = null;  // 'team' | 'admin' | 'elevate'
let pinBuffer = '';
let splitRowCount = 0;
let currentHistoryFilter = 'all';
let assignSehri = true;
let assignAftari = false;

/* ── BOOT ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  renderAll();
  setTodayDefault();
  // Guaranteed: loading screen always hides within 2.5s
  setTimeout(hideLoadingScreen, 2500);
  initFirebase(FIREBASE_CONFIG);
});

let _loadingHidden = false;
function hideLoadingScreen() {
  if (_loadingHidden) return;
  _loadingHidden = true;
  document.getElementById('loading-screen')?.classList.add('done');
  showAccessGate();
}


function setTodayDefault() {
  const today = new Date().toISOString().split('T')[0];
  ['exp-date','collect-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

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

/* ── FIREBASE ─────────────────────────────────────────── */
function initFirebase(config) {
  try {
    try { firebase.app('sehri').delete(); } catch(_) {}
    const app = firebase.initializeApp(config, 'sehri');
    db = firebase.firestore(app);

    db.collection('members').onSnapshot(snap => {
      state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage(); renderAll();
    }, err => {
      setFbStatus('⚠️ Sync error: ' + err.message, 'err');
    });

    db.collection('expenses').orderBy('date','desc').onSnapshot(snap => {
      state.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage(); renderAll();
    });

    db.collection('collections').orderBy('date','desc').onSnapshot(snap => {
      state.collections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      saveToLocalStorage(); renderAll();
    });

    setFbStatus('✅ Connected', 'ok');
    hideLoadingScreen(); // connected early — hide loading now
  } catch(e) {
    console.error('Firebase init error:', e);
    setFbStatus('❌ Firebase error: ' + e.message, 'err');
    hideLoadingScreen(); // show gate even on failure
  }
}


function setFbStatus(msg, cls) {
  // Update settings Firebase status
  ['firebase-status','firebase-status-small'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.className = 'firebase-status ' + cls; }
  });
  // Update access gate sync indicator
  const sync = document.getElementById('access-sync-status');
  if (sync) {
    sync.textContent = cls === 'ok' ? '✅ Firebase connected' : cls === 'err' ? '⚠️ Offline — using cached data' : '⏳ Connecting...';
    sync.style.color = cls === 'ok' ? 'var(--green)' : cls === 'err' ? 'var(--yellow)' : 'var(--text3)';
  }
}


async function fbSet(col, id, data) {
  if (db) await db.collection(col).doc(id).set(data);
}
async function fbDelete(col, id) {
  if (db) await db.collection(col).doc(id).delete();
}

/* ── TOAST SYSTEM ─────────────────────────────────────── */
function toast(msg, type = 'info', duration = 3000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ── RENDER ALL ───────────────────────────────────────── */
function renderAll() {
  renderDashboard();
  renderSehriMembers();
  renderAftariMembers();
  renderHistory();
  renderContributions();
  updateManagerUI();
}

/* ── DASHBOARD ────────────────────────────────────────── */
function renderDashboard() {
  const collected = getTotalCollected();
  const spent     = getTotalSpent();
  const balance   = collected - spent;

  const balEl = document.getElementById('pool-balance');
  if (balEl) {
    balEl.textContent = formatPKR(balance);
    balEl.style.textShadow = balance < 0
      ? '0 0 30px rgba(255,90,122,0.5)'
      : '0 0 30px rgba(0,212,170,0.4)';
  }

  setEl('pool-sub', `${formatPKR(collected)} collected − ${formatPKR(spent)} spent`);
  setEl('total-collected', formatPKR(collected));
  setEl('total-spent', formatPKR(spent));
  setEl('total-members', String(state.members.length));
  setEl('stat-collected-count', state.collections.length + ' rounds');
  setEl('stat-expense-count', state.expenses.length + ' entries');

  // Sehri / Aftari today summary
  const today = new Date().toISOString().split('T')[0];
  const todayExp = state.expenses.filter(e => e.date === today);
  let sehriToday = 0, aftariToday = 0;
  todayExp.forEach(e => e.splits.forEach(sp => {
    if (sp.type === 'sehri') sehriToday += Number(sp.amount);
    if (sp.type === 'aftari') aftariToday += Number(sp.amount);
  }));
  setEl('sehri-today', formatPKR(sehriToday));
  setEl('aftari-today', formatPKR(aftariToday));
  setEl('sehri-members-count', getSehriMembers().length + ' members');
  setEl('aftari-members-count', getAftariMembers().length + ' members');

  // Recent entries
  const recent = getRecentEntries(5);
  const el = document.getElementById('recent-list');
  if (!el) return;
  if (recent.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🌙</div>
      <div class="empty-text">No entries yet</div>
      <div class="empty-sub">Add your first expense to get started</div>
    </div>`;
  } else {
    el.innerHTML = recent.map(e => renderEntryCard(e, false)).join('');
  }
}

function getTotalCollected() {
  return state.collections.reduce((s,c) => s + Number(c.amountPerPerson) * c.memberIds.length, 0);
}
function getTotalSpent() {
  return state.expenses.reduce((s,e) => s + e.splits.reduce((ss,sp) => ss + Number(sp.amount), 0), 0);
}
function getRecentEntries(n) {
  return [
    ...state.expenses.map(e => ({...e, _type:'expense'})),
    ...state.collections.map(c => ({...c, _type:'collection'})),
  ].sort((a,b) => b.date > a.date ? 1 : -1).slice(0, n);
}

/* ── MEMBER GROUPS ────────────────────────────────────── */
function getSehriMembers()  { return state.members.filter(m => m.inSehri); }
function getAftariMembers() { return state.members.filter(m => m.inAftari); }

function renderSehriMembers() {
  const list = getSehriMembers();
  const el = document.getElementById('sehri-members-list');
  setEl('sehri-count-badge', list.length);
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state small">No Sehri members yet</div>`;
    return;
  }
  el.innerHTML = list.map(m => memberCardHTML(m, 'sehri')).join('');
}

function renderAftariMembers() {
  const list = getAftariMembers();
  const el = document.getElementById('aftari-members-list');
  setEl('aftari-count-badge', list.length);
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state small">No Aftari members yet</div>`;
    return;
  }
  el.innerHTML = list.map(m => memberCardHTML(m, 'aftari')).join('');
}

function memberCardHTML(m, context) {
  const { contributed, owed, balance } = getMemberBalance(m.id, context);
  const balClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero';
  const balSign  = balance > 0 ? '+' : '';
  const initials = m.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  const avatarClass = m.inSehri && m.inAftari ? 'both-avatar' : m.inSehri ? 'sehri-avatar' : 'aftari-avatar';

  const groupPills = [
    m.inSehri ? `<span class="entry-tag tag-sehri">🌅 Sehri</span>` : '',
    m.inAftari ? `<span class="entry-tag tag-aftari">🌙 Aftari</span>` : '',
  ].join('');

  return `
    <div class="member-card">
      <div class="member-avatar ${avatarClass}">${initials}</div>
      <div class="member-info">
        <div class="member-name">${escHtml(m.name)}</div>
        <div class="member-groups">${groupPills}</div>
        <div class="member-meta">Paid: ${formatPKR(contributed)} · Share: ${formatPKR(owed)}</div>
      </div>
      <div class="member-balance-wrap">
        <div class="member-balance ${balClass}">${balSign}${formatPKR(balance)}</div>
        <div class="member-balance-label">${balance >= 0 ? 'credit' : 'owes'}</div>
      </div>
      ${accessLevel >= ACCESS.ADMIN ? `<button class="member-remove" onclick="removeMember('${m.id}')">🗑️</button>` : ''}
    </div>`;
}

function getMemberBalance(memberId, context) {
  const contributed = state.collections
    .filter(c => c.memberIds.includes(memberId))
    .reduce((s,c) => s + Number(c.amountPerPerson), 0);

  const owed = state.expenses.reduce((s, e) => {
    return s + e.splits.reduce((ss, sp) => {
      if (sp.memberIds.includes(memberId)) {
        return ss + Number(sp.amount) / sp.memberIds.length;
      }
      return ss;
    }, 0);
  }, 0);

  return { contributed, owed, balance: contributed - owed };
}

/* ── HISTORY ──────────────────────────────────────────── */
function renderHistory() {
  let list = state.expenses.slice();
  if (currentHistoryFilter !== 'all') {
    list = list.filter(e => e.splits.some(s => s.type === currentHistoryFilter));
  }
  const el = document.getElementById('history-list');
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">No expenses found</div></div>`;
    return;
  }
  el.innerHTML = list.sort((a,b)=>b.date>a.date?1:-1).map(e=>renderEntryCard({...e,_type:'expense'},true)).join('');
}

function filterHistory(type, btn) {
  currentHistoryFilter = type;
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

/* ── CONTRIBUTIONS ────────────────────────────────────── */
function renderContributions() {
  const el = document.getElementById('contributions-list');
  if (!el) return;
  if (state.collections.length === 0) {
    el.innerHTML = `<div class="empty-state small">No collections yet</div>`; return;
  }
  el.innerHTML = state.collections
    .sort((a,b)=>b.date>a.date?1:-1)
    .map(c=>renderEntryCard({...c,_type:'collection'},true)).join('');
}

/* ── ENTRY CARD ───────────────────────────────────────── */
function renderEntryCard(entry, showDelete) {
  if (entry._type === 'collection') {
    const total = Number(entry.amountPerPerson) * entry.memberIds.length;
    const names = entry.memberIds.map(id=>getMemberName(id)).join(', ');
    return `<div class="entry-card">
      <div class="entry-header">
        <div>
          <div class="entry-title"><span class="entry-tag tag-collection">💰 Collection</span>${escHtml(entry.note||'Money Collected')}</div>
          <div class="entry-date">${formatDate(entry.date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="entry-amount collection">+${formatPKR(total)}</span>
          ${showDelete&&accessLevel >= ACCESS.ADMIN?`<button class="entry-delete" onclick="deleteCollection('${entry.id}')">🗑️</button>`:''}
        </div>
      </div>
      <div class="entry-splits">
        <div class="entry-split-row">
          <span>PKR ${num(entry.amountPerPerson)}/person × ${entry.memberIds.length} members</span>
          <span style="color:var(--text3);font-size:11px">${names}</span>
        </div>
      </div>
    </div>`;
  }

  const totalAmt = entry.splits.reduce((s,sp)=>s+Number(sp.amount),0);
  const splitsHTML = entry.splits.map(sp => {
    const memberNames = sp.memberIds.map(id=>getMemberName(id)).join(', ');
    const perHead = (Number(sp.amount)/sp.memberIds.length).toFixed(0);
    return `<div class="entry-split-row">
      <span><span class="entry-tag tag-${sp.type}">${mealLabel(sp.type)}</span>${memberNames}</span>
      <span>${formatPKR(sp.amount)} <span style="color:var(--text3)">(${formatPKR(perHead)}/ea)</span></span>
    </div>`;
  }).join('');

  return `<div class="entry-card">
    <div class="entry-header">
      <div>
        <div class="entry-title">${escHtml(entry.desc||'Expense')}</div>
        <div class="entry-date">${formatDate(entry.date)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="entry-amount expense">−${formatPKR(totalAmt)}</span>
        ${showDelete&&accessLevel >= ACCESS.ADMIN?`<button class="entry-delete" onclick="deleteExpense('${entry.id}')">🗑️</button>`:''}
      </div>
    </div>
    <div class="entry-splits">${splitsHTML}</div>
  </div>`;
}

/* ── ADD EXPENSE MODAL ────────────────────────────────── */
let activeSplitRows = [];

function openExpenseModal() {
  splitRowCount = 0; activeSplitRows = [];
  document.getElementById('expense-splits-container').innerHTML = '';
  document.getElementById('exp-desc').value = '';
  setTodayDefault();
  addSplitRow();
  document.getElementById('expense-modal').classList.remove('hidden');
}
function closeExpenseModal() { document.getElementById('expense-modal').classList.add('hidden'); }

function addSplitRow() {
  splitRowCount++;
  const rowId = 'split-' + splitRowCount;
  activeSplitRows.push(rowId);

  // Default members: Sehri group (first split) or all
  const defaultMembers = splitRowCount === 1 ? getSehriMembers() : state.members;

  const checkboxes = state.members.map(m => {
    const checked = defaultMembers.some(dm => dm.id === m.id);
    return `<label class="check-item ${checked?'checked':''}" id="${rowId}-chk-${m.id}"
      onclick="toggleCheckItem('${rowId}-chk-${m.id}','${m.id}','${rowId}')">
      <input type="checkbox" value="${m.id}" ${checked?'checked':''} />
      <span class="check-box"></span>
      <span class="check-name">${escHtml(m.name)}</span>
    </label>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'split-row-card'; div.id = rowId;
  div.innerHTML = `
    <div class="split-row-header">
      <span class="split-row-title">Split ${splitRowCount}</span>
      ${splitRowCount>1?`<button class="split-remove-btn" onclick="removeSplitRow('${rowId}')">×</button>`:''}
    </div>
    <div class="split-type-row">
      <button class="type-pill sehri-pill selected" onclick="selectType(this,'${rowId}','sehri')">🌅 Sehri</button>
      <button class="type-pill aftari-pill" onclick="selectType(this,'${rowId}','aftari')">🌙 Aftari</button>
      <button class="type-pill other-pill" onclick="selectType(this,'${rowId}','other')">📦 Other</button>
    </div>
    <input type="number" class="text-input" id="${rowId}-amount" placeholder="Amount (PKR)" style="margin-bottom:4px" />
    <div class="split-members-label">Split among:</div>
    ${state.members.length>0?`<div class="checkbox-grid">${checkboxes}</div>`:'<p style="font-size:12px;color:var(--text3);margin-top:4px">Add members first in the Members tab</p>'}
  `;
  document.getElementById('expense-splits-container').appendChild(div);
}

function removeSplitRow(rowId) {
  document.getElementById(rowId)?.remove();
  activeSplitRows = activeSplitRows.filter(r=>r!==rowId);
}

function selectType(btn, rowId, type) {
  const row = document.getElementById(rowId);
  row.querySelectorAll('.type-pill').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');

  // Auto-select the right group members
  const groupMembers = type==='sehri' ? getSehriMembers()
                     : type==='aftari' ? getAftariMembers()
                     : state.members;

  state.members.forEach(m => {
    const label = document.getElementById(`${rowId}-chk-${m.id}`);
    const cb = label?.querySelector('input[type=checkbox]');
    if (!label || !cb) return;
    const shouldCheck = groupMembers.some(gm=>gm.id===m.id);
    label.classList.toggle('checked', shouldCheck);
    cb.checked = shouldCheck;
  });
}

function toggleCheckItem(labelId, memberId, rowId) {
  const label = document.getElementById(labelId);
  const cb = label?.querySelector('input[type=checkbox]');
  if (!label||!cb) return;
  label.classList.toggle('checked');
  cb.checked = !cb.checked;
}

function submitExpense() {
  const date = document.getElementById('exp-date').value;
  const desc = document.getElementById('exp-desc').value.trim();
  if (!date) { toast('Please select a date','error'); return; }

  const splits = [];
  for (const rowId of activeSplitRows) {
    const row = document.getElementById(rowId);
    if (!row) continue;
    const amount = parseFloat(document.getElementById(`${rowId}-amount`)?.value);
    if (!amount||amount<=0) { toast('Enter a valid amount for each split','error'); return; }
    const type = row.querySelector('.type-pill.selected')?.dataset?.type
               || (row.querySelector('.type-pill.selected')?.classList.contains('sehri-pill') ? 'sehri'
                 : row.querySelector('.type-pill.selected')?.classList.contains('aftari-pill') ? 'aftari' : 'other');

    // Determine type from button text/class
    let selectedType = 'sehri';
    const selBtn = row.querySelector('.type-pill.selected');
    if (selBtn?.classList.contains('aftari-pill')) selectedType = 'aftari';
    else if (selBtn?.classList.contains('other-pill')) selectedType = 'other';

    const memberIds = [];
    row.querySelectorAll('input[type=checkbox]').forEach(cb=>{if(cb.checked)memberIds.push(cb.value);});
    if (memberIds.length===0) { toast('Select at least one member for each split','error'); return; }
    splits.push({ type: selectedType, amount, memberIds });
  }
  if (splits.length===0) { toast('Add at least one split','error'); return; }

  const expense = { id: 'exp-'+Date.now(), date, desc: desc||formatDate(date), splits };
  state.expenses.unshift(expense);
  saveToLocalStorage(); renderAll();
  fbSet('expenses', expense.id, expense);
  closeExpenseModal();
  toast('Expense saved!','success');
}

/* ── DELETE ───────────────────────────────────────────── */
function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  state.expenses = state.expenses.filter(e=>e.id!==id);
  saveToLocalStorage(); renderAll();
  fbDelete('expenses', id);
  toast('Expense deleted','info');
}
function deleteCollection(id) {
  if (!confirm('Delete this collection?')) return;
  state.collections = state.collections.filter(c=>c.id!==id);
  saveToLocalStorage(); renderAll();
  fbDelete('collections', id);
  toast('Collection deleted','info');
}

/* ── COLLECT MODAL ────────────────────────────────────── */
function openCollectModal() {
  const el = document.getElementById('collect-member-checkboxes');
  el.innerHTML = state.members.map(m=>`
    <label class="check-item checked" id="col-chk-${m.id}"
      onclick="toggleCheckItem('col-chk-${m.id}','${m.id}','collect')">
      <input type="checkbox" value="${m.id}" checked />
      <span class="check-box"></span>
      <span class="check-name">${escHtml(m.name)}</span>
    </label>`).join('');
  document.getElementById('collect-amount').value = '';
  document.getElementById('collect-note').value = '';
  setTodayDefault();
  document.getElementById('collect-modal').classList.remove('hidden');
}
function closeCollectModal() { document.getElementById('collect-modal').classList.add('hidden'); }

function submitCollection() {
  const date   = document.getElementById('collect-date').value;
  const amount = parseFloat(document.getElementById('collect-amount').value);
  const note   = document.getElementById('collect-note').value.trim();
  if (!date||!amount||amount<=0) { toast('Fill in date and amount','error'); return; }

  const memberIds = [];
  document.querySelectorAll('.collect-checkbox, #collect-member-checkboxes input[type=checkbox]')
    .forEach(cb=>{ if(cb.checked) memberIds.push(cb.value); });
  if (memberIds.length===0) { toast('Select at least one member','error'); return; }

  const col = { id:'col-'+Date.now(), date, amountPerPerson: amount, memberIds, note };
  state.collections.unshift(col);
  saveToLocalStorage(); renderAll();
  fbSet('collections', col.id, col);
  closeCollectModal();
  toast(`PKR ${num(amount)} collected from ${memberIds.length} members!`, 'success');
}

/* ── ADD MEMBER MODAL ─────────────────────────────────── */
function openAddMemberModal(defaultGroup) {
  document.getElementById('new-member-name').value = '';
  document.getElementById('assign-error').classList.add('hidden');
  // Set defaults
  assignSehri = defaultGroup === 'sehri' || defaultGroup === 'both';
  assignAftari = defaultGroup === 'aftari' || defaultGroup === 'both';
  if (!defaultGroup) { assignSehri = true; assignAftari = false; }
  updateGroupAssignUI();
  document.getElementById('add-member-modal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('new-member-name').focus(), 150);
}
function closeAddMemberModal() { document.getElementById('add-member-modal').classList.add('hidden'); }

function toggleGroupAssign(group) {
  if (group==='sehri') assignSehri = !assignSehri;
  else assignAftari = !assignAftari;
  updateGroupAssignUI();
}
function updateGroupAssignUI() {
  document.getElementById('assign-sehri')?.classList.toggle('selected', assignSehri);
  document.getElementById('assign-aftari')?.classList.toggle('selected', assignAftari);
}

function submitAddMember() {
  const name = document.getElementById('new-member-name').value.trim();
  if (!name) { toast('Please enter a name','error'); return; }
  if (!assignSehri && !assignAftari) {
    document.getElementById('assign-error').classList.remove('hidden'); return;
  }
  if (state.members.some(m=>m.name.toLowerCase()===name.toLowerCase())) {
    toast('Member already exists','error'); return;
  }
  const member = { id:'mbr-'+Date.now(), name, inSehri: assignSehri, inAftari: assignAftari };
  state.members.push(member);
  saveToLocalStorage(); renderAll();
  fbSet('members', member.id, member);
  closeAddMemberModal();
  const groups = [assignSehri&&'Sehri', assignAftari&&'Aftari'].filter(Boolean).join(' & ');
  toast(`${name} added to ${groups} group!`, 'success');
}

function removeMember(id) {
  const m = state.members.find(m=>m.id===id);
  if (!confirm(`Remove ${m?.name||'member'}? Their expense shares remain in history.`)) return;
  state.members = state.members.filter(m=>m.id!==id);
  saveToLocalStorage(); renderAll();
  fbDelete('members', id);
  toast('Member removed','info');
}

/* ── ACCESS GATE ──────────────────────────────────────── */
function showAccessGate() {
  document.getElementById('access-gate')?.classList.remove('hidden');
}

function hideAccessGate() {
  document.getElementById('access-gate')?.classList.add('hidden');
}

function enterAsGuest() {
  accessLevel = ACCESS.GUEST;
  hideAccessGate();
  applyAccessLevel();
  toast('Viewing as Guest — dashboard summary only', 'info');
}

function openAccessPin(mode) {
  pendingPinMode = mode;
  pendingAction = null;
  pinBuffer = '';
  updatePinDots();
  document.getElementById('pin-error')?.classList.add('hidden');
  const icon  = document.getElementById('pin-overlay-icon');
  const title = document.getElementById('pin-overlay-title');
  const sub   = document.getElementById('pin-overlay-sub');
  if (mode === 'team') {
    if (icon)  icon.textContent  = '👥';
    if (title) title.textContent = 'Team Access';
    if (sub)   sub.textContent   = 'Enter the Team PIN';
  } else {
    if (icon)  icon.textContent  = '🔐';
    if (title) title.textContent = 'Admin Access';
    if (sub)   sub.textContent   = 'Enter the Admin PIN';
  }
  document.getElementById('pin-overlay')?.classList.remove('hidden');
}

/* ── REQUIRE GUARDS ───────────────────────────────────── */
function requireAdmin(action) {
  if (accessLevel >= ACCESS.ADMIN) { action(); return; }
  pendingAction = action;
  openAccessPin('admin');
}

function requireTeam(action) {
  if (accessLevel >= ACCESS.TEAM) { action(); return; }
  pendingAction = action;
  openAccessPin('team');
}

// alias so old code still works
function requireManager(action) { requireAdmin(action); }
function toggleManagerMode() {
  if (accessLevel >= ACCESS.ADMIN) {
    accessLevel = ACCESS.TEAM;
    applyAccessLevel();
    toast('Dropped to Team view', 'info');
  } else {
    openAccessPin('admin');
  }
}

/* ── PIN SYSTEM ──────────────────────────────────────────── */
function pinInput(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) checkPin();
}
function pinClear() {
  pinBuffer = pinBuffer.slice(0,-1);
  updatePinDots();
}
function updatePinDots() {
  document.querySelectorAll('#pin-dots span').forEach((d,i) => d.classList.toggle('filled', i < pinBuffer.length));
}

function checkPin() {
  const mode = pendingPinMode;
  const adminPin = localStorage.getItem(ADMIN_PIN_KEY) || '1234';
  const teamPin  = localStorage.getItem(TEAM_PIN_KEY)  || '0000';

  let granted = false;

  if (mode === 'admin' && pinBuffer === adminPin) {
    accessLevel = ACCESS.ADMIN; granted = true;
  } else if (mode === 'team' && pinBuffer === teamPin) {
    accessLevel = ACCESS.TEAM; granted = true;
  } else if (mode === 'admin' && pinBuffer === teamPin) {
    // Entered team PIN on admin screen — grant team
    accessLevel = ACCESS.TEAM; granted = true;
  }

  if (granted) {
    closePinOverlay();
    hideAccessGate();
    applyAccessLevel();
    const labels = { [ACCESS.TEAM]: 'Team view unlocked 👥', [ACCESS.ADMIN]: 'Admin mode active 🔐' };
    toast(labels[accessLevel] || 'Access granted', 'success');
    if (pendingAction) { pendingAction(); pendingAction = null; }
  } else {
    document.getElementById('pin-error')?.classList.remove('hidden');
    pinBuffer = ''; updatePinDots();
    const card = document.querySelector('.pin-card');
    if (card) { card.style.animation='none'; card.offsetHeight; card.style.animation='shake 0.4s ease'; }
  }
}

function closePinOverlay() {
  document.getElementById('pin-overlay')?.classList.add('hidden');
  pinBuffer = ''; updatePinDots();
}

/* ── APPLY ACCESS LEVEL ─────────────────────────────────── */
function applyAccessLevel() {
  const body = document.body;
  body.classList.toggle('guest-mode', accessLevel === ACCESS.GUEST);

  // If currently on a hidden tab, switch to dashboard
  if (accessLevel === ACCESS.GUEST) {
    switchTab('dashboard', document.getElementById('nav-dashboard'));
  }
  renderAll();
  updateManagerUI();
}

function updateManagerUI() {
  const icon    = document.getElementById('manager-icon');
  const label   = document.getElementById('manager-label');
  const badge   = document.getElementById('manager-badge');
  const statusEl = document.getElementById('manager-status-text');
  const toggleSetting = document.getElementById('manager-toggle-setting');
  const actions = document.getElementById('quick-actions');

  if (icon)   icon.textContent = isManagerMode ? '🔓' : '🔒';
  if (label)  label.textContent = isManagerMode ? 'Manager' : 'View';
  if (badge)  badge.classList.toggle('active', isManagerMode);
  if (statusEl) statusEl.textContent = isManagerMode ? '✅ Active — you can edit data' : 'Not active';
  if (toggleSetting) { toggleSetting.textContent = isManagerMode ? 'ON' : 'OFF'; toggleSetting.classList.toggle('on', isManagerMode); }
  if (actions) actions.classList.toggle('hidden', !isManagerMode);
}

/* ── PIN SETTINGS ─────────────────────────────────────── */
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
  if (p1.length<4||p1!==p2) { document.getElementById('set-pin-error').classList.remove('hidden'); return; }
  localStorage.setItem(PIN_KEY, p1);
  closeSetPinModal();
  toast('PIN updated successfully!','success');
}

/* ── FIREBASE SETTINGS ────────────────────────────────── */
function saveFirebaseConfig() {
  const raw = document.getElementById('firebase-config-input').value.trim();
  try {
    const config = JSON.parse(raw);
    if (!config.apiKey) throw new Error('Missing apiKey');
    initFirebase(config);
    toast('Firebase config updated!','success');
  } catch(e) {
    toast('Invalid config JSON: ' + e.message, 'error');
  }
}

/* ── EXPORT ───────────────────────────────────────────── */
function exportData() {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sehri-aftari-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported!','success');
}

async function clearAllData() {
  if (!confirm('⚠️ Delete ALL data permanently?')) return;
  if (!confirm('Final warning — this cannot be undone!')) return;
  if (db) {
    for (const col of ['members','expenses','collections']) {
      const snap = await db.collection(col).get();
      await Promise.all(snap.docs.map(d=>db.collection(col).doc(d.id).delete()));
    }
  }
  state = { members:[], expenses:[], collections:[] };
  saveToLocalStorage(); renderAll();
  toast('All data cleared','info');
}

/* ── TAB NAV ──────────────────────────────────────────── */
function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tabName)?.classList.add('active');
  if (btn) btn.classList.add('active');
}

/* ── HELPERS ──────────────────────────────────────────── */
function getMemberName(id) { return state.members.find(m=>m.id===id)?.name||'Unknown'; }
function num(n) { return Math.round(Number(n)).toLocaleString('en-PK'); }
function formatPKR(n) { return 'PKR '+num(n); }
function formatDate(ds) {
  if (!ds) return '';
  return new Date(ds+'T00:00:00').toLocaleDateString('en-PK',{day:'numeric',month:'short',year:'numeric'});
}
function mealLabel(type) {
  if (type==='sehri') return '🌅 Sehri';
  if (type==='aftari') return '🌙 Aftari';
  return '📦 Other';
}
function capFirst(s) { return s.charAt(0).toUpperCase()+s.slice(1); }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setEl(id, val) { const e=document.getElementById(id); if(e) e.textContent=val; }
