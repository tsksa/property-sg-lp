// "What did flats in your block sell for?" — the estimate-first widget (JOE-392).
//
// Progressive enhancement over a plain GET form to /neighbour-prices/: without
// JavaScript the visitor still reaches the full sold-prices page. With it, every
// `[data-jt-estimate]` root looks the postal code up on OneMap, pulls the block's
// and street's HDB resale transactions from data.gov.sg (both public and
// CORS-enabled, the same sources /neighbour-prices/ has used since launch) and
// shows an indicative range on the page, before any contact details are asked.
//
// The host page decides what "Get Joe's valuation" does: the widget dispatches a
// bubbling `jte:valuation` CustomEvent with the lookup context.
//
// All API data is rendered with textContent and createElement; no response is
// ever parsed as HTML.

import {
  abbrevRoad, normalisePostal, flatTypesByVolume, summarise, netProceeds, basisLabel, PROCEEDS_DEFAULTS,
} from './block-estimate-core.mjs';

const DATASET_ID = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const DATA_API = 'https://data.gov.sg/api/action/datastore_search';
const ONEMAP_API = 'https://www.onemap.gov.sg/api/common/elastic/search';
const FIELDS = 'month,town,flat_type,block,street_name,storey_range,floor_area_sqm,resale_price';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const money = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-SG')}` : '—');
const fmtMonth = (m) => { const [y, mo] = String(m).split('-'); return MONTHS[Number(mo) - 1] ? `${MONTHS[Number(mo) - 1]} ${y}` : String(m); };
const titleCase = (s) => String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bAve\b/g, 'Ave');
const flatLabel = (t) => titleCase(String(t).replace(' ROOM', '-room'));

