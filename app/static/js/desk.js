const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
let editingProductId = null;

const locale = navigator.language || 'en-IN';
const currency = locale.includes('en-IN') || locale.includes('hi') ? 'INR' : 'USD';
const money = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n || 0));
const num = (n) => Number(n || 0).toLocaleString(locale);

function toast(message) {
  const el = $('#appToast');
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1600);
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formDataToJson(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = v;
  return o;
}

function openModal(id) { const m = document.getElementById(id); m.classList.remove('hidden'); m.classList.add('flex'); }
function closeModal(id) { const m = document.getElementById(id); m.classList.add('hidden'); m.classList.remove('flex'); }

function wireModalCloseButtons() {
  $$('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));
}

function renderDataTable(containerId, columns, rows, opts = {}) {
  const container = document.getElementById(containerId);
  const pageSize = opts.pageSize || 10;
  let state = { sortKey: null, sortDir: 1, page: 1, q: '' };

  const searchable = () => {
    const q = state.q.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  };
  const sortable = (source) => {
    if (!state.sortKey) return source;
    return [...source].sort((a, b) => {
      const av = a[state.sortKey], bv = b[state.sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * state.sortDir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * state.sortDir;
    });
  };

  const draw = () => {
    const all = sortable(searchable());
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * pageSize;
    const page = all.slice(start, start + pageSize);

    container.innerHTML = `
      <div class="controls">
        <input data-role="table-search" class="h-9 rounded border border-line px-2 text-xs" placeholder="Search" value="${state.q}" />
        <div class="text-xs text-gray-500">${all.length} rows</div>
      </div>
      <div class="wrap">
        <table>
          <thead><tr>${columns.map((c) => `<th data-sort="${c.key}">${c.label}${state.sortKey===c.key?(state.sortDir===1?' ▲':' ▼'):''}</th>`).join('')}</tr></thead>
          <tbody>${page.map((r) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(r) : (r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="pager">
        <button data-role="prev">Prev</button>
        <span class="text-xs text-gray-500">Page ${state.page}/${pages}</span>
        <button data-role="next">Next</button>
      </div>`;

    container.querySelector('[data-role="table-search"]').oninput = (e) => { state.q = e.target.value; state.page = 1; draw(); };
    container.querySelectorAll('th[data-sort]').forEach((th) => th.onclick = () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1; else { state.sortKey = key; state.sortDir = 1; }
      draw();
    });
    container.querySelector('[data-role="prev"]').onclick = () => { state.page = Math.max(1, state.page - 1); draw(); };
    container.querySelector('[data-role="next"]').onclick = () => { state.page = Math.min(pages, state.page + 1); draw(); };

    if (opts.onRendered) opts.onRendered(container);
  };
  draw();
}

function bindNav() {
  const items = $$('.nav-item');
  const setActive = (panel) => {
    items.forEach((i) => i.classList.toggle('active', i.dataset.panel === panel));
    $$('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== panel));
  };
  items.forEach((i) => i.onclick = () => setActive(i.dataset.panel));
  setActive('dashboard');

  $('#globalSearch').addEventListener('focus', () => openPalette());
}

async function loadDashboard() {
  const d = await api('/dashboard');
  const kpis = [
    { k: 'Today Sales', v: d.todays_sales, t: 'good' },
    { k: 'Month Sales', v: d.monthly_sales, t: 'good' },
    { k: 'Customer Due', v: d.outstanding_customer_balances, t: d.outstanding_customer_balances > 0 ? 'danger' : 'normal' },
    { k: 'Stock Value', v: d.stock_value, t: 'normal' },
    { k: 'Cash In Today', v: d.cash_received_today, t: 'good' },
    { k: 'Cash Out Today', v: d.cash_paid_today, t: 'warn' },
    { k: 'Low Stock', v: d.low_stock_alerts, t: d.low_stock_alerts > 0 ? 'danger' : 'normal' },
  ];

  const tone = (t) => t === 'good' ? 'border-success/40 bg-success/5 text-success' : t === 'danger' ? 'border-danger/40 bg-danger/5 text-danger' : t === 'warn' ? 'border-warning/40 bg-warning/5 text-warning' : 'border-line bg-card text-ink';
  $('#kpiGrid').innerHTML = kpis.map((x) => `<div class="rounded-[12px] border p-5 shadow-sm transition-all duration-200 ease-in-out hover:-translate-y-[1px] ${tone(x.t)}"><div class="text-xs">${x.k}</div><div class="mt-2 text-2xl font-bold">${typeof x.v === 'number' && x.k !== 'Low Stock' ? money(x.v) : num(x.v)}</div></div>`).join('');

  const tx = await api('/transactions/recent');
  renderDataTable('recentTransactions', [
    { key: 'type', label: 'Type' },
    { key: 'customer', label: 'Customer' },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString(locale) },
  ], tx, { pageSize: 5 });
}

async function loadCustomers() {
  const q = $('#customerSearch')?.value?.trim() || '';
  const rows = await api(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderDataTable('customersTable', [
    { key: 'store_name', label: 'Store' }, { key: 'customer_type', label: 'Type' }, { key: 'phone', label: 'Phone' },
    { key: 'outstanding_balance', label: 'Balance', render: (r) => money(r.outstanding_balance) },
    { key: 'actions', label: 'Actions', render: (r) => `<button class="text-primary" data-action="view" data-id="${r.id}">View</button> <button class="text-danger" data-action="delete" data-id="${r.id}">Delete</button>` },
  ], rows, { onRendered: (c) => {
    c.querySelectorAll('[data-action="view"]').forEach((b) => b.onclick = async () => toast(`Customer #${b.dataset.id}`));
    c.querySelectorAll('[data-action="delete"]').forEach((b) => b.onclick = async () => { if (!confirm('Delete customer?')) return; await api(`/customers/${b.dataset.id}`, { method: 'DELETE' }); toast('Customer deleted'); await Promise.all([loadCustomers(), loadDashboard(), loadSales()]); });
  }});
  const sel = $('#saleCustomer'); if (sel) sel.innerHTML = `<option value="">Customer</option>${rows.map((r) => `<option value="${r.id}">${r.store_name}</option>`).join('')}`;
  const rv = $('#rvCustomerId'); if (rv) rv.innerHTML = `<option value="">Customer</option>${rows.map((r) => `<option value="${r.id}">${r.store_name}</option>`).join('')}`;
}

async function loadSuppliers() {
  const rows = await api('/suppliers');
  renderDataTable('suppliersTable', [
    { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'outstanding_balance', label: 'Due', render: (r) => money(r.outstanding_balance) },
    { key: 'actions', label: 'Actions', render: (r) => `<button class="text-primary" data-action="view" data-id="${r.id}">View</button> <button class="text-danger" data-action="delete" data-id="${r.id}">Delete</button>` },
  ], rows, { onRendered: (c) => {
    c.querySelectorAll('[data-action="delete"]').forEach((b) => b.onclick = async () => { if (!confirm('Delete supplier?')) return; await api(`/suppliers/${b.dataset.id}`, { method: 'DELETE' }); toast('Supplier deleted'); await Promise.all([loadSuppliers(), loadPurchases()]); });
  }});
  const sel = $('#purchaseSupplier'); if (sel) sel.innerHTML = `<option value="">Supplier</option>${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}`;
}

async function loadProducts(q = '') {
  const rows = await api(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderDataTable('productsTable', [
    { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'size', label: 'Size' }, { key: 'thickness', label: 'Thickness' }, { key: 'stock_qty', label: 'Stock' },
    { key: 'actions', label: 'Actions', render: (r) => `<button class="text-primary" data-action="view" data-id="${r.id}">View</button> <button class="text-primary" data-action="edit" data-id="${r.id}">Edit</button> <button class="text-danger" data-action="delete" data-id="${r.id}">Delete</button>` },
  ], rows, { onRendered: (c) => {
    c.querySelectorAll('[data-action="edit"]').forEach((btn) => btn.onclick = async () => {
      const row = await api(`/products/${btn.dataset.id}`);
      editingProductId = Number(btn.dataset.id);
      const f = $('#productForm');
      f.name.value = row.name; f.category.value = row.category || ''; f.size.value = row.size || ''; f.thickness.value = row.thickness || '';
      f.purchase_cost.value = row.purchase_cost; f.selling_price.value = row.selling_price; f.stock_qty.value = row.stock_qty; f.parent_id.value = row.parent_id || '';
      openModal('productModal');
    });
    c.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.onclick = async () => { if (!confirm('Delete product?')) return; await api(`/products/${btn.dataset.id}`, { method: 'DELETE' }); toast('Product deleted'); await Promise.all([loadProducts($('#productSearch').value.trim()), loadInventory()]); });
  }});

  const p = $('#purchaseProduct'); if (p) p.innerHTML = `<option value="">Product</option>${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}`;
  const s = $('#saleProduct'); if (s) s.innerHTML = `<option value="">Product</option>${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}`;
  const par = $('#productParent'); if (par) par.innerHTML = `<option value="">Parent Product (optional)</option>${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}`;
}

async function loadPurchases() {
  const rows = await api('/purchases');
  renderDataTable('purchasesTable', [
    { key: 'id', label: 'ID' }, { key: 'supplier_id', label: 'Supplier' }, { key: 'total_amount', label: 'Total', render: (r) => money(r.total_amount) }, { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleString(locale) },
    { key: 'actions', label: 'Actions', render: () => `<button class="text-primary">View</button>` },
  ], rows);
}

async function loadSales() {
  const rows = await api('/sales');
  renderDataTable('salesTable', [
    { key: 'id', label: 'ID' }, { key: 'customer_id', label: 'Customer' }, { key: 'payment_type', label: 'Type' },
    { key: 'total_amount', label: 'Total', render: (r) => money(r.total_amount) },
    { key: 'paid_amount', label: 'Paid', render: (r) => money(r.paid_amount) },
    { key: 'due_amount', label: 'Due', render: (r) => money(r.due_amount) },
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleString(locale) },
    { key: 'actions', label: 'Actions', render: (r) => `<button class="text-primary" data-fill-receipt="${r.id}">Receive</button>` },
  ], rows, { onRendered: (c) => {
    c.querySelectorAll('[data-fill-receipt]').forEach((b) => b.onclick = () => { $('#rvSaleId').value = b.dataset.fillReceipt; openModal('receiptModal'); });
  }});
}

async function loadInventory() {
  const inv = await api('/inventory');
  $('#inventorySummary').innerHTML = [
    ['Stock Value', money(inv.summary.stock_value)], ['Low Stock Items', num(inv.summary.low_stock_count)], ['Total Products', num(inv.summary.total_products)],
  ].map(([k,v]) => `<div class="rounded-[12px] border border-line bg-card p-5 shadow-sm"><div class="text-sm text-[#6B7280]">${k}</div><div class="mt-2 text-2xl font-bold">${v}</div></div>`).join('');
  const low = inv.items.filter((x) => Number(x.stock_qty) < Number(x.low_stock_limit));
  $('#lowStockWarnings').innerHTML = low.map((x) => `<div class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-[#92400E]">Low stock: ${x.name} (Stock ${x.stock_qty}, Min ${x.low_stock_limit})</div>`).join('');
  renderDataTable('inventoryTable', [
    { key: 'name', label: 'Name' }, { key: 'stock_qty', label: 'Stock' }, { key: 'stock_value', label: 'Stock Value', render: (r) => money(Number(r.stock_qty) * Number(r.purchase_cost)) },
    { key: 'actions', label: 'Actions', render: () => `<button class="text-primary">View</button>` },
  ], inv.items);
}

async function loadDaybook() {
  const days = await api('/daybook/feed');
  $('#daybookTable').innerHTML = days.map((d) => `<div class="rounded-md border border-line bg-card p-3"><div class="font-semibold">${d.date}</div>${d.entries.map((e) => `<div class="day-entry"><div class="text-sm font-medium">${e.type}</div><div class="text-sm text-gray-700">${e.line}</div></div>`).join('')}</div>`).join('');
}

function bindForms() {
  $('#customerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formDataToJson(e.target); body.opening_balance = 0;
    await api('/customers', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset(); closeModal('customerModal'); toast('Customer added'); await Promise.all([loadCustomers(), loadDashboard()]);
  });

  $('#supplierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formDataToJson(e.target); body.opening_balance = 0;
    await api('/suppliers', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset(); toast('Supplier added'); await loadSuppliers();
  });

  $('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    const body = { parent_id: b.parent_id ? Number(b.parent_id) : null, name: b.name, category: b.category || '', size: b.size, thickness: b.thickness, purchase_cost: Number(b.purchase_cost), selling_price: Number(b.selling_price), stock_qty: Number(b.stock_qty || 0), low_stock_limit: 5 };
    if (editingProductId) await api(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/products', { method: 'POST', body: JSON.stringify(body) });
    editingProductId = null; e.target.reset(); closeModal('productModal'); toast('Product saved'); await Promise.all([loadProducts($('#productSearch').value.trim()), loadInventory()]);
  });

  $('#purchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    await api('/purchases', { method: 'POST', body: JSON.stringify({ supplier_id: Number(b.supplier_id), purchase_date: b.purchase_date, items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_cost: Number(b.unit_cost) }] }) });
    e.target.reset(); closeModal('purchaseModal'); toast('Purchase recorded'); await Promise.all([loadPurchases(), loadInventory(), loadDashboard(), loadProducts(), loadSuppliers(), loadDaybook()]);
  });

  $('#saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    await api('/sales', { method: 'POST', body: JSON.stringify({ customer_id: Number(b.customer_id), payment_type: b.payment_type, sale_date: b.sale_date, paid_amount: Number(b.paid_amount || 0), items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_price: Number(b.unit_price) }] }) });
    e.target.reset(); closeModal('saleModal'); toast('Sale created'); await Promise.all([loadSales(), loadInventory(), loadDashboard(), loadProducts(), loadCustomers(), loadDaybook()]);
  });

  const rv = $('#receiptVoucherForm');
  if (rv) rv.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    await api('/vouchers/receipt', { method: 'POST', body: JSON.stringify({ customer_id: Number(b.customer_id), sale_id: b.sale_id ? Number(b.sale_id) : null, amount: Number(b.amount), notes: b.notes || '' }) });
    rv.reset(); closeModal('receiptModal'); toast('Receipt saved'); await Promise.all([loadSales(), loadCustomers(), loadDashboard(), loadDaybook()]);
  });
}

