import { requireAuth, wireLogout } from './auth-guard.js';
import { db, collection, getDocs, deleteDoc, doc, query, orderBy } from './firebase.js';

wireLogout('#logoutBtn');

const currency = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let allInvoices = [];
let pendingDeleteId = null;

function getMaterials(inv) {
  if (inv.materials) return inv.materials;
  if (inv.material) return [{ name: inv.material, cost: 0 }];
  return [];
}

function materialSummary(inv) {
  const materials = getMaterials(inv);
  if (!materials.length) return '—';
  const extra = materials.length - 1;
  return materials[0].name + (extra > 0 ? ` +${extra} más` : '');
}

function pricePerSqft(inv) {
  return inv.pricePerSqft ?? inv.materialPrice ?? 0;
}

function render(invoices) {
  const container = document.getElementById('listContainer');

  if (!invoices.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p class="empty-state-title">No se encontraron facturas</p>
        <p class="empty-state-body">Prueba con otro nombre de cliente o crea una nueva factura.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>Cliente</th><th>Trabajo</th><th>Material</th><th>Ft²</th><th>Precio/ft²</th><th>Fecha</th><th>Total</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${invoices.map((inv) => `
          <tr>
            <td data-label="Cliente">${inv.clientName}</td>
            <td data-label="Trabajo" class="cell-meta">${inv.jobType}</td>
            <td data-label="Material" class="cell-meta">${materialSummary(inv)}</td>
            <td data-label="Ft²" class="cell-meta">${inv.sqft.toLocaleString('en-US')}</td>
            <td data-label="Precio/ft²" class="cell-meta">${currency(pricePerSqft(inv))}</td>
            <td data-label="Fecha" class="cell-meta">${inv.date}</td>
            <td data-label="Total" class="cell-total">${currency(inv.total)}</td>
            <td data-label="">
              <div class="row-actions">
                <a class="btn btn-secondary" href="invoice.html?id=${inv.id}">Ver</a>
                <button type="button" class="btn btn-destructive" data-id="${inv.id}" data-delete>Eliminar</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => openConfirm(btn.dataset.id));
  });
}

function openConfirm(id) {
  pendingDeleteId = id;
  document.getElementById('confirmBackdrop').classList.add('show');
}

function closeConfirm() {
  pendingDeleteId = null;
  document.getElementById('confirmBackdrop').classList.remove('show');
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.classList.toggle('toast-error', isError);
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}

document.getElementById('cancelDelete').addEventListener('click', closeConfirm);
document.getElementById('confirmBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'confirmBackdrop') closeConfirm();
});
document.getElementById('confirmDelete').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  closeConfirm();
  try {
    await deleteDoc(doc(db, 'invoices', id));
    allInvoices = allInvoices.filter((inv) => inv.id !== id);
    applyFilter();
    showToast('Factura eliminada.');
  } catch (err) {
    showToast('No se pudo eliminar la factura.', true);
  }
});

document.getElementById('searchInput').addEventListener('input', applyFilter);

function applyFilter() {
  const term = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = term
    ? allInvoices.filter((inv) => inv.clientName.toLowerCase().includes(term))
    : allInvoices;
  render(filtered);
}

async function load() {
  const container = document.getElementById('listContainer');
  try {
    const snap = await getDocs(query(collection(db, 'invoices'), orderBy('date', 'desc')));
    allInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    applyFilter();
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">No se pudieron cargar las facturas</p>
        <p class="empty-state-body">Verifica tu conexión e intenta de nuevo.</p>
      </div>`;
  }
}

requireAuth(() => load());
