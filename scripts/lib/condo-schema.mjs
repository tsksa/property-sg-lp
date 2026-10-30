// Dataset + FAQPage JSON-LD for the /condo-prices/ district pages. Same
// contract as estate-schema.mjs: every value restates a number the page
// already renders — nothing is computed independently — and the FAQ node is
// rendered visibly via faqHtml() from the same object, so markup and visible
// content cannot drift.

const monthRange = (window12) => `${window12[window12.length - 1]}/${window12[0]}`;
const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');

const psfText = (v) => `$${Math.round(v).toLocaleString('en-SG')} psf`;
const q = (name, text) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } });

/**
 * The two project questions, answered from the same rows the page's project
 * table shows. None when no project clears the table's sales floor.
 */
export function projectFaqs({ dn, projects, generatedAt, minSales }) {
  if (!projects.length) return [];
  const byPsf = [...projects].sort((a, b) => b.psf - a.psf || a.project.localeCompare(b.project));
  const top = byPsf.slice(0, 3).map((p) => `${p.project} (${psfText(p.psf)}, ${p.n} sales)`);
  const low = byPsf[byPsf.length - 1];
  const scope = `projects with at least ${minSales} resale caveats in the 12 months to ${generatedAt}`;
  return [
    q(`Which condos in District ${dn} have the highest $psf?`,
      `Among ${scope}, the highest median prices per square foot were ${top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0]}. These medians are not adjusted for unit size, floor or remaining lease.`),
    q(`What is the cheapest condo in District ${dn} by $psf?`,
      `Among ${scope}, ${low.project} had the lowest median at ${psfText(low.psf)} across ${low.n} sales. The median is not adjusted for unit size, floor or remaining lease.`),
  ];
}

/** Freehold vs 99-year question; only asked when the page shows the split. */
export function tenureFaq({ dn, split, generatedAt }) {
  if (!split?.shown) return [];
  const { freehold: f, leasehold: l } = split;
  const diff = ((f.psf - l.psf) / l.psf) * 100;
  const verdict = Math.abs(diff) < 0.5
    ? 'about the same'
    : `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'higher' : 'lower'} for freehold`;
  return [q(`Are freehold condos in District ${dn} more expensive?`,
    `In the 12 months to ${generatedAt}, freehold and 999-year resale condos had a median ${psfText(f.psf)} across ${f.n.toLocaleString('en-SG')} caveats, against ${psfText(l.psf)} across ${l.n.toLocaleString('en-SG')} caveats for 99-year leasehold: ${verdict}. The two groups differ in age, location and unit size, so this is not a like-for-like premium.`)];
}

export function buildDistrictSchema({ d, areaName, canonical, generatedAt, window12, cur, yoy, projects = [], minSales = 3, split = null, dateModified = null }) {
  const sourceUrl = 'https://eservice.ura.gov.sg/maps/api/';

  const dataset = {
    '@type': 'Dataset',
    name: `District ${Number(d)} condo resale prices — 12-month dataset`,
    description: `Median resale price, price per square foot, and transaction count for private condominiums and apartments in District ${Number(d)} (${areaName}), computed from ${cur.n} caveats lodged in the 12 months to ${generatedAt}.`,
    url: canonical,
    license: 'https://eservice.ura.gov.sg/maps/api/#terms',
    isAccessibleForFree: true,
    ...(dateModified ? { dateModified } : {}),
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
    ? `There isn't enough data to compare like with like across the two years in District ${Number(d)}, so no year-on-year change is given.`
    : `Like for like, condo resale prices in District ${Number(d)} have ${yoy >= 0 ? 'risen' : 'fallen'} ${Math.abs(yoy).toFixed(1)}% over the past year. This compares the median price per square foot of the same unit sizes and tenures in the 12 months to ${generatedAt} against the prior 12 months, so a year when bigger or newer units sold does not count as a price rise.`;

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
      ...projectFaqs({ dn: Number(d), projects, generatedAt, minSales }),
      ...tenureFaq({ dn: Number(d), split, generatedAt }),
    ],
  };

  return [dataset, faq];
}
