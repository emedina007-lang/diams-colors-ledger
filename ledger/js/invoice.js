import { requireAuth, wireLogout } from './auth-guard.js';
import { db, getDoc, doc } from './firebase.js';

wireLogout('#logoutBtn');

const currency = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('es-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function materialsSection(invoice) {
  if (invoice.materials && invoice.materials.length) {
    const rows = invoice.materials.map((m) => `
      <div class="invoice-line"><span class="label">${m.name}</span><span class="value">${currency(m.cost)}</span></div>
    `).join('');
    return `
      <p class="materials-heading">Materiales</p>
      <div class="invoice-lines">
        ${rows}
        <div class="invoice-line"><span class="label" style="font-weight:600;">Subtotal materiales</span><span class="value" style="font-weight:600;">${currency(invoice.materialsCost || 0)}</span></div>
      </div>`;
  }
  if (invoice.material) {
    return `
      <div class="invoice-lines">
        <div class="invoice-line"><span class="label">Material</span><span class="value">${invoice.material}</span></div>
      </div>`;
  }
  return '';
}

function render(invoice) {
  const container = document.getElementById('invoiceContainer');
  const pricePerSqft = invoice.pricePerSqft ?? invoice.materialPrice ?? 0;
  const laborSubtotal = pricePerSqft * invoice.sqft;

  container.innerHTML = `
    <div class="invoice-sheet">
      <div class="invoice-letterhead">
        <img src="../diams colors logo .webp" alt="DIAM'S COLORS, LLC logo">
        <div>
          <h1>DIAM'S COLORS, LLC</h1>
          <p>Factura / Estimado</p>
        </div>
      </div>

      <div class="invoice-meta">
        <div class="invoice-meta-item">
          <div class="stat-label">Cliente</div>
          <div class="stat-value">${invoice.clientName}</div>
        </div>
        <div class="invoice-meta-item">
          <div class="stat-label">Fecha</div>
          <div class="stat-value">${formatDate(invoice.date)}</div>
        </div>
      </div>

      <div class="invoice-lines">
        <div class="invoice-line"><span class="label">Tipo de trabajo</span><span class="value">${invoice.jobType}</span></div>
        <div class="invoice-line"><span class="label">Pies cuadrados</span><span class="value">${invoice.sqft.toLocaleString('en-US')} ft²</span></div>
        <div class="invoice-line"><span class="label">Precio por ft²</span><span class="value">${currency(pricePerSqft)}</span></div>
        <div class="invoice-line"><span class="label" style="font-weight:600;">Subtotal mano de obra</span><span class="value" style="font-weight:600;">${currency(laborSubtotal)}</span></div>
      </div>

      ${materialsSection(invoice)}

      <div class="invoice-total-row">
        <span class="label">Total</span>
        <span class="amount">${currency(invoice.total)}</span>
      </div>

      <div class="invoice-actions">
        <button type="button" class="btn btn-primary" id="printBtn">Imprimir / Guardar PDF</button>
        <a href="history.html" class="btn btn-secondary">Volver al historial</a>
      </div>

      <p class="invoice-disclaimer">Estimado aproximado. Sujeto a revisión final según condiciones del proyecto.</p>
    </div>
  `;
  document.getElementById('printBtn').addEventListener('click', () => window.print());
}

function renderNotFound() {
  document.getElementById('invoiceContainer').innerHTML = `
    <div class="empty-state">
      <p class="empty-state-title">Factura no encontrada</p>
      <p class="empty-state-body">Es posible que haya sido eliminada.</p>
      <a href="history.html" class="btn btn-secondary" style="margin-top: var(--space-2);">Volver al historial</a>
    </div>`;
}

async function load() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return renderNotFound();

  try {
    const snap = await getDoc(doc(db, 'invoices', id));
    if (!snap.exists()) return renderNotFound();
    render({ id: snap.id, ...snap.data() });
  } catch (err) {
    renderNotFound();
  }
}

requireAuth(() => load());
