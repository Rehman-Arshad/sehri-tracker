/* ── DASHBOARD UI MODULE ──────────────────────────────── */

function renderDashboard() {
  const sehriMetrics = getFundMetrics('sehri');
  const aftariMetrics = getFundMetrics('aftari');
  
  const totalCollected = sehriMetrics.collected + aftariMetrics.collected;
  const totalSpent = sehriMetrics.spent + aftariMetrics.spent;
  const totalBalance = totalCollected - totalSpent;

  // Top Hero - Overall
  const balEl = document.getElementById('pool-balance');
  if (balEl) {
    balEl.textContent = formatPKR(totalBalance);
    balEl.style.textShadow = totalBalance < 0
      ? '0 0 30px rgba(255,90,122,0.5)'
      : '0 0 30px rgba(0,212,170,0.4)';
  }
  setEl('pool-sub', `${formatPKR(totalCollected)} collected − ${formatPKR(totalSpent)} spent`);

  // General Stats
  setEl('total-members', String(state.members.length));
  const uniqueColDates = new Set(state.collections.map(c => c.date)).size;
  setEl('stat-collected-count', uniqueColDates + ' rounds');
  setEl('stat-expense-count', state.expenses.length + ' entries');

  // Separated Fund Cards
  setEl('sehri-total-bal', formatPKR(sehriMetrics.balance));
  setEl('sehri-metrics-sub', `In: ${formatPKR(sehriMetrics.collected)} | Out: ${formatPKR(sehriMetrics.spent)}`);
  
  setEl('aftari-total-bal', formatPKR(aftariMetrics.balance));
  setEl('aftari-metrics-sub', `In: ${formatPKR(aftariMetrics.collected)} | Out: ${formatPKR(aftariMetrics.spent)}`);

  // Recent entries
  const recent = getRecentEntries(5);
  const el = document.getElementById('recent-list');
  if (!el) return;
  if (recent.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i class="ph-fill ph-moon"></i></div>
      <div class="empty-text">No entries yet</div>
      <div class="empty-sub">Add your first expense to get started</div>
    </div>`;
  } else {
    // Falls back to renderEntryCard in app.js/expenses.js for now
    el.innerHTML = recent.map(e => renderEntryCard(e, false)).join('');
  }
}

function getFundMetrics(fundType) {
  // Collections where type matches (or is undefined for legacy migration)
  const collected = state.collections
    .filter(c => c.type === fundType || (!c.type && fundType === 'sehri'))
    .reduce((s, c) => s + (Number(c.amountPerPerson) * c.memberIds.length), 0);

  // Expenses where the split type matches
  const spent = state.expenses.reduce((s, e) => {
    return s + e.splits.reduce((ss, sp) => {
      if (sp.type === fundType || (!sp.type && fundType === 'sehri')) {
        return ss + Number(sp.amount);
      }
      return ss;
    }, 0);
  }, 0);

  return { collected, spent, balance: collected - spent };
}

function getRecentEntries(n) {
  return [
    ...state.expenses.map(e => ({...e, _type:'expense'})),
    ...state.collections.map(c => ({...c, _type:'collection'})),
  ].sort((a,b) => b.date > a.date ? 1 : -1).slice(0, n);
}

