const $ = (q) => document.querySelector(q);
const fmt = (n) => Number(n || 0).toLocaleString();
let editingProductId = null;

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
  const q = ($("#customerSearch") && $("#customerSearch").value.trim()) || "";
  const rows = await api(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  $("#customersTable").innerHTML = table(
    ["Store", "Type", "Phone", "Balance"],
    rows.map((x) => [x.store_name, x.customer_type, x.phone, `₹${fmt(x.outstanding_balance)}`])
  );
  const customerSelect = $("#saleCustomer");
  if (customerSelect) {
    customerSelect.innerHTML = `<option value="">Customer</option>${rows
      .map((x) => `<option value="${x.id}">${x.store_name}</option>`)
      .join("")}`;
  }
}

async function loadSuppliers() {
  const rows = await api("/suppliers");
  $("#suppliersTable").innerHTML = table(
    ["ID", "Name", "Phone", "Due"],
    rows.map((x) => [x.id, x.name, x.phone, fmt(x.outstanding_balance)])
  );
  const supplierSelect = $("#purchaseSupplier");
  if (supplierSelect) {
    supplierSelect.innerHTML = `<option value="">Supplier</option>${rows
      .map((x) => `<option value="${x.id}">${x.name}</option>`)
      .join("")}`;
  }
}

