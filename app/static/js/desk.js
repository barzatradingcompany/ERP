const $ = (q) => document.querySelector(q);
const locale = 'en-IN';
const getCurrency = () => localStorage.getItem('erp_currency') || 'INR';
const money = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency: getCurrency(), maximumFractionDigits: 0 }).format(Number(n || 0));
let lowStockItems = [];
let saleCustomers = [];
let saleProducts = [];
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function toast(message) {
  const el = $('#appToast');
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1600);
}

async function api(path) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const data = JSON.parse(message);
      message = data.detail || message;
    } catch (_) {}
    throw new Error(message);
  }
  return res.json();
}

function applyTheme() {
  // Backward compatibility for old boolean storage key.
  if (!localStorage.getItem('erp_theme_mode') && localStorage.getItem('erp_theme')) {
    localStorage.setItem('erp_theme_mode', localStorage.getItem('erp_theme'));
  }
  const mode = localStorage.getItem('erp_theme_mode') || 'light';
  const dark = mode === 'dark' || (mode === 'system' && systemDarkQuery.matches);
  const body = document.body;
  if (dark) {
    body.classList.add('dark-theme');
  } else {
    body.classList.remove('dark-theme');
  }
}

function setActivePanel(name) {
  const items = document.querySelectorAll('.nav-item[data-panel]');
  const panels = document.querySelectorAll('.panel');
  items.forEach((i) => {
    const active = i.dataset.panel === name;
    i.classList.toggle('active', active);
    if (active) {
      i.classList.add('border-[#2563EB]', 'bg-[#DBEAFE]', 'font-bold', 'text-[#1D4ED8]');
      i.classList.remove('border-transparent', 'text-[#111827]');
    } else {
      i.classList.remove('border-[#2563EB]', 'bg-[#DBEAFE]', 'font-bold', 'text-[#1D4ED8]');
      i.classList.add('border-transparent', 'text-[#111827]');
    }
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.id !== name));
  if (name === 'sales') {
    loadSalesPanel().catch((e) => {
      console.error(e);
      toast('Sales failed to load');
    });
  }
}

function bindNavigation() {
  document.querySelectorAll('.nav-item[data-panel]').forEach((i) => {
    i.addEventListener('click', () => setActivePanel(i.dataset.panel));
  });
  document.querySelectorAll('[data-open-panel]').forEach((i) => {
    i.addEventListener('click', () => setActivePanel(i.dataset.openPanel));
  });
  setActivePanel('dashboard');
}

