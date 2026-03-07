/* ── COLLECTIONS UI MODULE ────────────────────────────── */

let currentCollectType = 'sehri';

function selectCollectType(type) {
  currentCollectType = type;
  document.getElementById('collect-type-sehri').classList.toggle('selected', type === 'sehri');
  document.getElementById('collect-type-aftari').classList.toggle('selected', type === 'aftari');
}

function updateCollectCalc() {
  const amountObj = document.getElementById('collect-amount');
  const calcObj = document.getElementById('collect-calc');
  if (!amountObj || !calcObj) return;

  const perHead = parseFloat(amountObj.value) || 0;
  let count = 0;
  document.querySelectorAll('#collect-member-checkboxes input[type=checkbox]')
    .forEach(cb => { if(cb.checked) count++; });
  
  if (count === 0) {
    calcObj.textContent = "Please select at least one member";
    calcObj.style.color = "var(--text3)";
  } else if (perHead > 0) {
    const total = perHead * count;
    calcObj.textContent = `${count} members selected • total collection: ${formatPKR(total)}`;
    calcObj.style.color = "var(--primary-light)";
  } else {
    calcObj.textContent = "Enter per-person amount to see total";
    calcObj.style.color = "var(--text3)";
  }
}

function openCollectModal() {
  const el = document.getElementById('collect-member-checkboxes');
  el.innerHTML = state.members.map(m=>`
    <label class="check-item" id="col-chk-${m.id}">
      <input type="checkbox" value="${m.id}" onchange="handleCheckboxChange(this, 'collect')" />
      <span class="check-box"></span>
      <span class="check-name">${escHtml(m.name)}</span>
    </label>`).join('');
  
  el.querySelectorAll('.check-item').forEach(label => {
    label.classList.remove('checked');
    const cb = label.querySelector('input[type=checkbox]');
    if (cb) cb.checked = false;
  });

  document.getElementById('collect-amount').value = '';
  document.getElementById('collect-note').value = '';
  selectCollectType('sehri');
  
  updateCollectCalc();
  setTodayDefault();
  document.getElementById('collect-modal').classList.remove('hidden');
}

function closeCollectModal() { 
  document.getElementById('collect-modal').classList.add('hidden'); 
}

function submitCollection() {
  const date   = document.getElementById('collect-date').value;
  const perPerson = parseFloat(document.getElementById('collect-amount').value);
  const note   = document.getElementById('collect-note').value.trim();
  if (!date||!perPerson||perPerson<=0) { toast('Fill in date and amount','error'); return; }

  const memberIds = [];
  document.querySelectorAll('#collect-member-checkboxes input[type=checkbox]')
    .forEach(cb=>{ if(cb.checked) memberIds.push(cb.value); });
  if (memberIds.length===0) { toast('Select at least one member','error'); return; }

  const totalAmount = perPerson * memberIds.length;
  const col = { id:'col-'+Date.now(), type: currentCollectType, date, amountPerPerson: perPerson, memberIds, note };
  state.collections.unshift(col);
  saveToLocalStorage(); 
  if (typeof renderAll === 'function') renderAll();
  fbSet('collections', col.id, col);
  closeCollectModal();
  toast(`Collected ${formatPKR(totalAmount)} (${formatPKR(perPerson)}/ea) from ${memberIds.length} members!`, 'success');
}

