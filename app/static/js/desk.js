const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
const fmt = (n) => Number(n || 0).toLocaleString();
let editingProductId = null;

function toast(message) {
  const el = $("#appToast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 1600);
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formDataToJson(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = v;
  return o;
}

function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.add("hidden");
  m.classList.remove("flex");
}

function wireModalCloseButtons() {
  $$('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));
}

function renderDataTable(containerId, columns, rows, opts = {}) {
  const container = document.getElementById(containerId);
  const pageSize = opts.pageSize || 10;
  let state = { sortKey: null, sortDir: 1, page: 1, q: "" };

  const searchableRows = () => {
    const q = state.q.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
  };

  const sortedRows = (source) => {
    if (!state.sortKey) return source;
    return [...source].sort((a, b) => {
      const av = a[state.sortKey];
      const bv = b[state.sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * state.sortDir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * state.sortDir;
    });
  };

  const draw = () => {
    const searched = searchableRows();
    const sorted = sortedRows(searched);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * pageSize;
    const pageRows = sorted.slice(start, start + pageSize);

    const controls = `
      <div class="controls">
        <input data-role="table-search" class="rounded border border-line px-2 py-1 text-xs" placeholder="Search table" value="${state.q}" />
        <div class="text-xs text-gray-500">${searched.length} rows</div>
      </div>`;

    const head = `<tr>${columns
      .map((c) => `<th data-sort="${c.key}">${c.label}${state.sortKey === c.key ? (state.sortDir === 1 ? " ▲" : " ▼") : ""}</th>`)
      .join("")}</tr>`;

    const body = pageRows
      .map((r) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(r) : (r[c.key] ?? "")}</td>`).join("")}</tr>`)
      .join("");

    const pager = `
      <div class="pager">
        <button data-role="prev">Prev</button>
        <span class="text-xs text-gray-500">Page ${state.page} / ${totalPages}</span>
        <button data-role="next">Next</button>
      </div>`;

    container.innerHTML = `${controls}<div class="wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>${pager}`;

    container.querySelector('[data-role="table-search"]').addEventListener('input', (e) => {
      state.q = e.target.value;
      state.page = 1;
      draw();
    });

    container.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else {
        state.sortKey = key;
        state.sortDir = 1;
      }
      draw();
    }));

    container.querySelector('[data-role="prev"]').addEventListener('click', () => {
      state.page = Math.max(1, state.page - 1);
      draw();
    });
    container.querySelector('[data-role="next"]').addEventListener('click', () => {
      state.page = Math.min(totalPages, state.page + 1);
      draw();
    });

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
  items.forEach((i) => i.addEventListener('click', () => setActive(i.dataset.panel)));
  setActive('dashboard');

  $('#globalSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const hit = items.find((x) => x.textContent.toLowerCase().includes(q));
    if (hit && q) hit.click();
  });
}

async function loadDashboard() {
  const d = await api('/dashboard');
  const cards = [
    ['Today Sales', d.todays_sales],
    ['Month Sales', d.monthly_sales],
    ['Customer Due', d.outstanding_customer_balances],
    ['Stock Value', d.stock_value],
    ['Cash In Today', d.cash_received_today],
    ['Cash Out Today', d.cash_paid_today],
    ['Low Stock', d.low_stock_alerts],
  ];
  $('#kpiGrid').innerHTML = cards.map(([k,v]) => `<div class="rounded-md border border-line bg-card p-3"><div class="text-xs text-gray-500">${k}</div><div class="mt-1 text-xl font-semibold">${fmt(v)}</div></div>`).join('');
}

async function loadCustomers() {
  const q = $('#customerSearch')?.value?.trim() || '';
  const rows = await api(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderDataTable('customersTable', [
    { key: 'store_name', label: 'Store' },
    { key: 'customer_type', label: 'Type' },
    { key: 'phone', label: 'Phone' },
    { key: 'outstanding_balance', label: 'Balance', render: (r) => `₹${fmt(r.outstanding_balance)}` },
  ], rows);
  const sel = $('#saleCustomer');
  if (sel) sel.innerHTML = `<option value="">Customer</option>${rows.map((r) => `<option value="${r.id}">${r.store_name}</option>`).join('')}`;
}

async function loadSuppliers() {
  const rows = await api('/suppliers');
  renderDataTable('suppliersTable', [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'outstanding_balance', label: 'Due', render: (r) => `₹${fmt(r.outstanding_balance)}` },
  ], rows);
  const sel = $('#purchaseSupplier');
  if (sel) sel.innerHTML = `<option value="">Supplier</option>${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}`;
}

async function loadProducts(q = '') {
  const rows = await api(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderDataTable('productsTable', [
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'size', label: 'Size' },
    { key: 'thickness', label: 'Thickness' },
    { key: 'stock_qty', label: 'Stock' },
    { key: 'actions', label: 'Actions', render: (r) => `<button class="text-primary" data-action="edit" data-id="${r.id}">Edit</button> <button class="text-danger" data-action="delete" data-id="${r.id}">Delete</button>` },
  ], rows, {
    onRendered: (c) => {
      c.querySelectorAll('[data-action="edit"]').forEach((btn) => btn.onclick = async () => {
        const row = await api(`/products/${btn.dataset.id}`);
        editingProductId = Number(btn.dataset.id);
        const f = $('#productForm');
        f.name.value = row.name; f.category.value = row.category || ''; f.size.value = row.size || '';
        f.thickness.value = row.thickness || ''; f.purchase_cost.value = row.purchase_cost; f.selling_price.value = row.selling_price; f.stock_qty.value = row.stock_qty;
        openModal('productModal');
      });
      c.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.onclick = async () => {
        if (!confirm('Delete product?')) return;
        try { await api(`/products/${btn.dataset.id}`, { method: 'DELETE' }); toast('Product deleted'); } catch { toast('Delete blocked'); }
        await Promise.all([loadProducts($('#productSearch').value.trim()), loadInventory()]);
      });
    }
  });
  const p = $('#purchaseProduct'); if (p) p.innerHTML = `<option value="">Product</option>${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}`;
  const s = $('#saleProduct'); if (s) s.innerHTML = `<option value="">Product</option>${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}`;
}

