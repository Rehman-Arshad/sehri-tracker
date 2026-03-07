/* ── MEMBERS UI MODULE ────────────────────────────────── */

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
    m.inSehri ? `<span class="entry-tag tag-sehri"><i class="ph-fill ph-sun-horizon"></i> Sehri</span>` : '',
    m.inAftari ? `<span class="entry-tag tag-aftari"><i class="ph-fill ph-moon"></i> Aftari</span>` : '',
  ].join('');

  return `
    <div class="member-card" onclick="openMemberDetails('${m.id}')" style="cursor:pointer;">
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
      ${accessLevel >= ACCESS.ADMIN ? `<button class="member-remove" onclick="event.stopPropagation(); removeMember('${m.id}')"><i class="ph ph-trash"></i></button>` : ''}
    </div>`;
}

function getMemberBalance(memberId, context) {
  // context can be 'sehri', 'aftari', or null (overall)
  const contributed = state.collections
    .filter(c => c.memberIds.includes(memberId) && (!context || !c.type || c.type === context))
    .reduce((s,c) => s + Number(c.amountPerPerson), 0);

  const owed = state.expenses.reduce((s, e) => {
    return s + e.splits.reduce((ss, sp) => {
      // If sp.type is undefined (legacy), count it towards Sehri
      const splitType = sp.type || 'sehri';
      if ((!context || splitType === context) && sp.memberIds.includes(memberId)) {
        return ss + Number(sp.amount) / sp.memberIds.length;
      }
      return ss;
    }, 0);
  }, 0);

  return { contributed, owed, balance: contributed - owed };
}

/* ── MEMBER DETAILS MODAL ─────────────────────────────── */
function openMemberDetails(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  
  const sehri = getMemberBalance(m.id, 'sehri');
  const aftari = getMemberBalance(m.id, 'aftari');
  const overall = getMemberBalance(m.id, null);

  const initials = m.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  const avatarClass = m.inSehri && m.inAftari ? 'both-avatar' : m.inSehri ? 'sehri-avatar' : 'aftari-avatar';

  const html = `
    <div style="text-align:center; margin-bottom: 24px;">
      <div class="member-avatar ${avatarClass}" style="width:72px; height:72px; font-size:28px; margin: 0 auto 12px;">${initials}</div>
      <h2 style="font-size:24px; font-weight:800; font-family:'Outfit', sans-serif;">${escHtml(m.name)}</h2>
      <div style="font-size:13px; color:var(--text2); margin-top:4px;">
        ${m.inSehri ? '<i class="ph-fill ph-sun-horizon"></i> Sehri Member' : ''} ${m.inSehri && m.inAftari ? ' • ' : ''} ${m.inAftari ? '<i class="ph-fill ph-moon"></i> Aftari Member' : ''}
      </div>
    </div>

    <!-- Overall Net -->
    <div style="background:var(--bg3); border:1px solid var(--border); border-radius:16px; padding:20px; text-align:center; margin-bottom:20px;">
      <div style="font-size:12px; font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:6px;">Overall Net Balance</div>
      <div style="font-family:'Outfit',sans-serif; font-size:36px; font-weight:900; color:${overall.balance >= 0 ? 'var(--green)' : 'var(--red)'}">
        ${overall.balance > 0 ? '+' : ''}${formatPKR(overall.balance)}
      </div>
      <div style="font-size:13px; color:var(--text2); margin-top:4px;">
        ${overall.balance >= 0 ? 'in credit across all funds' : 'owed across all funds'}
      </div>
    </div>

    <!-- Breakdown Grid -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;">
      <!-- Sehri Break -->
      <div style="background:var(--sehri-bg); border:1px solid var(--sehri-border); border-radius:12px; padding:16px;">
        <div style="font-size:14px; font-weight:800; color:var(--sehri); margin-bottom:12px; display:flex; align-items:center; gap:6px;"><i class="ph-fill ph-sun-horizon"></i> Sehri</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px;">
          <span style="color:var(--text2)">Paid</span>
          <span style="font-weight:700">${formatPKR(sehri.contributed)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05)">
          <span style="color:var(--text2)">Used</span>
          <span style="font-weight:700">${formatPKR(sehri.owed)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:14px;">
          <span style="color:var(--text3); font-weight:700;">Bal:</span>
          <span style="font-weight:800; color:${sehri.balance >= 0 ? 'var(--green)' : 'var(--red)'}">${sehri.balance > 0 ? '+' : ''}${formatPKR(sehri.balance)}</span>
        </div>
      </div>

      <!-- Aftari Break -->
      <div style="background:var(--aftari-bg); border:1px solid var(--aftari-border); border-radius:12px; padding:16px;">
        <div style="font-size:14px; font-weight:800; color:var(--aftari); margin-bottom:12px; display:flex; align-items:center; gap:6px;"><i class="ph-fill ph-moon"></i> Aftari</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px;">
          <span style="color:var(--text2)">Paid</span>
          <span style="font-weight:700">${formatPKR(aftari.contributed)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05)">
          <span style="color:var(--text2)">Used</span>
          <span style="font-weight:700">${formatPKR(aftari.owed)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:14px;">
          <span style="color:var(--text3); font-weight:700;">Bal:</span>
          <span style="font-weight:800; color:${aftari.balance >= 0 ? 'var(--green)' : 'var(--red)'}">${aftari.balance > 0 ? '+' : ''}${formatPKR(aftari.balance)}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('member-details-body').innerHTML = html;
  document.getElementById('member-details-modal').classList.remove('hidden');
}

function closeMemberDetails() {
  document.getElementById('member-details-modal').classList.add('hidden');
}

/* ── ADD MEMBER MODAL ─────────────────────────────────── */
function openAddMemberModal(defaultGroup) {
  document.getElementById('new-member-name').value = '';
  document.getElementById('assign-error').classList.add('hidden');
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
  const m = state.members.find(x=>x.id===id);
  if (!m) return;
  if (!confirm(`Remove ${m.name} permanently?`)) return;
  state.members = state.members.filter(x=>x.id!==id);
  saveToLocalStorage(); renderAll();
  fbDelete('members', id);
  toast(`${m.name} removed`, 'info');
}