function bindUiActions() {
  $('#openCustomerModal').onclick = () => { $('#customerForm').reset(); openModal('customerModal'); };
  $('#openProductModal').onclick = async () => { editingProductId = null; $('#productForm').reset(); await loadProducts(); openModal('productModal'); };
  $('#openPurchaseModal').onclick = async () => { $('#purchaseDate').value = new Date().toISOString().slice(0, 10); await Promise.all([loadSuppliers(), loadProducts()]); openModal('purchaseModal'); };
  $('#openSaleModal').onclick = async () => { $('#saleDate').value = new Date().toISOString().slice(0, 10); await Promise.all([loadCustomers(), loadProducts()]); openModal('saleModal'); };
  $('#customerSearch').addEventListener('input', loadCustomers);
  $('#productSearch').addEventListener('input', (e) => loadProducts(e.target.value.trim()));

  $$('[data-quick]').forEach((btn) => btn.onclick = () => {
    const map = { sale: 'saleModal', product: 'productModal', customer: 'customerModal', purchase: 'purchaseModal', receipt: 'receiptModal' };
    const id = map[btn.dataset.quick];
    if (id) openModal(id);
  });
}

function setupCommandPalette() {
  const palette = $('#commandPalette');
  const input = $('#commandInput');
  const list = $('#commandList');
  const commands = [
    { label: 'View Customers', action: () => $$('.nav-item').find((x) => x.dataset.panel === 'customers').click() },
    { label: 'Add Customer', action: () => openModal('customerModal') },
    { label: 'New Sale', action: () => openModal('saleModal') },
    { label: 'Sales History', action: () => $$('.nav-item').find((x) => x.dataset.panel === 'sales').click() },
    { label: 'Add Product', action: () => openModal('productModal') },
    { label: 'New Purchase', action: () => openModal('purchaseModal') },
    { label: 'Receive Payment', action: () => openModal('receiptModal') },
  ];

  const render = (q = '') => {
    const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
    list.innerHTML = filtered.map((c, i) => `<button data-cmd="${i}" class="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[#F3F4F6]">${c.label}</button>`).join('');
    list.querySelectorAll('[data-cmd]').forEach((b) => b.onclick = () => { filtered[Number(b.dataset.cmd)].action(); closePalette(); });
  };

  window.openPalette = () => { palette.classList.remove('hidden'); palette.classList.add('flex'); input.value = ''; render(''); input.focus(); };
  window.closePalette = () => { palette.classList.add('hidden'); palette.classList.remove('flex'); };

  input.addEventListener('input', (e) => render(e.target.value));
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') closePalette();
  });
  palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });
}

async function boot() {
  wireModalCloseButtons();
  setupCommandPalette();
  bindNav();
  bindForms();
  bindUiActions();
  await Promise.all([loadDashboard(), loadCustomers(), loadSuppliers(), loadProducts(), loadPurchases(), loadSales(), loadInventory(), loadDaybook()]);
}

boot().catch((e) => { console.error(e); toast('Failed to load data'); });