function track(name, params) {
  try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch { /* analytics never blocks the page */ }
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// data.gov.sg answers bursts with 429; a lookup makes up to three calls in a
// row, so back off and retry twice before giving up.
async function fetchJSON(url, timeoutMs = 12000, retries = 2) {
  for (let attempt = 0; ; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 429 && attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

async function lookupAddress(code) {
  const data = await fetchJSON(`${ONEMAP_API}?searchVal=${encodeURIComponent(code)}&returnGeom=N&getAddrDetails=Y&pageNum=1`);
  const r = data?.results?.[0];
  if (!r || !r.ROAD_NAME) return null;
  return { block: String(r.BLK_NO || '').trim(), road: String(r.ROAD_NAME).trim(), building: r.BUILDING && r.BUILDING !== 'NIL' ? String(r.BUILDING) : '' };
}

async function queryTransactions(filters, limit) {
  const url = `${DATA_API}?resource_id=${DATASET_ID}&filters=${encodeURIComponent(JSON.stringify(filters))}&fields=${FIELDS}&sort=${encodeURIComponent('month desc')}&limit=${limit}`;
  const data = await fetchJSON(url);
  if (!data || data.success !== true || !data.result) throw new Error('bad response');
  return data.result.records || [];
}

async function fetchSales(addr) {
  if (!addr.block) return { road: abbrevRoad(addr.road), block: [], street: [] };
  const road = abbrevRoad(addr.road);
  let usedRoad = road;
  let block = await queryTransactions({ block: addr.block, street_name: road }, 200);
  if (!block.length && addr.road.toUpperCase() !== road) {
    const alt = await queryTransactions({ block: addr.block, street_name: addr.road.toUpperCase() }, 200);
    if (alt.length) { block = alt; usedRoad = addr.road.toUpperCase(); }
  }
  const street = await queryTransactions({ street_name: usedRoad }, 600);
  return { road: usedRoad, block, street };
}

function salesTable(records) {
  const head = el('tr', {}, ...['Sold', 'Flat', 'Storey', 'Price'].map((h) => el('th', { scope: 'col', text: h })));
  const rows = records.map((r) => el('tr', {},
    el('td', { text: fmtMonth(r.month) }),
    el('td', { text: flatLabel(r.flat_type) }),
    el('td', { text: String(r.storey_range || '').replace(/\s*TO\s*/i, '–') }),
    el('td', { class: 'jte-num', text: money(Number(r.resale_price)) }),
  ));
  return el('div', { class: 'jte-table-wrap', role: 'region', 'aria-label': 'Most recent sales', tabindex: '0' },
    el('table', { class: 'jte-table' }, el('caption', { class: 'jte-sr', text: 'Most recent sales' }), el('thead', {}, head), el('tbody', {}, rows)));
}

function proceedsPanel(defaultPrice, idPrefix) {
  const field = (id, label, value, help, attrs = {}) => el('div', { class: 'jte-field' },
    el('label', { for: `${idPrefix}-${id}`, text: label }),
    el('input', { id: `${idPrefix}-${id}`, class: 'jte-input', type: 'number', inputmode: 'numeric', min: '0', step: attrs.step || '1000', value: String(value), 'aria-describedby': help ? `${idPrefix}-${id}-help` : null }),
    help ? el('p', { class: 'jte-help', id: `${idPrefix}-${id}-help`, text: help }) : null);
  const out = el('output', { class: 'jte-proceeds-out', for: ['price', 'loan', 'cpf', 'rate'].map((k) => `${idPrefix}-${k}`).join(' ') });
  const breakdown = el('p', { class: 'jte-help' });
  const panel = el('div', { class: 'jte-proceeds', role: 'group', 'aria-label': 'What you would walk away with' },
    el('h4', { text: 'What would I walk away with?' }),
    el('div', { class: 'jte-fields' },
      field('price', 'Sale price', defaultPrice, 'Starts at the middle of the range above.'),
      field('loan', 'Outstanding home loan', 0, 'HDB or bank loan still owed.'),
      field('cpf', 'CPF refund', 0, 'CPF used for the flat plus accrued interest. Your CPF statement shows it.'),
      field('rate', 'Agent commission %', PROCEEDS_DEFAULTS.commissionRate, 'Plus 9% GST.', { step: '0.1' })),
    el('p', { class: 'jte-proceeds-label', text: 'Estimated cash to your bank' }), out, breakdown,
    el('p', { class: 'jte-help' }, 'Includes about $2,500 legal fees and the $80 HDB fee. Rough figures only: see ',
      el('a', { href: '/insights/selling-hdb-after-mop-singapore.html', text: 'how net proceeds work' }), '.'));
  const inputs = ['price', 'loan', 'cpf', 'rate'].map((k) => panel.querySelector(`#${idPrefix}-${k}`));
  const update = () => {
    const [salePrice, outstandingLoan, cpfRefund, commissionRate] = inputs.map((i) => Number(i.value) || 0);
    try {
      const r = netProceeds({ salePrice, outstandingLoan, cpfRefund, commissionRate });
      out.textContent = money(r.cash);
      out.classList.toggle('is-negative', r.cash < 0);
      breakdown.textContent = `Commission with GST ${money(r.commission)} · total deductions ${money(r.deductions)}.${r.cash < 0 ? ' The sale would not cover the loan and CPF refund; talk to Joe before listing.' : ''}`;
    } catch {
      out.textContent = '—';
      breakdown.textContent = 'Enter amounts of zero or more, and a commission rate of 10% or less.';
    }
  };
  inputs.forEach((i) => i.addEventListener('input', update));
  update();
  return panel;
}

function renderResult(root, state) {
  const { addr, sales, flatType, postal } = state;
  const result = root.querySelector('.jte-result');
  result.textContent = '';
  const roadLabel = titleCase(addr.road);
  const types = flatTypesByVolume(sales.block.length ? sales.block : sales.street);
  const s = summarise({ blockRecords: sales.block, streetRecords: sales.street, flatType });
  const idPrefix = `${root.id || 'jte'}-p`;

  const heading = el('h3', { class: 'jte-address', tabindex: '-1', text: addr.block ? `Blk ${addr.block} ${roadLabel}` : roadLabel });
  result.append(heading);
  const town = (sales.block[0] || sales.street[0])?.town;
  if (town) result.append(el('p', { class: 'jte-town', text: titleCase(town) }));

  if (types.length > 1) {
    result.append(el('div', { class: 'jte-types', role: 'group', 'aria-label': 'Flat type' },
      types.slice(0, 5).map((t) => el('button', {
        type: 'button', class: 'jte-type', 'aria-pressed': String(t === flatType), text: flatLabel(t),
        onclick: () => { renderResult(root, { ...state, flatType: t }); root.querySelector('.jte-address')?.focus({ preventScroll: true }); },
      }))));
  }

  if (s.range) {
    result.append(el('div', { class: 'jte-range' },
      el('p', { class: 'jte-range-label', text: `Indicative range, ${flatLabel(flatType)}` }),
      el('p', { class: 'jte-range-value', text: `${money(s.range.low)} – ${money(s.range.high)}` }),
      el('p', { class: 'jte-help', text: `${basisLabel(s.range, roadLabel)} Not a valuation: floor, condition and remaining lease move the price.` })));
  } else {
    result.append(el('p', { class: 'jte-help', text: `Too few recent ${flatLabel(flatType)} sales here for a fair range. The latest sales are below, and Joe can value it from wider comparisons.` }));
  }

  const stats = el('dl', { class: 'jte-stats' });
  const stat = (k, v) => stats.append(el('div', {}, el('dt', { text: k }), el('dd', { text: v })));
  if (s.range) stat('Median', money(s.range.median));
  if (s.change !== null) stat('12-month change', `${s.change > 0 ? '+' : ''}${s.change}%`);
  if (s.latest) stat('Latest sale', `${money(Number(s.latest.resale_price))} · ${fmtMonth(s.latest.month)}`);
  if (stats.childElementCount) result.append(stats);
  if (s.recent.length) result.append(salesTable(s.recent));

  const valuationBtn = el('button', {
    type: 'button', class: 'jte-primary', text: "Get Joe's valuation",
    onclick: () => {
      track('estimate_cta', { cta: 'valuation', flat_type: flatType });
      root.dispatchEvent(new CustomEvent('jte:valuation', { bubbles: true, detail: { postal, block: addr.block, road: addr.road, flatType, propType: 'HDB', range: s.range } }));
    },
  });
  let panel = null;
  const proceedsBtn = el('button', {
    type: 'button', class: 'jte-secondary', 'aria-expanded': 'false', 'aria-controls': `${idPrefix}-panel`, text: 'What would I walk away with?',
    onclick: () => {
      const open = proceedsBtn.getAttribute('aria-expanded') !== 'true';
      proceedsBtn.setAttribute('aria-expanded', String(open));
      if (open && !panel) {
        panel = proceedsPanel(s.range ? s.range.median : Number(s.latest?.resale_price) || 0, idPrefix);
        panel.id = `${idPrefix}-panel`;
        proceedsBtn.after(panel);
        track('estimate_cta', { cta: 'proceeds', flat_type: flatType });
      }
      if (panel) panel.hidden = !open;
    },
  });
  result.append(el('div', { class: 'jte-actions' }, valuationBtn, proceedsBtn));
  result.append(el('p', { class: 'jte-foot' },
    el('a', { href: `/neighbour-prices/?postal=${postal}`, text: 'See every sale in this block and street' }), ' · ',
    el('button', { type: 'button', class: 'jte-link', text: 'Search another postal code', onclick: () => reset(root) })));
  result.append(el('p', { class: 'jte-source', text: 'Source: HDB resale flat prices via data.gov.sg, official records updated monthly.' }));
  result.hidden = false;
  root.classList.add('has-result');
  return heading;
}

function renderPrivate(root, { addr, postal }) {
  const result = root.querySelector('.jte-result');
  result.textContent = '';
  const heading = el('h3', { class: 'jte-address', tabindex: '-1', text: addr.building ? titleCase(addr.building) : `${addr.block ? `${addr.block} ` : ''}${titleCase(addr.road)}` });
  result.append(heading,
    el('p', { class: 'jte-help', text: 'No HDB resale sales are recorded at this address, so it is likely private property: a condo, landed home or non-residential building. The HDB data does not cover those.' }),
    el('div', { class: 'jte-actions' },
      el('button', {
        type: 'button', class: 'jte-primary', text: 'Ask Joe to value it',
        onclick: () => {
          track('estimate_cta', { cta: 'private_valuation' });
          root.dispatchEvent(new CustomEvent('jte:valuation', { bubbles: true, detail: { postal, block: addr.block, road: addr.road, flatType: '', propType: 'Condo', range: null } }));
        },
      }),
      el('a', { class: 'jte-secondary', href: '/condo-prices/', text: 'Condo prices by district' })),
    el('p', { class: 'jte-foot' }, el('button', { type: 'button', class: 'jte-link', text: 'Search another postal code', onclick: () => reset(root) })));
  result.hidden = false;
  root.classList.add('has-result');
  return heading;
}

function reset(root) {
  const result = root.querySelector('.jte-result');
  result.hidden = true;
  result.textContent = '';
  root.classList.remove('has-result');
  const input = root.querySelector('.jte-form input');
  input.value = '';
  input.focus();
}

async function renderPulse(root) {
  const slot = root.querySelector('[data-jte-pulse]');
  if (!slot) return;
  try {
    const p = await fetchJSON('/assets/market-pulse.json', 6000, 0);
    if (!p || !Number.isFinite(p.deals) || !Number.isFinite(p.median)) return;
    slot.textContent = `${fmtMonth(p.month)}: ${p.deals.toLocaleString('en-SG')} HDB flats resold, median ${money(p.median)}. Source: HDB via data.gov.sg.`;
    slot.hidden = false;
  } catch { /* the line is a nicety; the widget works without it */ }
}

function mount(root) {
  if (root.dataset.jteReady === 'true') return;
  root.dataset.jteReady = 'true';
  const form = root.querySelector('.jte-form');
  const input = form.querySelector('input');
  const button = form.querySelector('button[type="submit"]');
  const error = form.querySelector('.jte-error');
  const status = form.querySelector('.jte-status');
  const setError = (msg) => { error.textContent = msg; error.hidden = !msg; input.setAttribute('aria-invalid', msg ? 'true' : 'false'); };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const postal = normalisePostal(input.value);
    setError('');
    // A new search replaces the last answer; never leave another block's figures on screen.
    const previous = root.querySelector('.jte-result');
    previous.hidden = true;
    previous.textContent = '';
    root.classList.remove('has-result');
    if (!postal) { setError('Enter a 6-digit Singapore postal code.'); input.focus(); return; }
    input.value = postal;
    button.disabled = true;
    status.textContent = 'Looking up official sales…';
    track('estimate_search', { context: root.dataset.context || '' });
    try {
      const addr = await lookupAddress(postal);
      if (!addr) { setError('That postal code was not found. Check it, or WhatsApp Joe and he will pull the numbers for you.'); return; }
      const sales = await fetchSales(addr);
      let heading;
      if (!sales.block.length && !sales.street.length) {
        heading = renderPrivate(root, { addr, postal });
        track('estimate_shown', { found: false, scope: 'none' });
      } else {
        const types = flatTypesByVolume(sales.block.length ? sales.block : sales.street);
        heading = renderResult(root, { addr, sales, flatType: types[0], postal });
        track('estimate_shown', { found: true, scope: sales.block.length ? 'block' : 'street', flat_type: types[0] });
      }
      status.textContent = '';
      heading.focus({ preventScroll: true });
      if (root.dataset.scrollOnResult !== 'false') heading.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch {
      setError('The official data service did not respond. Try again in a minute, or WhatsApp Joe on +65 8188 1488 for your block’s numbers.');
    } finally {
      button.disabled = false;
      if (status.textContent.startsWith('Looking')) status.textContent = '';
    }
  });

  renderPulse(root);
  const preset = normalisePostal(root.dataset.postal || '');
  if (preset) { input.value = preset; form.requestSubmit(); }
}

document.querySelectorAll('[data-jt-estimate]').forEach(mount);
