const $ = (q) => document.querySelector(q);
const locale = navigator.language || 'en-IN';
const currency = locale.includes('en-IN') || locale.includes('hi') ? 'INR' : 'USD';
const money = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n || 0));

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
    { k: 'Low Stock', v: d.low_stock_alerts, t: d.low_stock_alerts > 0 ? 'danger' : 'normal', currency: false },
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

  const tx = await api('/transactions/recent');
  renderSimpleTable('recentTransactions', [
    { key: 'type', label: 'Type' },
    { key: 'customer', label: 'Customer' },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleString(locale) },
  ], tx);
}

loadDashboard().catch((e) => {
  console.error(e);
  toast('Dashboard failed to load');
});
