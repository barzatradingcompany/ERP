const $ = (q) => document.querySelector(q);
const fmt = (n) => Number(n || 0).toLocaleString();

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1700);
}

function table(headers, rows) {
  const thead = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Failed ${path}`);
  }
  return res.json();
}

function bindNav() {
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      document.getElementById(b.dataset.panel).classList.add("active");
    });
  });

  $("#globalSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const btns = [...document.querySelectorAll(".nav-item")];
    const hit = btns.find((b) => b.textContent.toLowerCase().includes(q));
    if (hit && q.length > 0) hit.click();
  });
}

async function loadDashboard() {
  const d = await api("/dashboard");
  const map = [
    ["Today Sales", d.todays_sales],
    ["Month Sales", d.monthly_sales],
    ["Customer Due", d.outstanding_customer_balances],
    ["Stock Value", d.stock_value],
    ["Cash In Today", d.cash_received_today],
    ["Cash Out Today", d.cash_paid_today],
    ["Low Stock", d.low_stock_alerts],
  ];
  $("#kpiGrid").innerHTML = map.map(([k, v]) => `<div class="kpi"><div class="label">${k}</div><div class="value">${fmt(v)}</div></div>`).join("");
}

async function loadCustomers() {
  const rows = await api("/customers");
  $("#customersTable").innerHTML = table(
    ["ID", "Type", "Store", "Phone", "Due"],
    rows.map((x) => [x.id, x.customer_type, x.store_name, x.phone, fmt(x.outstanding_balance)])
  );
}

async function loadSuppliers() {
  const rows = await api("/suppliers");
  $("#suppliersTable").innerHTML = table(
    ["ID", "Name", "Phone", "Due"],
    rows.map((x) => [x.id, x.name, x.phone, fmt(x.outstanding_balance)])
  );
}

async function loadProducts() {
  const rows = await api("/products");
  $("#productsTable").innerHTML = table(
    ["ID", "Name", "Size", "Thk", "Buy", "Sell", "Stock"],
    rows.map((x) => [x.id, x.name, x.size, x.thickness, fmt(x.purchase_cost), fmt(x.selling_price), x.stock_qty])
  );
}

async function loadPurchases() {
  const rows = await api("/purchases");
  $("#purchasesTable").innerHTML = table(
    ["ID", "Supplier", "Total", "Date"],
    rows.map((x) => [x.id, x.supplier_id, fmt(x.total_amount), x.created_at])
  );
}

async function loadSales() {
  const rows = await api("/sales");
  $("#salesTable").innerHTML = table(
    ["ID", "Customer", "Type", "Total", "Paid", "Due", "Date"],
    rows.map((x) => [x.id, x.customer_id, x.payment_type, fmt(x.total_amount), fmt(x.paid_amount), fmt(x.due_amount), x.created_at])
  );
}

async function loadInventory() {
  const inv = await api("/inventory");
  $("#inventorySummary").innerHTML = [
    ["Stock Value", fmt(inv.summary.stock_value)],
    ["Low Stock Items", inv.summary.low_stock_count],
    ["Total Products", inv.summary.total_products],
  ].map(([k, v]) => `<div class="mini-card"><div>${k}</div><strong>${v}</strong></div>`).join("");

  $("#inventoryTable").innerHTML = table(
    ["ID", "Product", "Stock", "Low Limit"],
    inv.items.map((x) => [x.id, x.name, x.stock_qty, x.low_stock_limit])
  );
}

async function loadDaybook() {
  const rows = await api("/daybook");
  $("#daybookTable").innerHTML = table(
    ["Time", "Event", "Narration", "Sales", "Purchase", "Cash In", "Cash Out"],
    rows.map((x) => [x.created_at, x.event_type, x.narration, fmt(x.sales_amount), fmt(x.purchase_amount), fmt(x.cash_in), fmt(x.cash_out)])
  );
}

function formDataToJson(form) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

function bindForms() {
  $("#customerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = formDataToJson(e.target);
    body.opening_balance = 0;
    await api("/customers", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    toast("Customer added");
    await loadCustomers();
    await loadDashboard();
  });

  $("#supplierForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = formDataToJson(e.target);
    body.opening_balance = 0;
    await api("/suppliers", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    toast("Supplier added");
    await loadSuppliers();
  });

  $("#productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    const body = {
      name: b.name,
      size: b.size,
      thickness: b.thickness,
      purchase_cost: Number(b.purchase_cost),
      selling_price: Number(b.selling_price),
      low_stock_limit: Number(b.low_stock_limit || 5),
      stock_qty: 0,
    };
    await api("/products", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    toast("Product added");
    await loadProducts();
    await loadInventory();
  });

  $("#purchaseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    const body = {
      supplier_id: Number(b.supplier_id),
      items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_cost: Number(b.unit_cost) }],
    };
    await api("/purchases", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    toast("Purchase recorded");
    await Promise.all([loadPurchases(), loadInventory(), loadDashboard(), loadProducts()]);
  });

  $("#saleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    const body = {
      customer_id: Number(b.customer_id),
      payment_type: b.payment_type,
      paid_amount: Number(b.paid_amount || 0),
      items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_price: Number(b.unit_price) }],
    };
    await api("/sales", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    toast("Sale created");
    await Promise.all([loadSales(), loadInventory(), loadDashboard(), loadProducts(), loadCustomers()]);
  });
}

async function boot() {
  bindNav();
  bindForms();
  await Promise.all([
    loadDashboard(),
    loadCustomers(),
    loadSuppliers(),
    loadProducts(),
    loadPurchases(),
    loadSales(),
    loadInventory(),
    loadDaybook(),
  ]);
}

boot().catch((e) => {
  console.error(e);
  toast("Failed to load data");
});
