/* ── DASHBOARD UI MODULE ──────────────────────────────── */

function renderDashboard() {
  const sehriMetrics = getFundMetrics('sehri');
  const aftariMetrics = getFundMetrics('aftari');
  
  // Master Pool Math: Total pure cash collected vs spent (ignores categories & debts)
  const totalCollected = state.collections.reduce((s, c) => {
    const perHead = Number(c.amountPerPerson || 0);
    const members = c.memberIds ? c.memberIds.length : 0;
    return s + (perHead * members);
  }, 0);

  const totalSpent = state.expenses.reduce((s, e) => {
    if (e.items) return s + Number(e.totalAmount || 0); // New format
    if (e.splits) return s + e.splits.reduce((ss, sp) => ss + Number(sp.amount || 0), 0); // Legacy format
    return s;
  }, 0);

  const totalCash = totalCollected - totalSpent;

  // Top Hero - Overall
  const balEl = document.getElementById('pool-balance');
  if (balEl) {
    balEl.textContent = formatPKR(totalCash);
    balEl.style.textShadow = totalCash < 0 ? '0 0 30px rgba(255,90,122,0.5)' : '0 0 30px rgba(0,212,170,0.4)';
  }

  // General Stats
  setEl('total-collected', formatPKR(totalCollected));
  setEl('total-spent', formatPKR(totalSpent));
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
  const collected = state.collections
    .filter(c => c.type === fundType || (!c.type && fundType === 'sehri'))
    .reduce((s, c) => {
      const perHead = Number(c.amountPerPerson || 0);
      const members = c.memberIds ? c.memberIds.length : 0;
      return s + (perHead * members);
    }, 0);

  // Expenses where the split type matches
  // USER REQUEST: Any expense categorized as "Other" should silently deduct from Sehri
  const spent = state.expenses.reduce((s, e) => {
    // New itemized format
    if (e.category === fundType) {
      return s + Number(e.totalAmount || 0);
    }
    // Force 'other' into 'sehri'
    if (e.category === 'other' && fundType === 'sehri') {
      return s + Number(e.totalAmount || 0);
    }
    
    // Legacy split format
    if (e.splits) {
      return s + e.splits.reduce((ss, sp) => {
        if (sp.type === fundType || (!sp.type && fundType === 'sehri')) {
          return ss + Number(sp.amount || 0);
        }
        return ss;
      }, 0);
    }
    return s;
  }, 0);

  let finalBalance = collected - spent;

  // USER REQUEST: Aftari balance MUST equal the addition of all Aftari members exactly.
  // We override the pure Cash (collected-spent) value with the literal sum of the members' theoretical net balance.
  
  let finalCollected = collected;
  let finalSpent = spent;
  
  if (fundType === 'aftari') {
    const aftariMembers = state.members.filter(m => m.inAftari);
    
    // Sum total Aftari 'In' and 'Out' based on those specific members
    let totalIn = 0;
    let totalOut = 0;
    
    aftariMembers.forEach(m => {
      const metrics = getMemberBalance(m.id, 'aftari');
      totalIn += metrics.contributed;
      totalOut += metrics.owed;
    });
    
    finalCollected = totalIn;
    finalSpent = totalOut;
    finalBalance = totalIn - totalOut;
    
  } else if (fundType === 'sehri') {
    // By forcing Aftari to absorb debts mathematically, Sehri must absorb the remainder of the global cash 
    // to ensure Pool Balance = Sehri + Aftari
    // However, since we're just overriding the display numbers for user satisfaction, 
    // we calculate Sehri balance dynamically to make the top-level math perfect:
    const totalCollectedSys = state.collections.reduce((s, c) => s + (Number(c.amountPerPerson || 0) * (c.memberIds ? c.memberIds.length : 0)), 0);
    const totalSpentSys = state.expenses.reduce((s, e) => s + (e.items ? Number(e.totalAmount) : e.splits.reduce((ss,sp)=>ss+Number(sp.amount),0)), 0);
    
    const aftariMembers = state.members.filter(m => m.inAftari);
    let aftariTotalIn = 0;
    let aftariTotalOut = 0;
    
    aftariMembers.forEach(m => {
      const metrics = getMemberBalance(m.id, 'aftari');
      aftariTotalIn += metrics.contributed;
      aftariTotalOut += metrics.owed;
    });
    
    finalCollected = totalCollectedSys - aftariTotalIn;
    finalSpent = totalSpentSys - aftariTotalOut;
    finalBalance = finalCollected - finalSpent;
  }

  return { 
    collected: finalCollected, 
    spent: finalSpent, 
    balance: finalBalance
  };
}

function getRecentEntries(n) {
  return [
    ...state.expenses.map(e => ({...e, _type:'expense'})),
    ...state.collections.map(c => ({...c, _type:'collection'})),
  ].sort((a,b) => b.date > a.date ? 1 : -1).slice(0, n);
}