function renderSimpleTable(containerId, columns, rows) {
  const root = document.getElementById(containerId);
  root.innerHTML = `
    <div class="overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead><tr>${columns.map((c) => `<th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">${c.label}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${i % 2 ? 'bg-[#FAFAFA]' : ''} hover:bg-[#EFF6FF] transition-all duration-200 ease-in-out">${columns.map((c) => `<td class="border-b border-line px-3 py-2">${c.render ? c.render(r) : (r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

async function loadDashboard() {
  const d = await api('/dashboard');
  const kpis = [
    { k: 'Today Sales', v: d.todays_sales, t: 'good', currency: true },
    { k: 'Month Sales', v: d.monthly_sales, t: 'good', currency: true },
    { k: 'Customer Due', v: d.outstanding_customer_balances, t: d.outstanding_customer_balances > 0 ? 'danger' : 'normal', currency: true },
    { k: 'Stock Value', v: d.stock_value, t: 'normal', currency: true },
    { k: 'Cash In Today', v: d.cash_received_today, t: 'good', currency: true },
    { k: 'Cash Out Today', v: d.cash_paid_today, t: 'warning', currency: true },
  ];

  const tone = (t) => t === 'good'
    ? 'border-success/40 bg-success/5 text-success'
    : t === 'danger'
      ? 'border-danger/40 bg-danger/5 text-danger'
      : t === 'warning'
        ? 'border-warning/40 bg-warning/5 text-warning'
        : 'border-line bg-card text-ink';

  $('#kpiGrid').innerHTML = kpis.map((x) => `
    <div class="rounded-[12px] border p-5 shadow-sm transition-all duration-200 ease-in-out hover:-translate-y-[1px] ${tone(x.t)}">
      <div class="text-xs">${x.k}</div>
      <div class="mt-2 text-2xl font-bold">${x.currency ? money(x.v) : Number(x.v).toLocaleString(locale)}</div>
    </div>
  `).join('');

  const inv = await api('/inventory');
  lowStockItems = inv.items.filter((x) => Number(x.stock_qty) < Number(x.low_stock_limit));
}

function renderLowStockList() {
  const body = $('#lowStockListBody');
  if (!body) return;
  if (!lowStockItems.length) {
    body.innerHTML = `<div class="p-3 text-sm text-[#6B7280]">No low stock items.</div>`;
    return;
  }
  renderSimpleTable('lowStockListBody', [
    { key: 'name', label: 'Item' },
    { key: 'stock_qty', label: 'In Stock' },
    { key: 'low_stock_limit', label: 'Minimum Level' },
  ], lowStockItems);
}

function productLabel(product) {
  const parts = [product.name, product.size, product.thickness].filter(Boolean);
  return `${parts.join(' / ')} - Stock ${product.stock_qty}`;
}

function saleProductOptions(selectedId = '') {
  if (!saleProducts.length) return '<option value="">No products found</option>';
  return [
    '<option value="">Select product</option>',
    ...saleProducts.map((p) => `<option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${productLabel(p)}</option>`),
  ].join('');
}

function addSaleItemRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'sale-item-row grid grid-cols-[minmax(0,1fr)_84px_112px_44px] gap-2 px-3 py-2';
  row.innerHTML = `
    <select required class="sale-product h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm">${saleProductOptions(item.product_id)}</select>
    <input required type="number" min="1" step="1" value="${item.quantity || 1}" class="sale-qty h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm" />
    <input required type="number" min="0.01" step="0.01" value="${item.unit_price || ''}" class="sale-price h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm" />
    <button type="button" class="remove-sale-item h-10 rounded-md border border-line bg-white text-sm transition-all duration-200 ease-in-out hover:bg-[#F9FAFB]">x</button>
  `;
  $('#saleItems')?.appendChild(row);
  row.querySelector('.sale-product')?.addEventListener('change', (e) => {
    const product = saleProducts.find((p) => String(p.id) === e.target.value);
    if (product) row.querySelector('.sale-price').value = Number(product.selling_price || 0);
    updateSaleTotal();
  });
  row.querySelector('.sale-qty')?.addEventListener('input', updateSaleTotal);
  row.querySelector('.sale-price')?.addEventListener('input', updateSaleTotal);
  row.querySelector('.remove-sale-item')?.addEventListener('click', () => {
    row.remove();
    if (!document.querySelectorAll('.sale-item-row').length) addSaleItemRow();
    updateSaleTotal();
  });
  updateSaleTotal();
}

function collectSaleItems() {
  return [...document.querySelectorAll('.sale-item-row')].map((row) => ({
    product_id: Number(row.querySelector('.sale-product')?.value),
    quantity: Number(row.querySelector('.sale-qty')?.value),
    unit_price: Number(row.querySelector('.sale-price')?.value),
  })).filter((x) => x.product_id && x.quantity > 0 && x.unit_price > 0);
}

function updateSaleTotal() {
  const total = collectSaleItems().reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalEl = $('#saleTotal');
  if (totalEl) totalEl.textContent = money(total);
  const paymentType = $('#salePaymentType')?.value;
  const paidInput = $('#salePaidAmount');
  if (paidInput && paymentType === 'full') paidInput.value = total.toFixed(2);
}

async function loadSaleLookups() {
  const [customers, inventory] = await Promise.all([api('/customers'), api('/inventory')]);
  saleCustomers = customers;
  saleProducts = inventory.items || [];

  const customerSelect = $('#saleCustomer');
  if (customerSelect) {
    customerSelect.innerHTML = saleCustomers.length
      ? ['<option value="">Select customer</option>', ...saleCustomers.map((c) => `<option value="${c.id}">${c.store_name} (${c.customer_type})</option>`)].join('')
      : '<option value="">No customers found</option>';
  }

  const rows = document.querySelectorAll('.sale-item-row');
  if (!rows.length) {
    addSaleItemRow();
  } else {
    rows.forEach((row) => {
      const select = row.querySelector('.sale-product');
      const selected = select?.value || '';
      if (select) select.innerHTML = saleProductOptions(selected);
    });
  }
}

async function loadSalesList() {
  const sales = await api('/sales');
  renderSimpleTable('salesTable', [
    { key: 'id', label: 'Invoice', render: (r) => `#${r.id}` },
    { key: 'total_amount', label: 'Total', render: (r) => money(r.total_amount) },
    { key: 'paid_amount', label: 'Paid', render: (r) => money(r.paid_amount) },
    { key: 'due_amount', label: 'Due', render: (r) => money(r.due_amount) },
  ], sales.slice(0, 10));
}

