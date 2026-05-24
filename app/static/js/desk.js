const $ = (q) => document.querySelector(q);
const locale = 'en-IN';
const getCurrency = () => localStorage.getItem('erp_currency') || 'INR';
const money = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency: getCurrency(), maximumFractionDigits: 0 }).format(Number(n || 0));
let lowStockItems = [];

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

function applyTheme() {
  const dark = localStorage.getItem('erp_theme') === 'dark';
  const body = document.body;
  if (dark) {
    body.classList.add('dark');
    body.classList.remove('bg-bg', 'text-ink');
    body.style.backgroundColor = '#111827';
    body.style.color = '#F9FAFB';
  } else {
    body.classList.remove('dark');
    body.classList.add('bg-bg', 'text-ink');
    body.style.backgroundColor = '';
    body.style.color = '';
  }
}

function bindNavigation() {
  const items = document.querySelectorAll('.nav-item[data-panel]');
  const panels = document.querySelectorAll('.panel');
  const setPanel = (name) => {
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
  };
  items.forEach((i) => i.addEventListener('click', () => setPanel(i.dataset.panel)));
  setPanel('dashboard');
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

$('#darkThemeToggle')?.addEventListener('change', (e) => {
  localStorage.setItem('erp_theme', e.target.checked ? 'dark' : 'light');
  applyTheme();
});

$('#currencySelect')?.addEventListener('change', async (e) => {
  localStorage.setItem('erp_currency', e.target.value);
  await loadDashboard();
});

function initSettings() {
  const dark = localStorage.getItem('erp_theme') === 'dark';
  const darkToggle = $('#darkThemeToggle');
  if (darkToggle) darkToggle.checked = dark;
  const currency = getCurrency();
  const currencySelect = $('#currencySelect');
  if (currencySelect) currencySelect.value = currency;
}

applyTheme();
bindNavigation();
initSettings();
