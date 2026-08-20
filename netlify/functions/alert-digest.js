// Netlify Scheduled Function: alert-digest  (joetay.com)
//
// Runs monthly (see netlify.toml) shortly after HDB's dataset refresh.
// For every price-alert subscription, checks whether the latest month has
// new transactions in that subscriber's block (exact) or street (context),
// then sends ONE digest to Joe through the existing lead webhook (→ Sheets
// + email). Joe follows up with each subscriber personally on WhatsApp —
// no automated outbound to subscribers, by design.

const DATASET = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const API = 'https://data.gov.sg/api/action/datastore_search';
const { postJson } = require('./lib/lead-webhook');

async function fetchMonth(month) {
  const filters = encodeURIComponent(JSON.stringify({ month }));
  const res = await fetch(`${API}?resource_id=${DATASET}&filters=${filters}&limit=5000`);
  if (!res.ok) throw new Error(`data.gov.sg ${res.status}`);
  const j = await res.json();
  return j.success ? j.result.records : [];
}

async function deliverAndStamp({ webhookUrl, payload, store, month, fetchImpl = globalThis.fetch }) {
  await postJson(webhookUrl, payload, fetchImpl);
  await store.set('_digested', month);
}
exports.deliverAndStamp = deliverAndStamp;

// Candidate months to check for the digest, newest-first, always excluding the
// current calendar month. data.gov.sg's HDB resale dataset adds records for
// the in-progress month incrementally (not in one batch at month-end), so a
// "does this month have ANY records yet" check — which is what the loop below
// used to be — can match a still-partial current month. That mislabels an
// in-progress month as final: it gets stamped into `_digested` immediately,
// so any transaction added to that same month afterward (the vast majority —
// most of the month hadn't happened yet) is never checked again by a later
// run, silently dropping the alert for that subscriber.
//
// This is the identical bug class the estate pages hit and fixed — see
// scripts/lib/estate-windows.mjs ("the current, always-partial calendar month
// is never the reported month"). Structurally excluding month 0 here (rather
// than relying on it happening to have zero records) closes it the same way.
function digestCandidateMonths(now = new Date(), lookback = 3) {
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1); // skip the current, always-partial month
  const out = [];
  for (let i = 0; i < lookback; i += 1) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
exports.digestCandidateMonths = digestCandidateMonths;

exports.handler = async (event) => {
  const blobs = await import('@netlify/blobs');
  // Hydrate Blobs env under the legacy function signature (see subscribe-alert.js).
  if (event && typeof blobs.connectLambda === 'function') {
    try { blobs.connectLambda(event); } catch (e) { console.warn('connectLambda:', e.message); }
  }
  const store = blobs.getStore('price-alerts');

  const subs = [];
  const listing = await store.list();
  for (const b of listing.blobs) {
    if (b.key.startsWith('_')) continue; // rate-limit + state keys
    const s = await store.get(b.key, { type: 'json' });
    if (s && s.postal_code) subs.push({ key: b.key, ...s });
  }
  if (!subs.length) { console.log('No subscriptions.'); return { statusCode: 200, body: 'no subs' }; }

  // Latest complete month with data (walk back up to 3 months for publication lag).
  let month = null, recs = [];
  for (const candidate of digestCandidateMonths()) {
    recs = await fetchMonth(candidate);
    if (recs.length) { month = candidate; break; }
  }
  if (!recs.length) { console.log('No recent data.'); return { statusCode: 200, body: 'no data' }; }

  // Skip if this month was already digested (idempotent across retries).
  const stamp = await store.get('_digested');
  if (stamp === month) { console.log(`Already digested ${month}.`); return { statusCode: 200, body: 'already done' }; }

  // OneMap stores full road names ("SERANGOON NORTH AVENUE 1") but the HDB
  // dataset abbreviates ("SERANGOON NTH AVE 1"). Same token map as the
  // neighbour-prices tool — both sides normalize to the abbreviated form.
  const ROAD_ABBREV = {
    'AVENUE':'AVE','BUKIT':'BT','CENTRAL':'CTRL','CLOSE':'CL','COMMONWEALTH':"C'WEALTH",
    'CRESCENT':'CRES','DRIVE':'DR','GARDENS':'GDNS','HEIGHTS':'HTS','JALAN':'JLN',
    'KAMPONG':'KG','LORONG':'LOR','NORTH':'NTH','PARK':'PK','PLACE':'PL','ROAD':'RD',
    'SOUTH':'STH','STREET':'ST','TANJONG':'TG','TERRACE':'TER','UPPER':'UPP','SAINT':'ST.'
  };
  const norm = (x) => String(x || '').toUpperCase().replace(/\s+/g, ' ').trim()
    .split(' ').map((t) => ROAD_ABBREV[t] || t).join(' ');
  const matches = [];
  for (const s of subs) {
    const inBlock = recs.filter((r) => norm(r.block) === norm(s.block) && norm(r.street_name) === norm(s.street_name));
    const inStreet = recs.filter((r) => norm(r.street_name) === norm(s.street_name));
    if (inBlock.length || inStreet.length >= 1) {
      matches.push({
        name: s.name, contact: s.contact, block: s.block, street: s.street_name, town: s.town,
        block_sales: inBlock.map((r) => `${r.flat_type} ${r.storey_range} $${Number(r.resale_price).toLocaleString('en-SG')}`),
        street_sales_count: inStreet.length,
      });
    }
  }
  console.log(`${subs.length} subscriptions, ${matches.length} with activity in ${month}`);
  if (!matches.length) { await store.set('_digested', month); return { statusCode: 200, body: 'no matches' }; }

  const lines = matches.map((m) =>
    `${m.name} (${m.contact}) — Blk ${m.block} ${m.street}: ` +
    (m.block_sales.length ? `${m.block_sales.length} sale(s) in their block [${m.block_sales.join('; ')}]` : `${m.street_sales_count} sale(s) on their street`)
  );
  await deliverAndStamp({
    webhookUrl: process.env.LEAD_WEBHOOK_URL,
    store,
    month,
    payload: {
      lead_type: 'price_alert_digest',
      full_name: `Price-alert digest ${month}`,
      message: `${matches.length} subscriber(s) to contact:\n` + lines.join('\n'),
      source_site: 'joetay.com',
      submitted_at: new Date().toISOString(),
    },
  });
  return { statusCode: 200, body: `digested ${matches.length}` };
};
