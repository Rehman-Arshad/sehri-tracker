// ─────────────────────────────────────────────────────────
//  Sehri & Aftari Expense Tracker — app.js v2
//  Features: Separate Sehri/Aftari groups, toasts, Firebase
// ─────────────────────────────────────────────────────────

let pendingAction = null;
let pendingPinMode = null;  // 'team' | 'admin' | 'elevate'
let pinBuffer = '';
let splitRowCount = 0;
let currentHistoryFilter = 'all';
let assignSehri = true;
let assignAftari = false;

/* ── BOOT ───────────────────────────────────────────────── */
// Schedule the timeout IMMEDIATELY — before anything else can throw
let _loadingHidden = false;
function hideLoadingScreen() {
  if (_loadingHidden) return;
  _loadingHidden = true;
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('done');
  const ag = document.getElementById('access-gate');
  if (ag) ag.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  // Timeout FIRST — screen always hides after 2s no matter what
  setTimeout(hideLoadingScreen, 2000);

  // Global Keyboard Support for PIN Entry
  document.addEventListener('keydown', (e) => {
    const pinOverlay = document.getElementById('pin-overlay');
    if (!pinOverlay || pinOverlay.classList.contains('hidden')) return;
    
    if (e.key >= '0' && e.key <= '9') {
      pinInput(e.key);
    } else if (e.key === 'Backspace') {
      pinClear();
    } else if (e.key === 'Escape') {
      closePinOverlay();
    }
  });

  // Render with local data (won't block Firebase if it throws)
  try {
    loadFromLocalStorage();
    renderAll();
    setTodayDefault();
  } catch(e) {
    console.error('Render error:', e);
  }

  // Firebase in its OWN try/catch — always runs, even if render failed
  try {
    const config = getFirebaseConfig();
    initFirebase(config);
  } catch(e) {
    console.error('Firebase error:', e);
    setFbStatus('❌ Init failed: ' + e.message, 'err');
    hideLoadingScreen();
  }
});


