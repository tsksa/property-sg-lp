// Dataset + FAQPage JSON-LD for the HDB estate price pages.
//
// The stat-band, per-flat-type table, and YoY figure are already rendered on
// every /hdb-prices/<town>/ page; this module turns those same numbers into
// machine-readable Dataset + FAQPage schema so search engines can answer
// "what's the median HDB price in <town>" directly instead of re-deriving it
// from prose. Nothing here is computed independently — every value is the
// same number the page shell already prints.

const LICENCE = 'https://data.gov.sg/open-data-licence';

// window12 is newest-first (see scripts/lib/estate-windows.mjs); the oldest
// entry is the start of the 12-month span. Month precision, not day: the
// day form "2025-08-01/2026-07-01" ends at the START of the newest month and
// so excludes almost all of the data it claims to describe.
const monthRange = (window12) => `${window12[window12.length - 1]}/${window12[0]}`;

const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');

/** Dataset + FAQPage nodes for a single town page. */
export function buildTownSchema({ t, canonical, generatedAt, window12, cur, yoy, DATASET, API }) {
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
    ? `There isn't enough data in the prior 12-month window to compute a year-on-year change for ${t}.`
    : `Median resale prices in ${t} have ${yoy >= 0 ? 'risen' : 'fallen'} ${Math.abs(yoy).toFixed(1)}% over the past year, comparing the 12 months to ${generatedAt} against the prior 12-month period.`;

  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the median HDB resale price in ${t}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The median HDB resale price in ${t} is ${money(cur.med)}, based on ${cur.n} registered transactions in the 12 months to ${generatedAt}.`,
        },
      },
      {
        '@type': 'Question',
        name: `What is the median price per square foot (psf) for HDB flats in ${t}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The median price is $${Math.round(cur.psf)} psf across all flat types, based on transactions in the 12 months to ${generatedAt}.`,
        },
      },
      {
        '@type': 'Question',
        name: `Have HDB prices in ${t} gone up or down over the past year?`,
        acceptedAnswer: { '@type': 'Answer', text: yoyText },
      },
    ],
  };

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
