// Dataset + FAQPage JSON-LD for the /condo-prices/ district pages. Same
// contract as estate-schema.mjs: every value restates a number the page
// already renders — nothing is computed independently — and the FAQ node is
// rendered visibly via faqHtml() from the same object, so markup and visible
// content cannot drift.

const monthRange = (window12) => `${window12[window12.length - 1]}/${window12[0]}`;
const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');

export function buildDistrictSchema({ d, areaName, canonical, generatedAt, window12, cur, yoy }) {
  const sourceUrl = 'https://eservice.ura.gov.sg/maps/api/';

  const dataset = {
    '@type': 'Dataset',
    name: `District ${Number(d)} condo resale prices — 12-month dataset`,
    description: `Median resale price, price per square foot, and transaction count for private condominiums and apartments in District ${Number(d)} (${areaName}), computed from ${cur.n} caveats lodged in the 12 months to ${generatedAt}.`,
    url: canonical,
    license: 'https://eservice.ura.gov.sg/maps/api/#terms',
    isAccessibleForFree: true,
    temporalCoverage: monthRange(window12),
    spatialCoverage: {
      '@type': 'Place',
      name: `Singapore District ${Number(d)} — ${areaName}`,
      address: { '@type': 'PostalAddress', addressCountry: 'SG' },
    },
    creator: { '@type': 'GovernmentOrganization', name: 'Urban Redevelopment Authority', url: sourceUrl },
    isBasedOn: sourceUrl,
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Median resale price', value: Math.round(cur.med), unitText: 'SGD' },
      { '@type': 'PropertyValue', name: 'Median price per square foot', value: Math.round(cur.psf), unitText: 'SGD per square foot' },
      { '@type': 'PropertyValue', name: 'Transaction count', value: cur.n, unitText: 'count' },
    ],
  };

  const yoyText = yoy === null
    ? `There isn't enough data in the prior 12-month window to compute a year-on-year change for District ${Number(d)}.`
    : `Median condo resale prices in District ${Number(d)} have ${yoy >= 0 ? 'risen' : 'fallen'} ${Math.abs(yoy).toFixed(1)}% over the past year, comparing the 12 months to ${generatedAt} against the prior 12-month period.`;

  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the median condo resale price in District ${Number(d)}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The median resale price for private condominiums and apartments in District ${Number(d)} (${areaName}) is ${money(cur.med)}, based on ${cur.n} caveats lodged in the 12 months to ${generatedAt}.`,
        },
      },
      {
        '@type': 'Question',
        name: `What is the median price per square foot (psf) for condos in District ${Number(d)}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The median price is $${Math.round(cur.psf)} psf across resale condominiums and apartments, based on caveats lodged in the 12 months to ${generatedAt}.`,
        },
      },
      {
        '@type': 'Question',
        name: `Have condo prices in District ${Number(d)} gone up or down over the past year?`,
        acceptedAnswer: { '@type': 'Answer', text: yoyText },
      },
    ],
  };

  return [dataset, faq];
}
