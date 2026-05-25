const $ = (q) => document.querySelector(q);
const locale = 'en-IN';
const getCurrency = () => localStorage.getItem('erp_currency') || 'INR';
const money = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency: getCurrency(), maximumFractionDigits: 0 }).format(Number(n || 0));
let lowStockItems = [];
let masterCustomers = [];
let masterSuppliers = [];
let masterProducts = [];
let saleCustomers = [];
let saleProducts = [];
let purchaseSuppliers = [];
let purchaseProducts = [];
let payrollEmployees = [];
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function toast(message) {
  const el = $('#appToast');
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1600);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
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

async function apiPut(path, payload) {
  const res = await fetch(path, {
    method: 'PUT',
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

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE' });
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
  if (name === 'customers') {
    loadCustomersPanel().catch((e) => {
      console.error(e);
      toast('Customers failed to load');
    });
  }
  if (name === 'suppliers') {
    loadSuppliersPanel().catch((e) => {
      console.error(e);
      toast('Suppliers failed to load');
    });
  }
  if (name === 'products') {
    loadProductsPanel().catch((e) => {
      console.error(e);
      toast('Products failed to load');
    });
  }
  if (name === 'sales') {
    loadSalesPanel().catch((e) => {
      console.error(e);
      toast('Sales failed to load');
    });
  }
  if (name === 'purchases') {
    loadPurchasesPanel().catch((e) => {
      console.error(e);
      toast('Purchases failed to load');
    });
  }
  if (name === 'payroll') {
    loadPayrollPanel().catch((e) => {
      console.error(e);
      toast('Payroll failed to load');
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
        <thead><tr>${columns.map((c) => `<th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${i % 2 ? 'bg-[#FAFAFA]' : ''} hover:bg-[#EFF6FF] transition-all duration-200 ease-in-out">${columns.map((c) => `<td class="border-b border-line px-3 py-2">${escapeHtml(c.render ? c.render(r) : (r[c.key] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function pathWithQuery(path, query) {
  const clean = String(query || '').trim();
  return clean ? `${path}?q=${encodeURIComponent(clean)}` : path;
}

function renderSummaryCards(containerId, cards) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const toneClass = (tone) => {
    if (tone === 'danger') return 'border-danger/40 bg-danger/5 text-danger';
    if (tone === 'warning') return 'border-warning/40 bg-warning/5 text-warning';
    if (tone === 'good') return 'border-success/40 bg-success/5 text-success';
    return 'border-line bg-card text-ink';
  };
  root.innerHTML = cards.map((card) => `
    <div class="rounded-[12px] border p-5 shadow-sm ${toneClass(card.tone)}">
      <div class="text-xs">${escapeHtml(card.label)}</div>
      <div class="mt-2 text-2xl font-bold">${escapeHtml(card.value)}</div>
    </div>
  `).join('');
}

function emptyState(message) {
  return `<div class="p-3 text-sm text-[#6B7280]">${escapeHtml(message)}</div>`;
}

function customerTypeLabel(value) {
  return String(value || '').replace(/^./, (char) => char.toUpperCase());
}

async function loadCustomersPanel() {
  const query = $('#customerSearch')?.value || '';
  masterCustomers = await api(pathWithQuery('/customers', query));
  const totalOutstanding = masterCustomers.reduce((sum, row) => sum + Number(row.outstanding_balance || 0), 0);
  const wholesaleCount = masterCustomers.filter((row) => row.customer_type === 'wholesale').length;
  renderSummaryCards('customerSummary', [
    { label: 'Customers', value: masterCustomers.length.toLocaleString(locale), tone: 'good' },
    { label: 'Total Outstanding', value: money(totalOutstanding), tone: totalOutstanding > 0 ? 'danger' : 'normal' },
    { label: 'Wholesale Accounts', value: wholesaleCount.toLocaleString(locale) },
  ]);
  renderCustomersTable();
}

function renderCustomersTable() {
  const root = $('#customersTable');
  if (!root) return;
  if (!masterCustomers.length) {
    root.innerHTML = emptyState('No customers found.');
    return;
  }
  root.innerHTML = `
    <div class="overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Name</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Type</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Phone</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Outstanding</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${masterCustomers.map((customer, i) => `
            <tr class="${i % 2 ? 'bg-[#FAFAFA]' : ''} hover:bg-[#EFF6FF] transition-all duration-200 ease-in-out">
              <td class="border-b border-line px-3 py-2 font-medium">${escapeHtml(customer.store_name)}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(customerTypeLabel(customer.customer_type))}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(customer.phone)}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(money(customer.outstanding_balance))}</td>
              <td class="border-b border-line px-3 py-2">
                <div class="flex gap-2">
                  <button type="button" data-edit-customer="${escapeHtml(customer.id)}" class="rounded-md border border-line bg-white px-2 py-1 text-xs transition-all duration-200 ease-in-out hover:bg-[#F9FAFB]">Edit</button>
                  <button type="button" data-delete-customer="${escapeHtml(customer.id)}" class="rounded-md border border-danger/40 bg-white px-2 py-1 text-xs text-danger transition-all duration-200 ease-in-out hover:bg-[#FEF2F2]">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.querySelectorAll('[data-edit-customer]').forEach((button) => {
    button.addEventListener('click', () => startCustomerEdit(button.dataset.editCustomer));
  });
  root.querySelectorAll('[data-delete-customer]').forEach((button) => {
    button.addEventListener('click', () => deleteCustomer(button.dataset.deleteCustomer));
  });
}

function resetCustomerForm() {
  $('#customerForm')?.reset();
  if ($('#customerId')) $('#customerId').value = '';
  if ($('#customerFormTitle')) $('#customerFormTitle').textContent = 'Customer';
  if ($('#customerBalance')) $('#customerBalance').value = '0';
  $('#cancelCustomerEdit')?.classList.add('hidden');
}

function startCustomerEdit(customerId) {
  const customer = masterCustomers.find((row) => String(row.id) === String(customerId));
  if (!customer) return;
  if ($('#customerId')) $('#customerId').value = customer.id;
  if ($('#customerType')) $('#customerType').value = customer.customer_type;
  if ($('#customerName')) $('#customerName').value = customer.store_name || '';
  if ($('#customerPhone')) $('#customerPhone').value = customer.phone || '';
  if ($('#customerBalance')) $('#customerBalance').value = Number(customer.outstanding_balance || 0);
  if ($('#customerAddress')) $('#customerAddress').value = customer.address || '';
  if ($('#customerFormTitle')) $('#customerFormTitle').textContent = 'Edit Customer';
  $('#cancelCustomerEdit')?.classList.remove('hidden');
}

async function deleteCustomer(customerId) {
  if (!window.confirm('Delete this customer and linked records?')) return;
  try {
    await apiDelete(`/customers/${customerId}`);
    toast('Customer deleted');
    resetCustomerForm();
    await Promise.all([loadDashboard(), loadCustomersPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Customer delete failed');
  }
}

async function loadSuppliersPanel() {
  const query = $('#supplierSearch')?.value || '';
  masterSuppliers = await api(pathWithQuery('/suppliers', query));
  const totalOutstanding = masterSuppliers.reduce((sum, row) => sum + Number(row.outstanding_balance || 0), 0);
  renderSummaryCards('supplierSummary', [
    { label: 'Suppliers', value: masterSuppliers.length.toLocaleString(locale), tone: 'good' },
    { label: 'Supplier Payable', value: money(totalOutstanding), tone: totalOutstanding > 0 ? 'warning' : 'normal' },
    { label: 'Primary Contacts', value: masterSuppliers.filter((row) => row.phone).length.toLocaleString(locale) },
  ]);
  renderSuppliersTable();
}

function renderSuppliersTable() {
  const root = $('#suppliersTable');
  if (!root) return;
  if (!masterSuppliers.length) {
    root.innerHTML = emptyState('No suppliers found.');
    return;
  }
  root.innerHTML = `
    <div class="overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Name</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Phone</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Outstanding</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${masterSuppliers.map((supplier, i) => `
            <tr class="${i % 2 ? 'bg-[#FAFAFA]' : ''} hover:bg-[#EFF6FF] transition-all duration-200 ease-in-out">
              <td class="border-b border-line px-3 py-2 font-medium">${escapeHtml(supplier.name)}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(supplier.phone)}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(money(supplier.outstanding_balance))}</td>
              <td class="border-b border-line px-3 py-2">
                <div class="flex gap-2">
                  <button type="button" data-edit-supplier="${escapeHtml(supplier.id)}" class="rounded-md border border-line bg-white px-2 py-1 text-xs transition-all duration-200 ease-in-out hover:bg-[#F9FAFB]">Edit</button>
                  <button type="button" data-delete-supplier="${escapeHtml(supplier.id)}" class="rounded-md border border-danger/40 bg-white px-2 py-1 text-xs text-danger transition-all duration-200 ease-in-out hover:bg-[#FEF2F2]">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.querySelectorAll('[data-edit-supplier]').forEach((button) => {
    button.addEventListener('click', () => startSupplierEdit(button.dataset.editSupplier));
  });
  root.querySelectorAll('[data-delete-supplier]').forEach((button) => {
    button.addEventListener('click', () => deleteSupplier(button.dataset.deleteSupplier));
  });
}

function resetSupplierForm() {
  $('#supplierForm')?.reset();
  if ($('#supplierId')) $('#supplierId').value = '';
  if ($('#supplierFormTitle')) $('#supplierFormTitle').textContent = 'Supplier';
  if ($('#supplierBalance')) $('#supplierBalance').value = '0';
  $('#cancelSupplierEdit')?.classList.add('hidden');
}

function startSupplierEdit(supplierId) {
  const supplier = masterSuppliers.find((row) => String(row.id) === String(supplierId));
  if (!supplier) return;
  if ($('#supplierId')) $('#supplierId').value = supplier.id;
  if ($('#supplierName')) $('#supplierName').value = supplier.name || '';
  if ($('#supplierPhone')) $('#supplierPhone').value = supplier.phone || '';
  if ($('#supplierBalance')) $('#supplierBalance').value = Number(supplier.outstanding_balance || 0);
  if ($('#supplierAddress')) $('#supplierAddress').value = supplier.address || '';
  if ($('#supplierFormTitle')) $('#supplierFormTitle').textContent = 'Edit Supplier';
  $('#cancelSupplierEdit')?.classList.remove('hidden');
}

async function deleteSupplier(supplierId) {
  if (!window.confirm('Delete this supplier and linked records?')) return;
  try {
    await apiDelete(`/suppliers/${supplierId}`);
    toast('Supplier deleted');
    resetSupplierForm();
    await Promise.all([loadDashboard(), loadSuppliersPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Supplier delete failed');
  }
}

function productParentOptions(selectedId = '', editingId = '') {
  const options = masterProducts.filter((product) => String(product.id) !== String(editingId));
  return [
    '<option value="">No parent</option>',
    ...options.map((product) => (
      `<option value="${escapeHtml(product.id)}" ${String(product.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(productLabel(product))}</option>`
    )),
  ].join('');
}

async function loadProductsPanel() {
  const query = $('#productSearch')?.value || '';
  masterProducts = await api(pathWithQuery('/products', query));
  const stockValue = masterProducts.reduce((sum, row) => sum + Number(row.stock_qty || 0) * Number(row.purchase_cost || 0), 0);
  const lowStockCount = masterProducts.filter((row) => Number(row.stock_qty || 0) <= Number(row.low_stock_limit || 0)).length;
  renderSummaryCards('productSummary', [
    { label: 'Products', value: masterProducts.length.toLocaleString(locale), tone: 'good' },
    { label: 'Stock Value', value: money(stockValue) },
    { label: 'Low Stock', value: lowStockCount.toLocaleString(locale), tone: lowStockCount ? 'danger' : 'normal' },
  ]);
  renderProductsTable();
  refreshProductParentSelect();
}

function refreshProductParentSelect() {
  const select = $('#productParent');
  if (!select) return;
  const selected = select.value;
  const editingId = $('#productId')?.value || '';
  select.innerHTML = productParentOptions(selected, editingId);
}

function renderProductsTable() {
  const root = $('#productsTable');
  if (!root) return;
  if (!masterProducts.length) {
    root.innerHTML = emptyState('No products found.');
    return;
  }
  root.innerHTML = `
    <div class="overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Product</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Category</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Variant</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Cost</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Price</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Stock</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${masterProducts.map((product, i) => {
            const low = Number(product.stock_qty || 0) <= Number(product.low_stock_limit || 0);
            const variant = [product.size, product.thickness].filter(Boolean).join(' / ');
            return `
              <tr class="${i % 2 ? 'bg-[#FAFAFA]' : ''} hover:bg-[#EFF6FF] transition-all duration-200 ease-in-out">
                <td class="border-b border-line px-3 py-2 font-medium">${escapeHtml(product.name)}</td>
                <td class="border-b border-line px-3 py-2">${escapeHtml(product.category)}</td>
                <td class="border-b border-line px-3 py-2">${escapeHtml(variant || '-')}</td>
                <td class="border-b border-line px-3 py-2">${escapeHtml(money(product.purchase_cost))}</td>
                <td class="border-b border-line px-3 py-2">${escapeHtml(money(product.selling_price))}</td>
                <td class="border-b border-line px-3 py-2 ${low ? 'font-semibold text-danger' : ''}">${escapeHtml(product.stock_qty)} / ${escapeHtml(product.low_stock_limit)}</td>
                <td class="border-b border-line px-3 py-2">
                  <div class="flex gap-2">
                    <button type="button" data-edit-product="${escapeHtml(product.id)}" class="rounded-md border border-line bg-white px-2 py-1 text-xs transition-all duration-200 ease-in-out hover:bg-[#F9FAFB]">Edit</button>
                    <button type="button" data-delete-product="${escapeHtml(product.id)}" class="rounded-md border border-danger/40 bg-white px-2 py-1 text-xs text-danger transition-all duration-200 ease-in-out hover:bg-[#FEF2F2]">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.querySelectorAll('[data-edit-product]').forEach((button) => {
    button.addEventListener('click', () => startProductEdit(button.dataset.editProduct));
  });
  root.querySelectorAll('[data-delete-product]').forEach((button) => {
    button.addEventListener('click', () => deleteProduct(button.dataset.deleteProduct));
  });
}

function resetProductForm() {
  $('#productForm')?.reset();
  if ($('#productId')) $('#productId').value = '';
  if ($('#productFormTitle')) $('#productFormTitle').textContent = 'Product';
  if ($('#productCost')) $('#productCost').value = '0';
  if ($('#productPrice')) $('#productPrice').value = '0';
  if ($('#productStock')) $('#productStock').value = '0';
  if ($('#productLowStock')) $('#productLowStock').value = '5';
  $('#cancelProductEdit')?.classList.add('hidden');
  refreshProductParentSelect();
}

function startProductEdit(productId) {
  const product = masterProducts.find((row) => String(row.id) === String(productId));
  if (!product) return;
  if ($('#productId')) $('#productId').value = product.id;
  if ($('#productName')) $('#productName').value = product.name || '';
  if ($('#productCategory')) $('#productCategory').value = product.category || '';
  if ($('#productSize')) $('#productSize').value = product.size || '';
  if ($('#productThickness')) $('#productThickness').value = product.thickness || '';
  if ($('#productCost')) $('#productCost').value = Number(product.purchase_cost || 0);
  if ($('#productPrice')) $('#productPrice').value = Number(product.selling_price || 0);
  if ($('#productStock')) $('#productStock').value = Number(product.stock_qty || 0);
  if ($('#productLowStock')) $('#productLowStock').value = Number(product.low_stock_limit || 0);
  if ($('#productFormTitle')) $('#productFormTitle').textContent = 'Edit Product';
  $('#cancelProductEdit')?.classList.remove('hidden');
  const parentSelect = $('#productParent');
  if (parentSelect) parentSelect.innerHTML = productParentOptions(product.parent_id || '', product.id);
}

async function deleteProduct(productId) {
  if (!window.confirm('Delete this product and linked item records?')) return;
  try {
    await apiDelete(`/products/${productId}`);
    toast('Product deleted');
    resetProductForm();
    await Promise.all([loadDashboard(), loadProductsPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Product delete failed');
  }
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
  lowStockItems = inv.items.filter((x) => Number(x.stock_qty) <= Number(x.low_stock_limit));
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
    ...saleProducts.map((p) => `<option value="${escapeHtml(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(productLabel(p))}</option>`),
  ].join('');
}

function addSaleItemRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'sale-item-row grid grid-cols-[minmax(0,1fr)_84px_112px_44px] gap-2 px-3 py-2';
  row.innerHTML = `
    <select required class="sale-product h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm">${saleProductOptions(item.product_id)}</select>
    <input required type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" class="sale-qty h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm" />
    <input required type="number" min="0.01" step="0.01" value="${escapeHtml(item.unit_price || '')}" class="sale-price h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm" />
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
      ? ['<option value="">Select customer</option>', ...saleCustomers.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.store_name)} (${escapeHtml(c.customer_type)})</option>`)].join('')
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

function purchaseProductOptions(selectedId = '') {
  if (!purchaseProducts.length) return '<option value="">No products found</option>';
  return [
    '<option value="">Select product</option>',
    ...purchaseProducts.map((p) => `<option value="${escapeHtml(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(productLabel(p))}</option>`),
  ].join('');
}

function addPurchaseItemRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'purchase-item-row grid grid-cols-[minmax(0,1fr)_84px_112px_44px] gap-2 px-3 py-2';
  row.innerHTML = `
    <select required class="purchase-product h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm">${purchaseProductOptions(item.product_id)}</select>
    <input required type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" class="purchase-qty h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm" />
    <input required type="number" min="0.01" step="0.01" value="${escapeHtml(item.unit_cost || '')}" class="purchase-cost h-10 min-w-0 rounded-md border border-line bg-white px-2 py-1 text-sm" />
    <button type="button" class="remove-purchase-item h-10 rounded-md border border-line bg-white text-sm transition-all duration-200 ease-in-out hover:bg-[#F9FAFB]">x</button>
  `;
  $('#purchaseItems')?.appendChild(row);
  row.querySelector('.purchase-product')?.addEventListener('change', (e) => {
    const product = purchaseProducts.find((p) => String(p.id) === e.target.value);
    if (product) row.querySelector('.purchase-cost').value = Number(product.purchase_cost || 0);
    updatePurchaseTotal();
  });
  row.querySelector('.purchase-qty')?.addEventListener('input', updatePurchaseTotal);
  row.querySelector('.purchase-cost')?.addEventListener('input', updatePurchaseTotal);
  row.querySelector('.remove-purchase-item')?.addEventListener('click', () => {
    row.remove();
    if (!document.querySelectorAll('.purchase-item-row').length) addPurchaseItemRow();
    updatePurchaseTotal();
  });
  updatePurchaseTotal();
}

function collectPurchaseItems() {
  return [...document.querySelectorAll('.purchase-item-row')].map((row) => ({
    product_id: Number(row.querySelector('.purchase-product')?.value),
    quantity: Number(row.querySelector('.purchase-qty')?.value),
    unit_cost: Number(row.querySelector('.purchase-cost')?.value),
  })).filter((x) => x.product_id && x.quantity > 0 && x.unit_cost > 0);
}

function updatePurchaseTotal() {
  const total = collectPurchaseItems().reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const totalEl = $('#purchaseTotal');
  if (totalEl) totalEl.textContent = money(total);
}

async function loadPurchaseLookups() {
  const [suppliers, inventory] = await Promise.all([api('/suppliers'), api('/inventory')]);
  purchaseSuppliers = suppliers;
  purchaseProducts = inventory.items || [];

  const supplierSelect = $('#purchaseSupplier');
  if (supplierSelect) {
    supplierSelect.innerHTML = purchaseSuppliers.length
      ? ['<option value="">Select supplier</option>', ...purchaseSuppliers.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)].join('')
      : '<option value="">No suppliers found</option>';
  }

  const rows = document.querySelectorAll('.purchase-item-row');
  if (!rows.length) {
    addPurchaseItemRow();
  } else {
    rows.forEach((row) => {
      const select = row.querySelector('.purchase-product');
      const selected = select?.value || '';
      if (select) select.innerHTML = purchaseProductOptions(selected);
    });
  }
}

async function loadPurchasesList() {
  const purchases = await api('/purchases');
  renderSimpleTable('purchasesTable', [
    { key: 'id', label: 'Purchase', render: (r) => `#${r.id}` },
    { key: 'supplier_id', label: 'Supplier', render: (r) => {
      const supplier = purchaseSuppliers.find((s) => Number(s.id) === Number(r.supplier_id));
      return supplier ? supplier.name : `#${r.supplier_id}`;
    } },
    { key: 'total_amount', label: 'Total', render: (r) => money(r.total_amount) },
  ], purchases.slice(0, 10));
}

async function loadPurchasesPanel() {
  await loadPurchaseLookups();
  await loadPurchasesList();
  updatePurchaseTotal();
}

function resetPurchaseForm() {
  $('#purchaseForm')?.reset();
  $('#purchaseItems').innerHTML = '';
  addPurchaseItemRow();
  updatePurchaseTotal();
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dateLabel(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(locale);
}

function employeeOptions(selectedId = '') {
  const activeEmployees = payrollEmployees.filter((employee) => employee.active);
  if (!activeEmployees.length) return '<option value="">No active employees found</option>';
  return [
    '<option value="">Select employee</option>',
    ...activeEmployees.map((employee) => (
      `<option value="${escapeHtml(employee.id)}" ${String(employee.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(employee.name)}${employee.role ? ` - ${escapeHtml(employee.role)}` : ''}</option>`
    )),
  ].join('');
}

function renderPayrollSummary(summary) {
  const cards = [
    { k: 'Active Employees', v: Number(summary.active_employees || 0).toLocaleString(locale) },
    { k: 'Monthly Salary Bill', v: money(summary.monthly_salary_total) },
    { k: 'Paid This Month', v: money(summary.paid_this_month), tone: 'warning' },
  ];

  $('#payrollSummary').innerHTML = cards.map((card) => `
    <div class="rounded-[12px] border border-line bg-card p-5 shadow-sm">
      <div class="text-xs text-[#6B7280]">${escapeHtml(card.k)}</div>
      <div class="mt-2 text-2xl font-bold ${card.tone === 'warning' ? 'text-warning' : 'text-ink'}">${escapeHtml(card.v)}</div>
    </div>
  `).join('');
}

function renderEmployeesTable() {
  const root = $('#employeesTable');
  if (!root) return;
  if (!payrollEmployees.length) {
    root.innerHTML = `<div class="p-3 text-sm text-[#6B7280]">No employees found.</div>`;
    return;
  }
  root.innerHTML = `
    <div class="overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Name</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Role</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Phone</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Salary</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Status</th>
            <th class="sticky top-0 border-b border-line bg-white px-3 py-2 text-left font-semibold text-[#6B7280]">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${payrollEmployees.map((employee, i) => `
            <tr class="${i % 2 ? 'bg-[#FAFAFA]' : ''} hover:bg-[#EFF6FF] transition-all duration-200 ease-in-out">
              <td class="border-b border-line px-3 py-2">${escapeHtml(employee.name)}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(employee.role)}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(employee.phone)}</td>
              <td class="border-b border-line px-3 py-2">${escapeHtml(money(employee.monthly_salary))}</td>
              <td class="border-b border-line px-3 py-2">${employee.active ? 'Active' : 'Inactive'}</td>
              <td class="border-b border-line px-3 py-2">
                <div class="flex gap-2">
                  <button type="button" data-edit-employee="${escapeHtml(employee.id)}" class="rounded-md border border-line bg-white px-2 py-1 text-xs transition-all duration-200 ease-in-out hover:bg-[#F9FAFB]">Edit</button>
                  ${employee.active ? `<button type="button" data-inactivate-employee="${escapeHtml(employee.id)}" class="rounded-md border border-danger/40 bg-white px-2 py-1 text-xs text-danger transition-all duration-200 ease-in-out hover:bg-[#FEF2F2]">Inactive</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.querySelectorAll('[data-edit-employee]').forEach((button) => {
    button.addEventListener('click', () => startEmployeeEdit(button.dataset.editEmployee));
  });
  root.querySelectorAll('[data-inactivate-employee]').forEach((button) => {
    button.addEventListener('click', () => inactivateEmployee(button.dataset.inactivateEmployee));
  });
}

function renderSalaryPaymentsTable(payments) {
  renderSimpleTable('salaryPaymentsTable', [
    { key: 'employee_name', label: 'Employee' },
    { key: 'payment_month', label: 'Month' },
    { key: 'amount', label: 'Amount', render: (row) => money(row.amount) },
    { key: 'created_at', label: 'Date', render: (row) => dateLabel(row.created_at) },
  ], payments);
}

async function loadPayrollPanel() {
  const [summary, employees, payments] = await Promise.all([
    api('/payroll/summary'),
    api('/employees'),
    api('/payroll/payments'),
  ]);
  payrollEmployees = employees;
  renderPayrollSummary(summary);
  renderEmployeesTable();
  renderSalaryPaymentsTable(payments);

  const employeeSelect = $('#salaryEmployee');
  if (employeeSelect) employeeSelect.innerHTML = employeeOptions(employeeSelect.value);
  if ($('#salaryMonth') && !$('#salaryMonth').value) $('#salaryMonth').value = currentMonthValue();
}

function resetEmployeeForm() {
  $('#employeeForm')?.reset();
  if ($('#employeeId')) $('#employeeId').value = '';
  if ($('#employeeFormTitle')) $('#employeeFormTitle').textContent = 'Employee';
  $('#cancelEmployeeEdit')?.classList.add('hidden');
  const salary = $('#employeeSalary');
  if (salary) salary.value = '0';
}

function startEmployeeEdit(employeeId) {
  const employee = payrollEmployees.find((row) => String(row.id) === String(employeeId));
  if (!employee) return;
  if ($('#employeeId')) $('#employeeId').value = employee.id;
  if ($('#employeeName')) $('#employeeName').value = employee.name || '';
  if ($('#employeeRole')) $('#employeeRole').value = employee.role || '';
  if ($('#employeePhone')) $('#employeePhone').value = employee.phone || '';
  if ($('#employeeSalary')) $('#employeeSalary').value = Number(employee.monthly_salary || 0);
  if ($('#employeeAddress')) $('#employeeAddress').value = employee.address || '';
  if ($('#employeeFormTitle')) $('#employeeFormTitle').textContent = 'Edit Employee';
  $('#cancelEmployeeEdit')?.classList.remove('hidden');
}

async function inactivateEmployee(employeeId) {
  try {
    await apiDelete(`/employees/${employeeId}`);
    toast('Employee marked inactive');
    await loadPayrollPanel();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Employee update failed');
  }
}

function resetSalaryPaymentForm() {
  $('#salaryPaymentForm')?.reset();
  if ($('#salaryMonth')) $('#salaryMonth').value = currentMonthValue();
}

function fillSalaryAmountFromEmployee() {
  const employeeId = $('#salaryEmployee')?.value;
  const employee = payrollEmployees.find((row) => String(row.id) === String(employeeId));
  const amountInput = $('#salaryAmount');
  if (employee && amountInput) amountInput.value = Number(employee.monthly_salary || 0).toFixed(2);
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
  updatePurchaseTotal();
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

$('#refreshPurchases')?.addEventListener('click', () => {
  loadPurchasesPanel().catch((e) => {
    console.error(e);
    toast('Purchases failed to refresh');
  });
});

$('#addPurchaseItem')?.addEventListener('click', () => addPurchaseItemRow());

$('#purchaseForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = collectPurchaseItems();
  if (!items.length) {
    toast('Add at least one purchase item');
    return;
  }
  const payload = {
    supplier_id: Number($('#purchaseSupplier')?.value),
    purchase_date: $('#purchaseDate')?.value || null,
    items,
  };
  if (!payload.supplier_id) {
    toast('Select a supplier');
    return;
  }

  try {
    await apiPost('/purchases', payload);
    toast('Purchase saved');
    resetPurchaseForm();
    await Promise.all([loadDashboard(), loadPurchasesPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Purchase failed');
  }
});

let customerSearchTimer;
$('#customerSearch')?.addEventListener('input', () => {
  clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => {
    loadCustomersPanel().catch((e) => {
      console.error(e);
      toast('Customer search failed');
    });
  }, 250);
});

$('#refreshCustomers')?.addEventListener('click', () => {
  loadCustomersPanel().catch((e) => {
    console.error(e);
    toast('Customers failed to refresh');
  });
});

$('#customerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const customerId = $('#customerId')?.value;
  const name = $('#customerName')?.value.trim();
  const balance = Number($('#customerBalance')?.value || 0);
  if (!name) {
    toast('Enter customer name');
    return;
  }
  if (balance < 0) {
    toast('Customer balance cannot be negative');
    return;
  }
  const basePayload = {
    customer_type: $('#customerType')?.value || 'retail',
    store_name: name,
    phone: $('#customerPhone')?.value.trim() || '',
    address: $('#customerAddress')?.value.trim() || '',
  };
  const payload = customerId
    ? { ...basePayload, outstanding_balance: balance }
    : { ...basePayload, opening_balance: balance };

  try {
    if (customerId) {
      await apiPut(`/customers/${customerId}`, payload);
    } else {
      await apiPost('/customers', payload);
    }
    toast('Customer saved');
    resetCustomerForm();
    await Promise.all([loadDashboard(), loadCustomersPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Customer save failed');
  }
});

$('#cancelCustomerEdit')?.addEventListener('click', resetCustomerForm);

let supplierSearchTimer;
$('#supplierSearch')?.addEventListener('input', () => {
  clearTimeout(supplierSearchTimer);
  supplierSearchTimer = setTimeout(() => {
    loadSuppliersPanel().catch((e) => {
      console.error(e);
      toast('Supplier search failed');
    });
  }, 250);
});

$('#refreshSuppliers')?.addEventListener('click', () => {
  loadSuppliersPanel().catch((e) => {
    console.error(e);
    toast('Suppliers failed to refresh');
  });
});

$('#supplierForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const supplierId = $('#supplierId')?.value;
  const name = $('#supplierName')?.value.trim();
  const balance = Number($('#supplierBalance')?.value || 0);
  if (!name) {
    toast('Enter supplier name');
    return;
  }
  if (balance < 0) {
    toast('Supplier balance cannot be negative');
    return;
  }
  const basePayload = {
    name,
    phone: $('#supplierPhone')?.value.trim() || '',
    address: $('#supplierAddress')?.value.trim() || '',
  };
  const payload = supplierId
    ? { ...basePayload, outstanding_balance: balance }
    : { ...basePayload, opening_balance: balance };

  try {
    if (supplierId) {
      await apiPut(`/suppliers/${supplierId}`, payload);
    } else {
      await apiPost('/suppliers', payload);
    }
    toast('Supplier saved');
    resetSupplierForm();
    await loadSuppliersPanel();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Supplier save failed');
  }
});

$('#cancelSupplierEdit')?.addEventListener('click', resetSupplierForm);

let productSearchTimer;
$('#productSearch')?.addEventListener('input', () => {
  clearTimeout(productSearchTimer);
  productSearchTimer = setTimeout(() => {
    loadProductsPanel().catch((e) => {
      console.error(e);
      toast('Product search failed');
    });
  }, 250);
});

$('#refreshProducts')?.addEventListener('click', () => {
  loadProductsPanel().catch((e) => {
    console.error(e);
    toast('Products failed to refresh');
  });
});

$('#productForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const productId = $('#productId')?.value;
  const name = $('#productName')?.value.trim();
  if (!name) {
    toast('Enter product name');
    return;
  }
  const payload = {
    parent_id: $('#productParent')?.value ? Number($('#productParent')?.value) : null,
    name,
    category: $('#productCategory')?.value.trim() || '',
    size: $('#productSize')?.value.trim() || '',
    thickness: $('#productThickness')?.value.trim() || '',
    purchase_cost: Number($('#productCost')?.value || 0),
    selling_price: Number($('#productPrice')?.value || 0),
    stock_qty: Number($('#productStock')?.value || 0),
    low_stock_limit: Number($('#productLowStock')?.value || 0),
  };
  if ([payload.purchase_cost, payload.selling_price, payload.stock_qty, payload.low_stock_limit].some((value) => value < 0)) {
    toast('Product numbers cannot be negative');
    return;
  }

  try {
    if (productId) {
      await apiPut(`/products/${productId}`, payload);
    } else {
      await apiPost('/products', payload);
    }
    toast('Product saved');
    resetProductForm();
    await Promise.all([loadDashboard(), loadProductsPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Product save failed');
  }
});

$('#cancelProductEdit')?.addEventListener('click', resetProductForm);

$('#refreshPayroll')?.addEventListener('click', () => {
  loadPayrollPanel().catch((e) => {
    console.error(e);
    toast('Payroll failed to refresh');
  });
});

$('#employeeForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const employeeId = $('#employeeId')?.value;
  const existingEmployee = payrollEmployees.find((row) => String(row.id) === String(employeeId));
  const payload = {
    name: $('#employeeName')?.value.trim(),
    role: $('#employeeRole')?.value.trim() || '',
    phone: $('#employeePhone')?.value.trim() || '',
    address: $('#employeeAddress')?.value.trim() || '',
    monthly_salary: Number($('#employeeSalary')?.value || 0),
    active: existingEmployee ? Boolean(existingEmployee.active) : true,
  };
  if (!payload.name) {
    toast('Enter employee name');
    return;
  }

  try {
    if (employeeId) {
      await apiPut(`/employees/${employeeId}`, payload);
    } else {
      await apiPost('/employees', payload);
    }
    toast('Employee saved');
    resetEmployeeForm();
    await loadPayrollPanel();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Employee save failed');
  }
});

$('#cancelEmployeeEdit')?.addEventListener('click', resetEmployeeForm);

$('#salaryEmployee')?.addEventListener('change', fillSalaryAmountFromEmployee);

$('#salaryPaymentForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    employee_id: Number($('#salaryEmployee')?.value),
    payment_month: $('#salaryMonth')?.value || '',
    payment_date: $('#salaryPaymentDate')?.value || null,
    amount: Number($('#salaryAmount')?.value || 0),
    notes: $('#salaryNotes')?.value.trim() || '',
  };
  if (!payload.employee_id) {
    toast('Select an employee');
    return;
  }
  if (payload.amount <= 0) {
    toast('Enter salary amount');
    return;
  }

  try {
    await apiPost('/payroll/payments', payload);
    toast('Salary payment recorded');
    resetSalaryPaymentForm();
    await Promise.all([loadDashboard(), loadPayrollPanel()]);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Salary payment failed');
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