function setTodayDefault() {
  const today = new Date().toISOString().split('T')[0];
  ['exp-date','collect-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

/* ── TOAST SYSTEM ─────────────────────────────────────── */
function toast(msg, type = 'info', duration = 3000) {
  const icons = { 
    success: '<i class="ph-fill ph-check-circle" style="color:var(--green)"></i>', 
    error: '<i class="ph-fill ph-warning-circle" style="color:var(--red)"></i>', 
    info: '<i class="ph-fill ph-info" style="color:var(--primary)"></i>', 
    warning: '<i class="ph-fill ph-warning" style="color:var(--yellow)"></i>' 
  };
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

/* ── EXTERNAL RENDERERS (Loaded globally from js/ui/*) ──
 * process dashboard, members, collections, and expenses
 * using the state managed by store.js
 */

function renderAll() {
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderSehriMembers === 'function') renderSehriMembers();
  if (typeof renderAftariMembers === 'function') renderAftariMembers();
  if (typeof renderHistory === 'function') renderHistory();
  if (typeof renderContributions === 'function') renderContributions();
  if (typeof updateManagerUI === 'function') updateManagerUI();
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
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="ph ph-chart-bar"></i></div><div class="empty-text">No expenses found</div></div>`;
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
  const isCollection = entry._type === 'collection';
  const isExp = !isCollection;

  // Header blocks
  const dateStr = formatDate(entry.date);
  const titleStr = escHtml(entry.desc || entry.note || (isCollection ? 'Money Collected' : 'Expense'));
  
  // Tag processing
  let typeLabel = '';
  let typeClass = '';
  if (isCollection) {
    typeLabel = entry.type === 'aftari' ? '<i class="ph-fill ph-moon"></i> Aftari' : '<i class="ph-fill ph-sun-horizon"></i> Sehri';
    typeClass = entry.type === 'aftari' ? 'tag-aftari' : 'tag-sehri';
  } else {
    const isNew = !!entry.items;
    const isAftari = isNew ? entry.category === 'aftari' : (entry.splits && entry.splits.some(s=>s.type==='aftari'));
    typeLabel = isAftari ? '<i class="ph-fill ph-moon"></i> Aftari' : '<i class="ph-fill ph-sun-horizon"></i> Sehri';
    typeClass = isAftari ? 'tag-aftari' : 'tag-sehri';
  }

  // Value processing
  let totalNum = 0;
  let subText = '';
  let colorClass = '';
  let sign = '';

  if (isCollection) {
    totalNum = Number(entry.amountPerPerson) * entry.memberIds.length;
    subText = `PKR ${num(entry.amountPerPerson)}/person × ${entry.memberIds.length} members`;
    colorClass = 'collection';
    sign = '+';
  } else {
    const isNew = !!entry.items;
    totalNum = isNew ? entry.totalAmount : entry.splits.reduce((s,sp)=>s+Number(sp.amount),0);
    subText = isNew ? entry.items.map(i => `${i.name} (${i.amount})`).join(', ') : 'Legacy split format';
    colorClass = 'expense';
    sign = '−';
  }

  // Detailed Splits / Members breakdown
  let detailsHTML = '';
  if (isCollection) {
    const names = entry.memberIds.map(id=>getMemberName(id)).join(', ');
    detailsHTML = `<div class="entry-split-row">
      <span style="color:var(--text2); font-size:12px;">${names}</span>
    </div>`;
  } else {
    // Expense Splits mapping
    if (entry.splits) {
      detailsHTML = entry.splits.map(sp => {
        const memberNames = sp.memberIds.map(id=>getMemberName(id)).join(', ');
        const perHead = (Number(sp.amount)/sp.memberIds.length).toFixed(0);
        return `<div class="entry-split-row">
          <span><span class="entry-tag tag-${sp.type}">${mealLabel(sp.type)}</span>${memberNames}</span>
          <span>${formatPKR(sp.amount)} <span style="color:var(--text3)">(${formatPKR(perHead)}/ea)</span></span>
        </div>`;
      }).join('');
    } else {
      // New itemized Expense layout
      const memberNames = entry.splitAmong.map(id=>getMemberName(id)).join(', ');
      const perHead = (totalNum / entry.splitAmong.length).toFixed(0);
      detailsHTML = `<div class="entry-split-row">
        <span style="color:var(--text2); font-size:12px;">${memberNames}</span>
        <span style="color:var(--text3); font-size:11px;">(${formatPKR(perHead)}/ea)</span>
      </div>`;
    }
  }

  return `<div class="entry-card" style="cursor:pointer;" onclick="openEntryDetailsModal('${entry.id}', '${entry._type}')">
    <div class="entry-header" style="margin-bottom:0px;">
      <div style="flex:1; min-width:0; padding-right:12px;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap;">
          <span class="entry-tag ${typeClass}">${typeLabel}</span>
          ${isCollection ? `<span class="entry-tag tag-collection"><i class="ph ph-wallet"></i> Collection</span>` : ''}
        </div>
        <div class="entry-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${titleStr}</div>
        <div class="entry-date">${dateStr}</div>
      </div>
      <div style="text-align:right; flex-shrink:0;">
        <div class="entry-amount ${colorClass}">${sign}${formatPKR(totalNum)}</div>
      </div>
    </div>
  </div>`;
}

/* ── ENTRY DETAILS MODAL ──────────────────────────────── */
window.openEntryDetailsModal = function(id, type) {
  const isCollection = type === 'collection';
  const entry = isCollection ? state.collections.find(c=>c.id===id) : state.expenses.find(e=>e.id===id);
  if (!entry) return;

  const dateStr = formatDate(entry.date);
  const titleStr = escHtml(entry.desc || entry.note || (isCollection ? 'Money Collected' : 'Expense'));

  let typeLabel = '';
  let typeClass = '';
  if (isCollection) {
    typeLabel = entry.type === 'aftari' ? '<i class="ph-fill ph-moon"></i> Aftari Collection' : '<i class="ph-fill ph-sun-horizon"></i> Sehri Collection';
    typeClass = entry.type === 'aftari' ? 'tag-aftari' : 'tag-sehri';
  } else {
    const isNew = !!entry.items;
    const isAftari = isNew ? entry.category === 'aftari' : (entry.splits && entry.splits.some(s=>s.type==='aftari'));
    typeLabel = isAftari ? '<i class="ph-fill ph-moon"></i> Aftari Expense' : '<i class="ph-fill ph-sun-horizon"></i> Sehri Expense';
    typeClass = isAftari ? 'tag-aftari' : 'tag-sehri';
  }

  let totalNum = 0;
  let colorClass = '';
  let subText = '';
  if (isCollection) {
    totalNum = Number(entry.amountPerPerson) * entry.memberIds.length;
    subText = `PKR ${num(entry.amountPerPerson)}/person`;
    colorClass = 'collection';
  } else {
    const isNew = !!entry.items;
    totalNum = isNew ? entry.totalAmount : entry.splits.reduce((s,sp)=>s+Number(sp.amount),0);
    subText = isNew ? entry.items.map(i => `${i.name} (${i.amount})`).join(', ') : 'Generated using legacy split code';
    colorClass = 'expense';
  }

  let detailsHTML = '';
  if (isCollection) {
    const names = entry.memberIds.map(id=>getMemberName(id)).join('<br>');
    detailsHTML = `
      <div style="font-weight:600; font-size:13px; color:var(--text); margin-bottom:8px;">Collected from ${entry.memberIds.length} members:</div>
      <div style="color:var(--text2); font-size:13px; line-height:1.6; background:var(--bg2); padding:12px; border-radius:8px;">${names}</div>
    `;
  } else {
    if (entry.splits) {
      detailsHTML = `
        <div style="font-weight:600; font-size:13px; color:var(--text); margin-bottom:8px;">Legacy Expense Breakdown:</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${entry.splits.map(sp => {
            const memberNames = sp.memberIds.map(id=>getMemberName(id)).join(', ');
            const perHead = (Number(sp.amount)/sp.memberIds.length).toFixed(0);
            return `<div style="background:var(--bg2); padding:12px; border-radius:8px; font-size:13px; color:var(--text2);">
              <div style="margin-bottom:6px;"><span class="entry-tag tag-${sp.type}">${mealLabel(sp.type)}</span></div>
              <div style="margin-bottom:4px;">${memberNames}</div>
              <div style="color:var(--text); font-weight:600;">${formatPKR(sp.amount)} <span style="font-weight:400; color:var(--text3); font-size:12px;">(${formatPKR(perHead)}/ea)</span></div>
            </div>`;
          }).join('')}
        </div>`;
    } else {
      const memberNames = entry.splitAmong.map(id=>getMemberName(id)).join('<br>');
      const perHead = (totalNum / entry.splitAmong.length).toFixed(0);
      detailsHTML = `
        <div style="font-weight:600; font-size:13px; color:var(--text); margin-bottom:8px;">Items Logged:</div>
        <div style="color:var(--text2); font-size:13px; margin-bottom:16px; background:var(--bg2); padding:12px; border-radius:8px;">
          ${entry.items.map(i => `<div>${i.name} — <span style="color:var(--text)">${formatPKR(i.amount)}</span></div>`).join('')}
        </div>
        <div style="font-weight:600; font-size:13px; color:var(--text); margin-bottom:8px;">Split Evenly Among (${entry.splitAmong.length} members):</div>
        <div style="color:var(--text2); font-size:13px; line-height:1.6; background:var(--bg2); padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:flex-end;">
          <div>${memberNames}</div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:var(--text3); margin-bottom:2px;">Each pays</div>
            <div style="font-size:15px; font-weight:700; color:var(--text);">${formatPKR(perHead)}</div>
          </div>
        </div>
      `;
    }
  }

  const sign = isCollection ? '+' : '−';
  const deleteAction = isCollection ? `deleteCollection('${entry.id}')` : `deleteExpense('${entry.id}')`;
  const deleteBtn = accessLevel >= ACCESS.ADMIN 
    ? `<button class="entry-delete" style="width:100%; justify-content:center; gap:8px; display:flex; align-items:center; padding:12px; margin-top:20px; border:1px solid rgba(255,90,122,0.2);" onclick="${deleteAction}; closeEntryDetailsModal();"><i class="ph ph-trash"></i> Delete Entry</button>` 
    : '';

  const html = `
    <div style="text-align:center; margin-bottom:20px;">
      <div style="display:inline-flex; align-items:center; gap:6px; margin-bottom:12px;">
        <span class="entry-tag ${typeClass}" style="font-size:12px; padding:4px 10px;">${typeLabel}</span>
      </div>
      <h2 style="font-size:22px; margin-bottom:4px; font-weight:800; color:var(--text);">${titleStr}</h2>
      <div style="font-size:13px; color:var(--text3);">${dateStr}</div>
      <div class="entry-amount ${colorClass}" style="font-size:32px; margin-top:16px;">${sign}${formatPKR(totalNum)}</div>
      <div style="font-size:12px; color:var(--text3); margin-top:4px;">${subText}</div>
    </div>
    
    ${detailsHTML}
    ${deleteBtn}
  `;

  document.getElementById('entry-details-body').innerHTML = html;
  document.getElementById('entry-details-modal').classList.remove('hidden');
};

window.closeEntryDetailsModal = function() {
  document.getElementById('entry-details-modal').classList.add('hidden');
};

function handleCheckboxChange(cb, rowId) {
  const label = cb.closest('.check-item');
  if (label) {
    label.classList.toggle('checked', cb.checked);
  }
  if (rowId === 'collect' && typeof updateCollectCalc === 'function') updateCollectCalc();
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
    if (icon)  icon.innerHTML  = '<i class="ph ph-users"></i>';
    if (title) title.textContent = 'Team Access';
    if (sub)   sub.textContent   = 'Enter the Team PIN';
  } else {
    if (icon)  icon.innerHTML  = '<i class="ph ph-lock-key"></i>';
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
  const adminPin = state.pins.admin;
  const teamPin  = state.pins.team;

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
    const labels = { [ACCESS.TEAM]: 'Team view unlocked <i class="ph ph-users"></i>', [ACCESS.ADMIN]: 'Admin mode active <i class="ph ph-lock-key"></i>' };
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
  const icon     = document.getElementById('manager-icon');
  const label    = document.getElementById('manager-label');
  const badge    = document.getElementById('manager-badge');
  const statusEl = document.getElementById('manager-status-text');
  const actions  = document.getElementById('quick-actions');

  const isAdmin = accessLevel === ACCESS.ADMIN;
  const isTeam  = accessLevel === ACCESS.TEAM;

  if (icon)  icon.innerHTML = isAdmin ? '<i class="ph ph-lock-key"></i>' : (isTeam ? '<i class="ph ph-users"></i>' : '<i class="ph ph-eye"></i>');
  if (label) label.textContent = isAdmin ? 'Admin' : (isTeam ? 'Team' : 'Guest');
  if (badge) badge.classList.toggle('active', isAdmin);

  if (statusEl) {
    if (isAdmin) statusEl.innerHTML = '<i class="ph ph-lock-key"></i> Admin — Full edit access';
    else if (isTeam) statusEl.innerHTML = '<i class="ph ph-users"></i> Team — View only';
    else statusEl.innerHTML = '<i class="ph ph-eye"></i> Guest — Summary only';
  }

  // Hide quick actions for non-admins
  if (actions) actions.classList.toggle('hidden', !isAdmin);
}

/* ── PIN SETTINGS ─────────────────────────────────────── */
let currentSetPinMode = 'admin'; // 'admin' or 'team'

function openSetAdminPinModal() {
  currentSetPinMode = 'admin';
  document.getElementById('set-pin-title').innerHTML = '<i class="ph ph-lock-key"></i> Change Admin PIN';
  document.getElementById('set-pin-desc').textContent = 'Set a new 4-digit Admin PIN';
  openSetPinModalBase();
}

function openSetTeamPinModal() {
  currentSetPinMode = 'team';
  document.getElementById('set-pin-title').innerHTML = '<i class="ph ph-users"></i> Change Team PIN';
  document.getElementById('set-pin-desc').textContent = 'Set a new 4-digit Team PIN';
  openSetPinModalBase();
}

function openSetPinModalBase() {
  document.getElementById('new-pin-input').value = '';
  document.getElementById('confirm-pin-input').value = '';
  document.getElementById('set-pin-error').classList.add('hidden');
  document.getElementById('set-pin-modal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('new-pin-input').focus(), 150);
}

function closeSetPinModal() { document.getElementById('set-pin-modal').classList.add('hidden'); }

function saveNewPin() {
  const p1 = document.getElementById('new-pin-input').value.trim();
  const p2 = document.getElementById('confirm-pin-input').value.trim();
  if (p1.length < 4 || p1 !== p2) { document.getElementById('set-pin-error').classList.remove('hidden'); return; }
  
  if (currentSetPinMode === 'admin') {
    db.collection('settings').doc('pins').set({ admin: p1 }, { merge: true });
    state.pins.admin = p1;
  } else {
    db.collection('settings').doc('pins').set({ team: p1 }, { merge: true });
    state.pins.team = p1;
  }
  
  closeSetPinModal();

  toast(`${currentSetPinMode === 'admin' ? 'Admin' : 'Team'} PIN updated!`, 'success');
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
function num(n) { return (Number(n)||0).toLocaleString(); }
function formatPKR(n) { return 'PKR ' + num(n); }
function setEl(id, val) { const e=document.getElementById(id); if(e) e.textContent=val; }
function formatDate(ds) {
  if (!ds) return '';
  return new Date(ds+'T00:00:00').toLocaleDateString('en-PK',{day:'numeric',month:'short',year:'numeric'});
}
function mealLabel(type) {
  if (type==='sehri') return '<i class="ph-fill ph-sun-horizon"></i> Sehri';
  if (type==='aftari') return '<i class="ph-fill ph-moon"></i> Aftari';
  return '<i class="ph-fill ph-package"></i> Other';
}
function capFirst(s) { return s.charAt(0).toUpperCase()+s.slice(1); }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