async function loadProducts(q = "") {
  const rows = await api(`/products${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  $("#productsTable").innerHTML = table(
    ["Name", "Category", "Size", "Thickness", "Stock", "Actions"],
    rows.map((x) => [
      x.name,
      x.category || "",
      x.size,
      x.thickness,
      x.stock_qty,
      `<button class="edit-product" data-id="${x.id}">Edit</button> <button class="danger delete-product" data-id="${x.id}">Delete</button>`,
    ])
  );
  const productSelect = $("#purchaseProduct");
  if (productSelect) {
    productSelect.innerHTML = `<option value="">Product</option>${rows
      .map((x) => `<option value="${x.id}">${x.name}</option>`)
      .join("")}`;
  }
  const saleProduct = $("#saleProduct");
  if (saleProduct) {
    saleProduct.innerHTML = `<option value="">Product</option>${rows
      .map((x) => `<option value="${x.id}">${x.name}</option>`)
      .join("")}`;
  }
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

  const low = inv.items.filter((x) => Number(x.stock_qty) < Number(x.low_stock_limit));
  $("#lowStockWarnings").innerHTML = low.length
    ? low
        .map(
          (x) =>
            `<div class="warn-item">Low stock warning: ${x.name} (Stock: ${x.stock_qty}, Minimum: ${x.low_stock_limit})</div>`
        )
        .join("")
    : "";

  $("#inventoryTable").innerHTML = table(
    ["Name", "Stock", "Stock Value"],
    inv.items.map((x) => [x.name, x.stock_qty, `₹${fmt(Number(x.stock_qty) * Number(x.purchase_cost))}`])
  );
}

async function loadDaybook() {
  const days = await api("/daybook/feed");
  $("#daybookTable").innerHTML = `<div class="daybook-feed">${days
    .map(
      (d) => `
      <div class="day-group">
        <div class="day-title">${d.date}</div>
        ${d.entries
          .map(
            (e) => `
          <div class="day-entry">
            <div class="entry-type">${e.type}</div>
            <div>${e.line}</div>
          </div>
        `
          )
          .join("")}
      </div>
    `
    )
    .join("")}</div>`;
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
    $("#customerModal").classList.add("hidden");
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
      category: b.category || "",
      size: b.size,
      thickness: b.thickness,
      purchase_cost: Number(b.purchase_cost),
      selling_price: Number(b.selling_price),
      low_stock_limit: 5,
      stock_qty: Number(b.stock_qty || 0),
    };
    if (editingProductId) {
      await api(`/products/${editingProductId}`, { method: "PUT", body: JSON.stringify(body) });
      toast("Product updated");
    } else {
      await api("/products", { method: "POST", body: JSON.stringify(body) });
      toast("Product added");
    }
    editingProductId = null;
    $("#productModalTitle").textContent = "Add Product";
    $("#productModal").classList.add("hidden");
    e.target.reset();
    await loadProducts();
    await loadInventory();
  });

  $("#purchaseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    const body = {
      supplier_id: Number(b.supplier_id),
      purchase_date: b.purchase_date,
      items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_cost: Number(b.unit_cost) }],
    };
    await api("/purchases", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    $("#purchaseModal").classList.add("hidden");
    toast("Purchase recorded");
    await Promise.all([loadPurchases(), loadInventory(), loadDashboard(), loadProducts(), loadSuppliers()]);
  });

  $("#saleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = formDataToJson(e.target);
    const body = {
      customer_id: Number(b.customer_id),
      payment_type: b.payment_type,
      sale_date: b.sale_date,
      paid_amount: Number(b.paid_amount || 0),
      items: [{ product_id: Number(b.product_id), quantity: Number(b.quantity), unit_price: Number(b.unit_price) }],
    };
    await api("/sales", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    $("#saleModal").classList.add("hidden");
    toast("Sale created");
    await Promise.all([loadSales(), loadInventory(), loadDashboard(), loadProducts(), loadCustomers()]);
  });
}

function bindProductsUi() {
  $("#openProductModal").addEventListener("click", () => {
    editingProductId = null;
    $("#productModalTitle").textContent = "Add Product";
    $("#productForm").reset();
    $("#productModal").classList.remove("hidden");
  });
  $("#closeProductModal").addEventListener("click", () => $("#productModal").classList.add("hidden"));

  $("#productSearch").addEventListener("input", async (e) => {
    await loadProducts(e.target.value.trim());
  });

  $("#productsTable").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.classList.contains("delete-product")) {
      if (!confirm("Delete this product?")) return;
      try {
        await api(`/products/${id}`, { method: "DELETE" });
        toast("Product deleted");
      } catch (err) {
        toast("Delete blocked (stock/history)");
      }
      await Promise.all([loadProducts($("#productSearch").value.trim()), loadInventory()]);
      return;
    }
    if (btn.classList.contains("edit-product")) {
      const row = await api(`/products/${id}`);
      if (!row) return;
      editingProductId = id;
      $("#productModalTitle").textContent = "Edit Product";
      const form = $("#productForm");
      form.name.value = row.name;
      form.category.value = row.category || "";
      form.size.value = row.size || "";
      form.thickness.value = row.thickness || "";
      form.purchase_cost.value = row.purchase_cost;
      form.selling_price.value = row.selling_price;
      form.stock_qty.value = row.stock_qty;
      $("#productModal").classList.remove("hidden");
    }
  });
}

function bindCustomersUi() {
  $("#openCustomerModal").addEventListener("click", () => {
    $("#customerForm").reset();
    $("#customerModal").classList.remove("hidden");
  });
  $("#closeCustomerModal").addEventListener("click", () => $("#customerModal").classList.add("hidden"));
  $("#customerSearch").addEventListener("input", async () => {
    await loadCustomers();
  });
}

function bindPurchasesUi() {
  $("#openPurchaseModal").addEventListener("click", async () => {
    const today = new Date().toISOString().slice(0, 10);
    $("#purchaseDate").value = today;
    await Promise.all([loadSuppliers(), loadProducts()]);
    $("#purchaseModal").classList.remove("hidden");
  });
  $("#closePurchaseModal").addEventListener("click", () => $("#purchaseModal").classList.add("hidden"));
}

function bindSalesUi() {
  $("#openSaleModal").addEventListener("click", async () => {
    const today = new Date().toISOString().slice(0, 10);
    $("#saleDate").value = today;
    await Promise.all([loadCustomers(), loadProducts()]);
    $("#saleModal").classList.remove("hidden");
  });
  $("#closeSaleModal").addEventListener("click", () => $("#saleModal").classList.add("hidden"));
}

async function boot() {
  bindNav();
  bindForms();
  bindProductsUi();
  bindCustomersUi();
  bindPurchasesUi();
  bindSalesUi();
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
