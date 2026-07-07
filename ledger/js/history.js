import { requireAuth, wireLogout } from './auth-guard.js';
import {
  db, collection, getDocs, deleteDoc, doc, documentId, query, orderBy, limit, startAfter,
  getCountFromServer,
} from './firebase.js';

wireLogout('#logoutBtn');

const PAGE_SIZE = 25;
const currency = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let currentPage = 1;
let totalCount = 0;
let totalPages = 1;
let cursors = { 1: null }; // cursors[p] = doc snapshot to startAfter when fetching page p
let lastKnownPage = 1; // highest page we've already resolved a cursor boundary for
let currentRows = []; // invoices currently rendered, for delete lookups
let pendingDeleteId = null;
let searchTerm = '';

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

function invoicesRef() {
  return collection(db, 'invoices');
}

function baseOrder() {
  return [orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc')];
}

async function fetchPage(pageNum) {
  let snap = null;
  for (let p = 1; p <= pageNum; p++) {
    if (p < pageNum && Object.prototype.hasOwnProperty.call(cursors, p + 1)) {
      continue; // already resolved this boundary from a previous visit
    }
    const constraints = [...baseOrder(), limit(PAGE_SIZE)];
    if (cursors[p]) constraints.push(startAfter(cursors[p]));
    snap = await getDocs(query(invoicesRef(), ...constraints));
    if (p < pageNum) {
      cursors[p + 1] = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null;
      lastKnownPage = Math.max(lastKnownPage, p + 1);
    }
  }
  return snap;
}

async function searchInvoices(term) {
  const termLower = term.trim().toLowerCase();
  // Firestore has no substring/"contains" query, so a search action (unlike
  // routine paginated browsing) reads the full collection and filters
  // client-side - this also works for invoices created before any
  // search-specific field existed, since it just checks clientName directly.
  const snap = await getDocs(query(invoicesRef(), orderBy('createdAt', 'desc')));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((inv) => (inv.clientName || '').toLowerCase().includes(termLower));
}

function renderTable(invoices) {
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
                <a class="btn btn-secondary" href="dashboard.html?id=${inv.id}">Editar</a>
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

function getPageButtons(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, cur - 1, cur, cur + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('…');
    result.push(p);
  });
  return result;
}

function renderPagination() {
  const nav = document.getElementById('pagination');
  if (searchTerm || totalPages <= 1) {
    nav.style.display = 'none';
    nav.innerHTML = '';
    return;
  }
  nav.style.display = 'flex';
  const buttons = getPageButtons(currentPage, totalPages);
  nav.innerHTML = `
    <button type="button" data-page="prev" ${currentPage === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
    ${buttons.map((p) => p === '…'
      ? '<span class="ellipsis">…</span>'
      : `<button type="button" data-page="${p}" class="${p === currentPage ? 'active' : ''}">${p}</button>`
    ).join('')}
    <button type="button" data-page="next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Página siguiente">›</button>
  `;
  nav.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.page;
      const target = val === 'prev' ? currentPage - 1 : val === 'next' ? currentPage + 1 : Number(val);
      goToPage(target);
    });
  });
}

function showLoading() {
  document.getElementById('listContainer').innerHTML = `
    <div class="loading-state"><div class="spinner-lg"></div><span>Cargando facturas...</span></div>`;
}

async function goToPage(pageNum) {
  if (pageNum < 1 || pageNum > totalPages) return;
  currentPage = pageNum;
  showLoading();
  try {
    const snap = await fetchPage(pageNum);
    currentRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTable(currentRows);
    renderPagination();
  } catch (err) {
    document.getElementById('listContainer').innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">No se pudieron cargar las facturas</p>
        <p class="empty-state-body">Verifica tu conexión e intenta de nuevo.</p>
      </div>`;
  }
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
    showToast('Factura eliminada.');
    // Deleting shifts page boundaries downstream, so cursors after this
    // point may no longer be valid — rebuild from scratch.
    cursors = { 1: null };
    lastKnownPage = 1;
    await refreshCount();
    if (searchTerm) {
      currentRows = (await searchInvoices(searchTerm)).filter((inv) => inv.id !== id);
      renderTable(currentRows);
    } else {
      const targetPage = Math.min(currentPage, totalPages);
      await goToPage(targetPage);
    }
  } catch (err) {
    showToast('No se pudo eliminar la factura.', true);
  }
});

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => runSearch(e.target.value), 250);
});

async function runSearch(term) {
  searchTerm = term.trim();
  if (!searchTerm) {
    renderPagination();
    await goToPage(currentPage || 1);
    return;
  }
  showLoading();
  try {
    currentRows = await searchInvoices(searchTerm);
    renderTable(currentRows);
    renderPagination();
  } catch (err) {
    document.getElementById('listContainer').innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">No se pudo buscar</p>
        <p class="empty-state-body">Verifica tu conexión e intenta de nuevo.</p>
      </div>`;
  }
}

async function refreshCount() {
  const snap = await getCountFromServer(invoicesRef());
  totalCount = snap.data().count;
  totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

async function load() {
  try {
    await refreshCount();
    await goToPage(1);
  } catch (err) {
    document.getElementById('listContainer').innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">No se pudieron cargar las facturas</p>
        <p class="empty-state-body">Verifica tu conexión e intenta de nuevo.</p>
      </div>`;
  }
}

requireAuth(() => load());
