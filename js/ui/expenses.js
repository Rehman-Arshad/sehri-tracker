/* ── EXPENSES UI MODULE (ITEMIZED) ──────────────────── */

let activeExpenseCategory = 'sehri';
let expenseLineItems = [];
let lineItemIds = 0;

function setExpenseCategory(type) {
  activeExpenseCategory = type;
  document.querySelectorAll('.split-type-row .type-pill').forEach(b => b.classList.remove('selected'));
  document.getElementById('exp-cat-' + type).classList.add('selected');

  // Auto-select checkboxes based on category
  const groupMembers = type === 'sehri' ? getSehriMembers()
                     : type === 'aftari' ? getAftariMembers()
                     : state.members;

  state.members.forEach(m => {
    const label = document.getElementById(`exp-chk-${m.id}`);
    const cb = label?.querySelector('input[type=checkbox]');
    if (!label || !cb) return;
    const shouldCheck = groupMembers.some(gm => gm.id === m.id);
    label.classList.toggle('checked', shouldCheck);
    cb.checked = shouldCheck;
  });
}

function openExpenseModal() {
  document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('exp-desc').value = '';
  
  expenseLineItems = [];
  document.getElementById('exp-items-container').innerHTML = '';
  addExpenseLineItem(); // Start with 1 empty row

  // Render members checkboxes
  const el = document.getElementById('exp-member-checkboxes');
  el.innerHTML = state.members.map(m=>`
    <label class="check-item" id="exp-chk-${m.id}">
      <input type="checkbox" value="${m.id}" onchange="handleCheckboxChange(this)" />
      <span class="check-box"></span>
      <span class="check-name">${escHtml(m.name)}</span>
    </label>`).join('');

  setExpenseCategory('sehri'); // Will also auto-check sehri members
  calculateExpenseTotal();
  document.getElementById('expense-modal').classList.remove('hidden');
}

function closeExpenseModal() {
  document.getElementById('expense-modal').classList.add('hidden');
}

function addExpenseLineItem() {
  lineItemIds++;
  const id = 'line-' + lineItemIds;
  expenseLineItems.push(id);
  
  const div = document.createElement('div');
  div.id = id;
  div.style = "display:flex; gap:8px; align-items:center;";
  div.innerHTML = `
    <input type="text" class="text-input line-name" placeholder="Item (e.g. Milk)" style="flex:1; margin:0; padding:10px 14px;" />
    <input type="number" class="text-input line-amount" placeholder="Rs" oninput="calculateExpenseTotal()" style="width:90px; margin:0; padding:10px 14px;" />
    <button onclick="removeExpenseLineItem('${id}')" style="background:var(--card); border:1px solid var(--border); color:var(--red); width:40px; height:40px; border-radius:10px; cursor:pointer;">✕</button>
  `;
  document.getElementById('exp-items-container').appendChild(div);
}

function removeExpenseLineItem(id) {
  if (expenseLineItems.length <= 1) return; // Keep at least one
  document.getElementById(id).remove();
  expenseLineItems = expenseLineItems.filter(i => i !== id);
  calculateExpenseTotal();
}

function calculateExpenseTotal() {
  let total = 0;
  expenseLineItems.forEach(id => {
    const row = document.getElementById(id);
    if (!row) return;
    const amount = parseFloat(row.querySelector('.line-amount').value) || 0;
    total += amount;
  });
  document.getElementById('exp-grand-total').textContent = formatPKR(total);
  return total;
}

function submitExpense() {
  const date = document.getElementById('exp-date').value;
  const desc = document.getElementById('exp-desc').value.trim();
  if (!date) { toast('Please select a date','error'); return; }

  const totalAmount = calculateExpenseTotal();
  if (totalAmount <= 0) { toast('Total amount must be greater than 0','error'); return; }

  // Extract items
  const items = [];
  let invalidItem = false;
  expenseLineItems.forEach(id => {
    const row = document.getElementById(id);
    const name = row.querySelector('.line-name').value.trim() || 'Item';
    const amount = parseFloat(row.querySelector('.line-amount').value) || 0;
    if (amount > 0) items.push({ name, amount });
  });

  const splitAmong = [];
  document.querySelectorAll('#exp-member-checkboxes input[type=checkbox]').forEach(cb => {
    if (cb.checked) splitAmong.push(cb.value);
  });

  if (splitAmong.length === 0) { toast('Select at least one member to split with','error'); return; }

  const exp = {
    id: 'exp-' + Date.now(),
    date,
    desc,
    category: activeExpenseCategory,
    items,
    totalAmount,
    splitAmong
  };

  state.expenses.unshift(exp);
  saveToLocalStorage(); 
  if (typeof renderAll === 'function') renderAll();
  fbSet('expenses', exp.id, exp);
  closeExpenseModal();
  toast('Expense saved successfully!', 'success');
}

/* ── HISTORY RENDERING OVERRIDE ───────────────────────── */
function renderEntryCard(entry, showDelete) {
  const isCollection = entry._type === 'collection';
  const isExp = !isCollection;

  const dateStr = formatDate(entry.date);
  const titleStr = escHtml(entry.desc || entry.note || (isCollection ? 'Money Collected' : 'Expense'));
  
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

  let totalNum = 0;
  let colorClass = '';
  let sign = '';

  if (isCollection) {
    totalNum = Number(entry.amountPerPerson) * entry.memberIds.length;
    colorClass = 'collection';
    sign = '+';
  } else {
    const isNew = !!entry.items;
    totalNum = isNew ? entry.totalAmount : entry.splits.reduce((s,sp)=>s+Number(sp.amount),0);
    colorClass = 'expense';
    sign = '−';
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


// These are still in app.js - wait, I'll export them over there too.
function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  state.expenses = state.expenses.filter(e=>e.id!==id);
  saveToLocalStorage(); 
  if(typeof renderAll==='function') renderAll();
  fbDelete('expenses', id);
  toast('Expense deleted','info');
}
function deleteCollection(id) {
  if (!confirm('Delete this collection?')) return;
  state.collections = state.collections.filter(c=>c.id!==id);
  saveToLocalStorage(); 
  if(typeof renderAll==='function') renderAll();
  fbDelete('collections', id);
  toast('Collection deleted','info');
}

