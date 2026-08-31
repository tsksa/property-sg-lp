#!/usr/bin/env node
// Validates a URA Data Service access key end to end, so JOE-12 (condo price
// pages) can start the moment the key exists.
//
//   URA_ACCESS_KEY=xxxx node scripts/probe-ura.mjs
//
// Does the documented handshake — AccessKey → daily Token via
// insertNewToken.action — then pulls batch 1 of PMI_Resi_Transaction and
// reports what came back: record and project counts, districts covered, the
// months present, and one sample record's fields. Read-only; no repo changes.
//
// API contract per URA's published docs (eservice.ura.gov.sg/maps/api/):
//   token:  GET https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1  (header AccessKey)
//           legacy: https://www.ura.gov.sg/uraDataService/insertNewToken.action
//   data:   GET .../invokeUraDS?service=PMI_Resi_Transaction&batch=1..4
//           (headers AccessKey + Token; batches split the market into 4 parts)

const KEY = process.env.URA_ACCESS_KEY;
if (!KEY) {
  console.error('URA_ACCESS_KEY is not set.');
  console.error('Register (free): https://eservice.ura.gov.sg/maps/api/reg.html');
  console.error('The key arrives by email; then rerun this probe.');
  process.exit(1);
}

const UA = { 'User-Agent': 'joetay.com data probe (joe@joetay.com)' };

async function getJson(url, headers) {
  const res = await fetch(url, { headers: { ...UA, ...headers } });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, text: text.slice(0, 300) };
  }
}

// Try current then legacy token endpoints — URA has moved hosts before.
const TOKEN_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1',
  'https://www.ura.gov.sg/uraDataService/insertNewToken.action',
];
const DATA_HOSTS = [
  'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1',
  'https://www.ura.gov.sg/uraDataService/invokeUraDS',
];

let token = null;
for (const url of TOKEN_URLS) {
  const r = await getJson(url, { AccessKey: KEY });
  const t = r.json?.Result ?? r.json?.token;
  console.log(`token ${url} → HTTP ${r.status} ${t ? 'OK' : JSON.stringify(r.json ?? r.text).slice(0, 120)}`);
  if (t && typeof t === 'string' && t.length > 10) { token = t; break; }
}
if (!token) {
  console.error('\nNo token issued. A freshly emailed key can take up to a day to activate — retry tomorrow before debugging further.');
  process.exit(1);
}

let ok = false;
for (const host of DATA_HOSTS) {
  const r = await getJson(`${host}?service=PMI_Resi_Transaction&batch=1`, { AccessKey: KEY, Token: token });
  const projects = r.json?.Result;
  if (!Array.isArray(projects)) {
    console.log(`data  ${host} → HTTP ${r.status} ${JSON.stringify(r.json ?? r.text).slice(0, 120)}`);
    continue;
  }
  ok = true;
  const tx = projects.flatMap((p) => p.transaction ?? []);
  const districts = new Set(tx.map((t) => t.district).filter(Boolean));
  const months = new Set(tx.map((t) => t.contractDate?.slice(2)).filter(Boolean));
  console.log(`\nbatch 1 via ${host}:`);
  console.log(`  projects: ${projects.length}, transactions: ${tx.length}`);
  console.log(`  districts covered: ${districts.size}`);
  console.log(`  contract months present: ${[...months].sort().slice(-6).join(', ')} (latest 6)`);
  const sample = tx[0] ?? {};
  console.log(`  sample record fields: ${Object.keys(sample).join(', ')}`);
  console.log('\nKey works. JOE-12 is unblocked — next: add URA_ACCESS_KEY as a GitHub Actions secret.');
  break;
}
process.exit(ok ? 0 : 1);
