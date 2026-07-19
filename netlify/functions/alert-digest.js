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

async function fetchMonth(month) {
  const filters = encodeURIComponent(JSON.stringify({ month }));
  const res = await fetch(`${API}?resource_id=${DATASET}&filters=${filters}&limit=5000`);
  if (!res.ok) throw new Error(`data.gov.sg ${res.status}`);
  const j = await res.json();
  return j.success ? j.result.records : [];
}

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

  // Latest month with data (walk back up to 3 months for publication lag).
  const d = new Date(); d.setDate(1);
  let month = null, recs = [];
  for (let i = 0; i < 3 && !recs.length; i++) {
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    recs = await fetchMonth(month);
    d.setMonth(d.getMonth() - 1);
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

  if (process.env.LEAD_WEBHOOK_URL) {
    const lines = matches.map((m) =>
      `${m.name} (${m.contact}) — Blk ${m.block} ${m.street}: ` +
      (m.block_sales.length ? `${m.block_sales.length} sale(s) in their block [${m.block_sales.join('; ')}]` : `${m.street_sales_count} sale(s) on their street`)
    );
    await fetch(process.env.LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_type: 'price_alert_digest',
        full_name: `Price-alert digest ${month}`,
        message: `${matches.length} subscriber(s) to contact:\n` + lines.join('\n'),
        source_site: 'joetay.com',
        submitted_at: new Date().toISOString(),
      }),
    });
  }
  await store.set('_digested', month);
  return { statusCode: 200, body: `digested ${matches.length}` };
};