async function loadPurchases() {
  const rows = await api('/purchases');
  renderDataTable('purchasesTable', [
    { key: 'id', label: 'ID' },
    { key: 'supplier_id', label: 'Supplier' },
    { key: 'total_amount', label: 'Total', render: (r) => `₹${fmt(r.total_amount)}` },
    { key: 'created_at', label: 'Date' },
  ], rows);
}

async function loadSales() {
  const rows = await api('/sales');
  renderDataTable('salesTable', [
    { key: 'id', label: 'ID' },
    { key: 'customer_id', label: 'Customer' },
    { key: 'payment_type', label: 'Type' },
    { key: 'total_amount', label: 'Total', render: (r) => `₹${fmt(r.total_amount)}` },
    { key: 'paid_amount', label: 'Paid', render: (r) => `₹${fmt(r.paid_amount)}` },
    { key: 'due_amount', label: 'Due', render: (r) => `₹${fmt(r.due_amount)}` },
    { key: 'created_at', label: 'Date' },
  ], rows);
}

async function loadInventory() {
  const inv = await api('/inventory');
  $('#inventorySummary').innerHTML = [
    ['Stock Value', `₹${fmt(inv.summary.stock_value)}`],
    ['Low Stock Items', inv.summary.low_stock_count],
    ['Total Products', inv.summary.total_products],
  ].map(([k,v]) => `<div class="rounded-md border border-line bg-card p-3"><div class="text-xs text-gray-500">${k}</div><div class="mt-1 text-lg font-semibold">${v}</div></div>`).join('');

  const low = inv.items.filter((x) => Number(x.stock_qty) < Number(x.low_stock_limit));
  $('#lowStockWarnings').innerHTML = low.map((x) => `<div class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-[#92400E]">Low stock: ${x.name} (Stock ${x.stock_qty}, Min ${x.low_stock_limit})</div>`).join('');

  renderDataTable('inventoryTable', [
    { key: 'name', label: 'Name' },
    { key: 'stock_qty', label: 'Stock' },
    { key: 'stock_value', label: 'Stock Value', render: (r) => `₹${fmt(Number(r.stock_qty) * Number(r.purchase_cost))}` },
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
    const body = { name: b.name, category: b.category || '', size: b.size, thickness: b.thickness, purchase_cost: Number(b.purchase_cost), selling_price: Number(b.selling_price), stock_qty: Number(b.stock_qty || 0), low_stock_limit: 5 };
    if (editingProductId) await api(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/products', { method: 'POST', body: JSON.stringify(body) });
    editingProductId = null; e.target.reset(); closeModal('productModal'); toast('Product saved'); await Promise.all([loadProducts($('#productSearch').value.trim()), loadInventory()]);
  });

  $('#purchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    await api('/purchases', { method: 'POST', body: JSON.stringify({ supplier_id: Number(b.supplier_id), purchase_date: b.purchase_date, items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_cost: Number(b.unit_cost) }] }) });
    e.target.reset(); closeModal('purchaseModal'); toast('Purchase recorded'); await Promise.all([loadPurchases(), loadInventory(), loadDashboard(), loadProducts(), loadSuppliers()]);
  });

  $('#saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    await api('/sales', { method: 'POST', body: JSON.stringify({ customer_id: Number(b.customer_id), payment_type: b.payment_type, sale_date: b.sale_date, paid_amount: Number(b.paid_amount || 0), items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_price: Number(b.unit_price) }] }) });
    e.target.reset(); closeModal('saleModal'); toast('Sale created'); await Promise.all([loadSales(), loadInventory(), loadDashboard(), loadProducts(), loadCustomers()]);
  });
}

function bindUiActions() {
  $('#openCustomerModal').onclick = () => { $('#customerForm').reset(); openModal('customerModal'); };
  $('#openProductModal').onclick = () => { editingProductId = null; $('#productForm').reset(); openModal('productModal'); };
  $('#openPurchaseModal').onclick = async () => { $('#purchaseDate').value = new Date().toISOString().slice(0,10); await Promise.all([loadSuppliers(), loadProducts()]); openModal('purchaseModal'); };
  $('#openSaleModal').onclick = async () => { $('#saleDate').value = new Date().toISOString().slice(0,10); await Promise.all([loadCustomers(), loadProducts()]); openModal('saleModal'); };
  $('#customerSearch').addEventListener('input', loadCustomers);
  $('#productSearch').addEventListener('input', (e) => loadProducts(e.target.value.trim()));
}

async function boot() {
  wireModalCloseButtons();
  bindNav();
  bindForms();
  bindUiActions();
  await Promise.all([loadDashboard(), loadCustomers(), loadSuppliers(), loadProducts(), loadPurchases(), loadSales(), loadInventory(), loadDaybook()]);
}

boot().catch((e) => { console.error(e); toast('Failed to load data'); });
