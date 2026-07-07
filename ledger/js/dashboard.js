import { requireAuth, wireLogout } from './auth-guard.js';
import { MATERIALS, JOB_TYPE_SUGGESTIONS } from './materials.js';
import {
  db, collection, addDoc, getDoc, getDocs, updateDoc, doc, query, orderBy, serverTimestamp,
} from './firebase.js';

wireLogout('#logoutBtn');

const currency = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const editId = new URLSearchParams(window.location.search).get('id');

let materialRowCount = 0;

function createMaterialRow(prefill) {
  const id = materialRowCount++;
  const row = document.createElement('div');
  row.className = 'material-row';
  row.dataset.rowId = id;
  row.innerHTML = `
    <div class="field">
      <label class="field-label" for="materialSelect-${id}">Material <span class="required">*</span></label>
      <select id="materialSelect-${id}" class="material-select" required></select>
      <input type="text" id="materialCustom-${id}" class="material-custom" placeholder="Nombre del material" style="display:none; margin-top: var(--space-2);">
      <p class="field-error" data-err="name">Selecciona o especifica un material.</p>
    </div>
    <div class="field">
      <label class="field-label" for="materialCost-${id}">Costo del material <span class="required">*</span></label>
      <div class="input-prefix-wrapper">
        <span class="input-prefix">$</span>
        <input type="number" id="materialCost-${id}" class="material-cost" placeholder="0.00" min="0.01" step="0.01" inputmode="decimal" required>
      </div>
      <p class="field-error" data-err="cost">Ingresa un costo válido mayor a cero.</p>
    </div>
    <button type="button" class="icon-btn icon-btn-danger remove-material-btn" aria-label="Eliminar material" title="Eliminar material">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  const select = row.querySelector('.material-select');
  MATERIALS.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
    select.appendChild(opt);
  });

  const customInput = row.querySelector('.material-custom');
  const costInput = row.querySelector('.material-cost');

  function applyOtherVisibility() {
    const isOther = select.value === 'Other';
    customInput.style.display = isOther ? '' : 'none';
    customInput.required = isOther;
  }

  select.addEventListener('change', applyOtherVisibility);

  if (prefill) {
    const matchesPreset = MATERIALS.some((m) => m.name === prefill.name);
    select.value = matchesPreset ? prefill.name : 'Other';
    applyOtherVisibility();
    if (!matchesPreset) customInput.value = prefill.name;
    costInput.value = prefill.cost;
  }

  costInput.addEventListener('input', updateTotal);
  row.querySelector('.remove-material-btn').addEventListener('click', () => {
    row.remove();
    updateRemoveButtonsVisibility();
    updateTotal();
  });

  return row;
}

function updateRemoveButtonsVisibility() {
  const rows = document.querySelectorAll('.material-row');
  rows.forEach((row) => {
    row.querySelector('.remove-material-btn').style.visibility = rows.length > 1 ? 'visible' : 'hidden';
  });
}

function addMaterialRow(prefill) {
  document.getElementById('materialsList').appendChild(createMaterialRow(prefill));
  updateRemoveButtonsVisibility();
}

function populateStaticFields() {
  const jobList = document.getElementById('jobTypeList');
  JOB_TYPE_SUGGESTIONS.forEach((j) => {
    const opt = document.createElement('option');
    opt.value = j;
    jobList.appendChild(opt);
  });

  document.getElementById('addMaterialBtn').addEventListener('click', () => addMaterialRow());

  if (!editId) {
    document.getElementById('invoiceDate').value = new Date().toISOString().slice(0, 10);
    addMaterialRow();
  }
}

function getMaterialsCost() {
  let sum = 0;
  document.querySelectorAll('.material-cost').forEach((input) => {
    sum += parseFloat(input.value) || 0;
  });
  return sum;
}

function updateTotal() {
  const price = parseFloat(document.getElementById('pricePerSqft').value) || 0;
  const sqft = parseFloat(document.getElementById('sqft').value) || 0;
  const materialsCost = getMaterialsCost();
  document.getElementById('liveTotal').textContent = currency(price * sqft + materialsCost);
}

function wireLiveCalc() {
  document.getElementById('pricePerSqft').addEventListener('input', updateTotal);
  document.getElementById('sqft').addEventListener('input', updateTotal);
}

function showError(fieldId, show) {
  const err = document.getElementById('err-' + fieldId);
  const input = document.getElementById(fieldId);
  if (err) err.classList.toggle('show', show);
  if (input) input.classList.toggle('invalid', show);
}

function validateMaterialRows() {
  let valid = true;
  document.querySelectorAll('.material-row').forEach((row) => {
    const select = row.querySelector('.material-select');
    const custom = row.querySelector('.material-custom');
    const cost = row.querySelector('.material-cost');
    const errName = row.querySelector('[data-err="name"]');
    const errCost = row.querySelector('[data-err="cost"]');

    const isOther = select.value === 'Other';
    const nameValid = isOther ? !!custom.value.trim() : !!select.value;
    errName.classList.toggle('show', !nameValid);
    select.classList.toggle('invalid', !nameValid);
    custom.classList.toggle('invalid', isOther && !nameValid);

    const costValue = parseFloat(cost.value);
    const costValid = costValue > 0 && isFinite(costValue);
    errCost.classList.toggle('show', !costValid);
    cost.classList.toggle('invalid', !costValid);

    valid = valid && nameValid && costValid;
  });
  return valid;
}

function validateForm() {
  let valid = true;
  const clientName = document.getElementById('clientName').value.trim();
  const invoiceDate = document.getElementById('invoiceDate').value;
  const jobType = document.getElementById('jobType').value.trim();
  const pricePerSqft = parseFloat(document.getElementById('pricePerSqft').value);
  const sqft = parseFloat(document.getElementById('sqft').value);

  showError('clientName', !clientName); valid = valid && !!clientName;
  showError('invoiceDate', !invoiceDate); valid = valid && !!invoiceDate;
  showError('jobType', !jobType); valid = valid && !!jobType;

  const priceValid = pricePerSqft > 0 && isFinite(pricePerSqft);
  showError('pricePerSqft', !priceValid); valid = valid && priceValid;

  const sqftValid = sqft > 0 && isFinite(sqft);
  showError('sqft', !sqftValid); valid = valid && sqftValid;

  valid = validateMaterialRows() && valid;

  return valid;
}

function collectMaterials() {
  const materials = [];
  document.querySelectorAll('.material-row').forEach((row) => {
    const select = row.querySelector('.material-select');
    const custom = row.querySelector('.material-custom');
    const cost = row.querySelector('.material-cost');
    const name = select.value === 'Other' ? custom.value.trim() : select.value;
    materials.push({ name, cost: parseFloat(cost.value) });
  });
  return materials;
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.classList.toggle('toast-error', isError);
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}

function switchToEditMode() {
  document.getElementById('pageTitle').textContent = 'Editar factura';
  document.getElementById('pageSubtitle').textContent = 'Corrige los detalles de esta factura.';
  document.getElementById('formTitle').textContent = 'Editar factura';
  document.getElementById('saveBtn').textContent = 'Guardar cambios';
  document.getElementById('statsSection').style.display = 'none';
  document.getElementById('recentSection').style.display = 'none';
  const cancelLink = document.getElementById('cancelEditLink');
  cancelLink.href = `invoice.html?id=${editId}`;
  cancelLink.style.display = '';
}

async function loadInvoiceForEdit() {
  switchToEditMode();
  try {
    const snap = await getDoc(doc(db, 'invoices', editId));
    if (!snap.exists()) {
      showToast('No se encontró la factura.', true);
      setTimeout(() => { window.location.href = 'history.html'; }, 1200);
      return;
    }
    const invoice = snap.data();

    document.getElementById('clientName').value = invoice.clientName || '';
    document.getElementById('jobType').value = invoice.jobType || '';
    document.getElementById('invoiceDate').value = invoice.date || '';
    document.getElementById('pricePerSqft').value = invoice.pricePerSqft ?? invoice.materialPrice ?? '';
    document.getElementById('sqft').value = invoice.sqft ?? '';

    const materials = invoice.materials || (invoice.material ? [{ name: invoice.material, cost: invoice.materialPrice || 0 }] : []);
    document.getElementById('materialsList').innerHTML = '';
    materials.forEach((m) => addMaterialRow(m));
    if (!materials.length) addMaterialRow();

    updateTotal();
  } catch (err) {
    showToast('No se pudo cargar la factura.', true);
  }
}

function wireForm(uid) {
  const form = document.getElementById('invoiceForm');
  const saveBtn = document.getElementById('saveBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const pricePerSqft = parseFloat(document.getElementById('pricePerSqft').value);
    const sqft = parseFloat(document.getElementById('sqft').value);
    const materials = collectMaterials();
    const materialsCost = materials.reduce((sum, m) => sum + m.cost, 0);

    const clientName = document.getElementById('clientName').value.trim();
    const invoiceFields = {
      clientName,
      clientNameLower: clientName.toLowerCase(),
      jobType: document.getElementById('jobType').value.trim(),
      materials,
      materialsCost,
      sqft,
      pricePerSqft,
      total: pricePerSqft * sqft + materialsCost,
      date: document.getElementById('invoiceDate').value,
    };

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Guardando...';

    try {
      if (editId) {
        await updateDoc(doc(db, 'invoices', editId), { ...invoiceFields, updatedAt: serverTimestamp() });
        window.location.href = `invoice.html?id=${editId}`;
      } else {
        const ref = await addDoc(collection(db, 'invoices'), {
          ...invoiceFields,
          createdAt: serverTimestamp(),
          createdBy: uid,
        });
        window.location.href = `invoice.html?id=${ref.id}`;
      }
    } catch (err) {
      showToast('No se pudo guardar la factura. Intenta de nuevo.', true);
      saveBtn.disabled = false;
      saveBtn.textContent = editId ? 'Guardar cambios' : 'Guardar factura';
    }
  });
}

async function loadStatsAndRecent() {
  const container = document.getElementById('recentContainer');
  try {
    const snap = await getDocs(query(collection(db, 'invoices'), orderBy('date', 'desc')));
    const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    document.getElementById('statCount').textContent = invoices.length;

    const now = new Date();
    const monthTotal = invoices
      .filter((inv) => {
        const d = new Date(inv.date);
        return d.getUTCFullYear() === now.getFullYear() && d.getUTCMonth() === now.getMonth();
      })
      .reduce((sum, inv) => sum + (inv.total || 0), 0);
    document.getElementById('statMonth').textContent = currency(monthTotal);

    document.getElementById('statLast').textContent = invoices.length
      ? invoices[0].clientName
      : '—';

    if (!invoices.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p class="empty-state-title">Aún no hay facturas</p>
          <p class="empty-state-body">Crea tu primera factura arriba para verla aquí.</p>
        </div>`;
      return;
    }

    const recent = invoices.slice(0, 5);
    container.innerHTML = `
      <table class="ledger-table">
        <thead><tr><th>Cliente</th><th>Trabajo</th><th>Fecha</th><th>Total</th></tr></thead>
        <tbody>
          ${recent.map((inv) => `
            <tr onclick="window.location.href='invoice.html?id=${inv.id}'" style="cursor:pointer;">
              <td data-label="Cliente">${inv.clientName}</td>
              <td data-label="Trabajo" class="cell-meta">${inv.jobType}</td>
              <td data-label="Fecha" class="cell-meta">${inv.date}</td>
              <td data-label="Total" class="cell-total">${currency(inv.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">No se pudieron cargar las facturas</p>
        <p class="empty-state-body">Verifica tu conexión e intenta de nuevo.</p>
      </div>`;
  }
}

populateStaticFields();
wireLiveCalc();

requireAuth((user) => {
  wireForm(user.uid);
  if (editId) {
    loadInvoiceForEdit();
  } else {
    loadStatsAndRecent();
  }
});
