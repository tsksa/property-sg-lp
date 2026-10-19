// Dataset + FAQPage JSON-LD for the HDB estate price pages.
//
// The stat-band, per-flat-type table, and YoY figure are already rendered on
// every /hdb-prices/<town>/ page; this module turns those same numbers into
// machine-readable Dataset + FAQPage schema so search engines can answer
// "what's the median HDB price in <town>" directly instead of re-deriving it
// from prose. Nothing here is computed independently — every value is the
// same number the page shell already prints, or (townFacts) is counted from
// the same 12-month rows and printed in the page's visible FAQ.

const LICENCE = 'https://data.gov.sg/open-data-licence';

// window12 is newest-first (see scripts/lib/estate-windows.mjs); the oldest
// entry is the start of the 12-month span. Month precision, not day: the
// day form "2025-08-01/2026-07-01" ends at the START of the newest month and
// so excludes almost all of the data it claims to describe.
const monthRange = (window12) => `${window12[window12.length - 1]}/${window12[0]}`;

const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
const listJoin = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * Title case for the dataset's all-caps towns, streets and flat types, shared by
 * the town pages' tables and townFacts so the FAQ spells a street the same way.
 * Not after an apostrophe ("QUEEN'S RD" is "Queen's Rd"), and a letter suffix on
 * a number stays a capital ("LOR 1A TOA PAYOH" is "Lor 1A Toa Payoh").
 */
export const titleCase = (s) =>
  s.toLowerCase()
    .replace(/(?<!')\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)([a-z])\b/g, (_, digits, letter) => digits + letter.toUpperCase());

/**
 * Town facts for the FAQ, counted from the same 12-month records as the page.
 *
 * JOE-448: with town names and numbers masked, 99.9% of the town pages' prose
 * sentences appeared on 3 or more town pages, and the FAQ restated the value card. These answers are counted per town from
 * the data.gov.sg rows the page already cites — no estimates, no generated prose.
 *
 * @param {object[]} inWin    the town's records in the 12-month window
 */
export function townFacts(inWin) {
  const byStreet = new Map();
  for (const r of inWin) byStreet.set(r.street_name, (byStreet.get(r.street_name) || 0) + 1);
  // The top 3, plus any street tied with the third (up to 5), so a tie is never
  // broken silently by alphabetical order.
  const ranked = [...byStreet].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const cutoff = ranked[2]?.[1];
  const topStreets = ranked
    .filter(([, sales], i) => i < 3 || (sales === cutoff && i < 5))
    .map(([street, sales]) => ({ street: titleCase(street), sales }));

  // Highest price; ties go to the newer sale, then dataset order.
  const top = inWin.reduce((best, r) => {
    if (!best) return r;
    const diff = Number(r.resale_price) - Number(best.resale_price);
    return diff > 0 || (diff === 0 && r.month > best.month) ? r : best;
  }, null);
  const highest = top && {
    price: Number(top.resale_price),
    flatType: titleCase(top.flat_type),
    block: top.block,
    street: titleCase(top.street_name),
    storeyRange: top.storey_range.toLowerCase().replace(/\b0(\d)/g, '$1'), // "07 TO 09" -> "7 to 9"
    month: top.month,
  };
  return { topStreets, highest };
}

/** Dataset + FAQPage nodes for a single town page. */
export function buildTownSchema({ t, canonical, generatedAt, window12, cur, yoy, DATASET, API, facts = null }) {
  const sourceUrl = `https://data.gov.sg/datasets/${DATASET}/view`;

  const dataset = {
    '@type': 'Dataset',
    name: `${t} HDB resale prices — 12-month dataset`,
    description: `Median resale price, price per square foot, and transaction count for ${t} HDB flats, computed from ${cur.n} registered resale transactions in the 12 months to ${generatedAt}.`,
    url: canonical,
    license: LICENCE,
    isAccessibleForFree: true,
    temporalCoverage: monthRange(window12),
    spatialCoverage: {
      '@type': 'Place',
      name: t,
      address: { '@type': 'PostalAddress', addressLocality: t, addressCountry: 'SG' },
    },
    creator: { '@type': 'GovernmentOrganization', name: 'Housing & Development Board', url: sourceUrl },
    isBasedOn: sourceUrl,
    distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${API}?resource_id=${DATASET}` },
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Median resale price', value: Math.round(cur.med), unitText: 'SGD' },
      { '@type': 'PropertyValue', name: 'Median price per square foot', value: Math.round(cur.psf), unitText: 'SGD per square foot' },
      { '@type': 'PropertyValue', name: 'Transaction count', value: cur.n, unitText: 'count' },
    ],
  };

  const yoyText = yoy === null
    ? `There isn't enough data to compare like with like across the two years in ${t}, so no year-on-year change is given.`
    : `Like for like, HDB resale prices in ${t} have ${yoy >= 0 ? 'risen' : 'fallen'} ${Math.abs(yoy).toFixed(1)}% over the past year. This compares the median price per square foot of the same flat types and lease ages in the 12 months to ${generatedAt} against the prior 12 months, so a year when more newer flats sold does not count as a price rise.`;

  const question = (name, text) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } });
  const medianQ = question(
    `What is the median HDB resale price in ${t}?`,
    `The median HDB resale price in ${t} is ${money(cur.med)}, based on ${cur.n} registered transactions in the 12 months to ${generatedAt}.`,
  );
  const yoyQ = question(`Have HDB prices in ${t} gone up or down over the past year?`, yoyText);

  // Without facts, the original three questions. With them, the psf question
  // (which only repeats the value card) gives way to two counted from this
  // town's own sales; the year-on-year answer stays third.
  let mainEntity = [
    medianQ,
    question(
      `What is the median price per square foot (psf) for HDB flats in ${t}?`,
      `The median price is $${Math.round(cur.psf)} psf across all flat types, based on transactions in the 12 months to ${generatedAt}.`,
    ),
    yoyQ,
  ];
  if (facts?.topStreets?.length && facts.highest) {
    const streets = facts.topStreets.map(({ street, sales }) => `${street} (${sales} ${sales === 1 ? 'sale' : 'sales'})`);
    const h = facts.highest;
    const article = /^[aeiou]/i.test(h.flatType) ? 'an' : 'a';
    mainEntity = [
      medianQ,
      question(
        `Which streets in ${t} have the most HDB resale sales?`,
        `In the 12 months to ${generatedAt}, the streets in ${t} with the most HDB resale transactions were ${listJoin(streets)}, out of ${cur.n} sales in the town.`,
      ),
      yoyQ,
      question(
        `What was the highest HDB resale price in ${t} in the last 12 months?`,
        `${money(h.price)}, for ${article} ${h.flatType} flat at Blk ${h.block} ${h.street}, storeys ${h.storeyRange}, sold in ${h.month}. It is the highest of ${cur.n} registered resale transactions in ${t} in the 12 months to ${generatedAt}.`,
      ),
    ];
  }

  const faq = { '@type': 'FAQPage', mainEntity };

  return [dataset, faq];
}