async function loadSalesPanel() {
  await loadSaleLookups();
  await loadSalesList();
  updateSaleTotal();
}

function resetSaleForm() {
  $('#saleForm')?.reset();
  $('#saleItems').innerHTML = '';
  addSaleItemRow();
  updateSaleTotal();
}

loadDashboard().catch((e) => {
  console.error(e);
  toast('Dashboard failed to load');
});

$('#openLowStockList')?.addEventListener('click', () => {
  renderLowStockList();
  $('#lowStockModal')?.classList.remove('hidden');
  $('#lowStockModal')?.classList.add('flex');
});

$('#closeLowStockList')?.addEventListener('click', () => {
  $('#lowStockModal')?.classList.add('hidden');
  $('#lowStockModal')?.classList.remove('flex');
});

$('#themeSelect')?.addEventListener('change', (e) => {
  localStorage.setItem('erp_theme_mode', e.target.value);
  applyTheme();
  loadDashboard().catch(() => {});
});

$('#currencySelect')?.addEventListener('change', async (e) => {
  localStorage.setItem('erp_currency', e.target.value);
  await loadDashboard();
  updateSaleTotal();
});

$('#refreshSales')?.addEventListener('click', () => {
  loadSalesPanel().catch((e) => {
    console.error(e);
    toast('Sales failed to refresh');
  });
});

$('#addSaleItem')?.addEventListener('click', () => addSaleItemRow());

$('#salePaymentType')?.addEventListener('change', updateSaleTotal);

$('#saleForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = collectSaleItems();
  if (!items.length) {
    toast('Add at least one sale item');
    return;
  }
  const payload = {
    customer_id: Number($('#saleCustomer')?.value),
    payment_type: $('#salePaymentType')?.value,
    sale_date: $('#saleDate')?.value || null,
    paid_amount: Number($('#salePaidAmount')?.value || 0),
    items,
  };
  if (!payload.customer_id) {
    toast('Select a customer');
    return;
  }

  try {
    await apiPost('/sales', payload);
    toast('Sale saved');
    resetSaleForm();
    await Promise.all([loadDashboard(), loadSalesPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Sale failed');
  }
});

function initSettings() {
  if (!localStorage.getItem('erp_theme_mode') && localStorage.getItem('erp_theme')) {
    localStorage.setItem('erp_theme_mode', localStorage.getItem('erp_theme'));
  }
  const themeMode = localStorage.getItem('erp_theme_mode') || 'light';
  const themeSelect = $('#themeSelect');
  if (themeSelect) themeSelect.value = themeMode;
  const currency = getCurrency();
  const currencySelect = $('#currencySelect');
  if (currencySelect) currencySelect.value = currency;
}

systemDarkQuery.addEventListener('change', () => {
  if ((localStorage.getItem('erp_theme_mode') || 'light') === 'system') {
    applyTheme();
    loadDashboard().catch(() => {});
  }
});

applyTheme();
bindNavigation();
initSettings();
