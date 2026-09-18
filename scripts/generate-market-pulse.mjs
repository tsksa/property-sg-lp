#!/usr/bin/env node
// Writes assets/market-pulse.json: the latest complete month's HDB resale count
// and median price, for the one-line market figure under the estimate widget
// (assets/block-estimate.js, JOE-392).
//
//   node scripts/generate-market-pulse.mjs
//
// Runs monthly in .github/workflows/refresh-estate-pages.yml next to the town
// pages, so the figure changes through a reviewed PR, never silently. The widget
// always prints the month the figure belongs to, so a late refresh is dated
// rather than wrong.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { monthsBack } from './lib/estate-windows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'market-pulse.json');
const DATASET = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const API = 'https://data.gov.sg/api/action/datastore_search';

export function pulseFor(month, records) {
  const prices = records.map((r) => Number(r.resale_price)).filter(Number.isFinite).sort((a, b) => a - b);
  if (prices.length < 500) throw new Error(`only ${prices.length} sales in ${month}; refusing to publish a thin month`);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return {
    month,
    deals: prices.length,
    median: Math.round(median),
    source: `HDB Resale Flat Prices (${DATASET}) via data.gov.sg`,
  };
}

async function fetchMonth(month) {
  const url = `${API}?resource_id=${DATASET}&filters=${encodeURIComponent(JSON.stringify({ month }))}&fields=resale_price&limit=10000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gov.sg ${res.status} for ${month}`);
  const body = await res.json();
  if (!body.success) throw new Error(`API failure for ${month}`);
  return body.result.records;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // months[0] is the current, always-partial month; take the newest complete
  // month that has data (a publication lag can push it back by one).
  for (const month of monthsBack(3).slice(1)) {
    const records = await fetchMonth(month);
    if (!records.length) continue;
    const pulse = pulseFor(month, records);
    fs.writeFileSync(OUT, `${JSON.stringify(pulse, null, 2)}\n`);
    console.log(`market pulse: ${month}, ${pulse.deals} sales, median $${pulse.median.toLocaleString('en-SG')}`);
    process.exit(0);
  }
  throw new Error('no complete month with data in the last two months');
}