/** Dataset + FAQPage nodes for the /hdb-prices/ hub page. */
export function buildHubSchema({ canonical, generatedAt, indexRows, DATASET, API }) {
  const sourceUrl = `https://data.gov.sg/datasets/${DATASET}/view`;
  const totalTx = indexRows.reduce((sum, r) => sum + r.n, 0);
  const highest = indexRows.reduce((a, b) => (b.med > a.med ? b : a));
  const lowest = indexRows.reduce((a, b) => (b.med < a.med ? b : a));

  const dataset = {
    '@type': 'Dataset',
    name: 'HDB resale prices by town — 12-month medians',
    description: `Median HDB resale prices for ${indexRows.length} Singapore towns, computed from ${totalTx.toLocaleString('en-SG')} registered resale transactions in the 12 months to ${generatedAt}.`,
    url: canonical,
    license: LICENCE,
    isAccessibleForFree: true,
    creator: { '@type': 'GovernmentOrganization', name: 'Housing & Development Board', url: sourceUrl },
    isBasedOn: sourceUrl,
    distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${API}?resource_id=${DATASET}` },
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Town count', value: indexRows.length, unitText: 'count' },
      { '@type': 'PropertyValue', name: 'Total 12-month transaction count', value: totalTx, unitText: 'count' },
    ],
  };

  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How many HDB towns does this cover?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${indexRows.length} towns across Singapore, each with a 12-month resale median computed from official transactions.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Where does this HDB resale price data come from?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "The Housing & Development Board's official HDB Resale Flat Prices dataset, published via data.gov.sg under the Singapore Open Data Licence v1.0.",
        },
      },
      {
        '@type': 'Question',
        name: 'Which HDB town has the highest median resale price?',
        acceptedAnswer: { '@type': 'Answer', text: `${highest.town}, with a 12-month median of ${money(highest.med)}.` },
      },
      {
        '@type': 'Question',
        name: 'Which HDB town has the lowest median resale price?',
        acceptedAnswer: { '@type': 'Answer', text: `${lowest.town}, with a 12-month median of ${money(lowest.med)}.` },
      },
    ],
  };

  return [dataset, faq];
}

/**
 * Visible rendering of a FAQPage node.
 *
 * Google requires content marked up with FAQPage to be visible to the user on
 * the page; JSON-LD-only Q&A risks a manual action for spammy structured data.
 * Rendering straight from the same node the schema emits means the visible text
 * and the markup cannot drift apart.
 */
export function faqHtml(faqNode, esc) {
  const items = faqNode.mainEntity
    .map((q) => `      <details class="faq-item"><summary>${esc(q.name)}</summary><p>${esc(q.acceptedAnswer.text)}</p></details>`)
    .join('\n');
  return `  <h2>Common questions</h2>
  <div class="faq">
${items}
  </div>`;
}
