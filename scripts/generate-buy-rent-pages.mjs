#!/usr/bin/env node
// Generates the two short service pages from audit item G5, for the audiences
// that had no page of their own:
//
//   buy/index.html    resale buyers (HDB and private)
//   rent/index.html   tenants
//
// Same template as the seller's guide hub (generate-seller-cluster.mjs), whose
// head, byline and footer helpers are reused. Every rule and figure is one the
// official page in SOURCES states, read on the review date below; the renting
// rules are the ones the landlord guide checked on 15 Nov 2026. Nothing here
// states a fee, a track record or a testimonial: commission is described the
// way the commission guide already describes it (no fixed rate, agreed in
// writing).
//
//   node scripts/generate-buy-rent-pages.mjs          # write
//   node scripts/generate-buy-rent-pages.mjs --check  # fail if any page is stale

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml } from './lib/consent-banner.mjs';
import { siteHeaderHtml } from './lib/site-header.mjs';
import { AUTHOR, BYLINE, FOOTER, PUBLISHER, esc, headHtml, whatsapp } from './generate-seller-cluster.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
export const reviewed = '16 Nov 2026';

export const SOURCES = {
  ceaBuying: 'https://www.cea.gov.sg/consumers/engaging-a-property-agent/buying-or-selling/',
  hdbHfe: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/application-for-an-hdb-flat-eligibility-hfe-letter',
  hdbOtp: 'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/option-to-purchase',
  hdbRfv: 'https://www.hdb.gov.sg/e-resale/valuation-request',
  hdbCompletion: 'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-completion',
  irasWhenToPay: 'https://www.iras.gov.sg/taxes/stamp-duty/for-property/paying-stamp-duty/when-to-pay-stamp-duty',
  irasStampRates: 'https://www.iras.gov.sg/quick-links/tax-rates/stamp-duty',
  hdbRentEligibility: 'https://www.hdb.gov.sg/managing-my-home/home-ownership/renting-out-a-flat-or-bedrooms/renting-out-a-flat/eligibility',
  hdbRentRegulations: 'https://www.hdb.gov.sg/managing-my-home/home-ownership/renting-out-a-flat-or-bedrooms/renting-out-a-flat/regulations',
  uraRenting: 'https://www.ura.gov.sg/Corporate/Property/Residential/Renting-Property',
};

const src = (key, text) => `<a href="${SOURCES[key]}" target="_blank" rel="noopener">${text}</a>`;

const DISCLAIMER = 'This page is general information, not legal, tax or financial advice. HDB, URA, IRAS and CPF Board apply the prevailing rules to the facts of your own case; check the official page or ask a lawyer before you commit.';

const PAGE_CSS = `
.article-body ul.sg-links{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:12px}
.article-body ul.sg-links li{margin:0;padding:16px 18px;border:1px solid rgba(11,30,63,.14);border-radius:12px;background:#fff}
.article-body ul.sg-links a{display:inline-block;font-weight:700;margin-bottom:4px}
.article-body ul.sg-links span{display:block;font-size:.93rem;line-height:1.5;color:#4a5872}
@media(min-width:720px){.article-body ul.sg-links{grid-template-columns:1fr 1fr}}
.article-body h2[id]{scroll-margin-top:84px}
html.jt-theme-dark .article-body ul.sg-links li{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.14)}
html.jt-theme-dark .article-body ul.sg-links span{color:#c3cede}`;

export const PAGES = [
  {
    path: 'buy/index.html',
    pagePath: '/buy/',
    url: 'https://joetay.com/buy/',
    crumb: 'Buying a home',
    title: 'Buy a Resale HDB Flat or Condo with Joe Tay | PropertySG',
    headline: 'Buying a resale HDB flat or condo, with an agent on your side',
    description: 'How Joe Tay acts for resale buyers in Singapore: budget, pricing from registered sales, the Option to Purchase, HDB valuation and completion.',
    lede: 'The agent who shows you a listed home normally works for the seller. If you want someone working for you, Joe can act as your buyer’s agent, from setting the budget to completion.',
    serviceType: 'Buyer’s agent for resale HDB flats and private homes',
    leadType: 'buyer',
    ctaLocation: 'buy_page',
    whatsappText: 'Hi Joe, I am looking to buy a home and would like you to act for me.',
    body: `
<div class="callout"><strong>The short answer</strong><p>For an HDB resale flat, get your HFE letter first, price flats from registered sales, then take the Option to Purchase. HDB caps the Option Fee at $1,000 and the Option Fee plus the Option Exercise Fee at $5,000, and gives you 21 calendar days to exercise. Completion is about 8 weeks after HDB accepts the resale application. A buyer’s agent is optional, and you agree the fee in writing before the search starts.</p></div>

<h2 id="representation">Who works for you when you buy</h2>
<p>The salesperson advertising a home represents the seller. CEA says an agent cannot collect commission from more than one party in the same transaction, and that doing so is an offence. So the seller’s agent cannot also act for you. Source: ${src('ceaBuying', 'CEA, buying or selling with a property agent')}.</p>
<p>If you appoint Joe, the scope and the fee go into CEA’s prescribed estate agency agreement for the purchase of residential property, signed before viewings start. CEA says there are no fixed commission rates. The <a href="/insights/property-agent-commission-singapore.html">commission guide</a> sets out what to agree.</p>

<h2 id="what-joe-does">What Joe does for a buyer</h2>
<ul>
  <li><strong>Budget first.</strong> Works out the loan, CPF and cash the purchase needs from your HFE letter or bank in-principle approval, including any extra cash needed if HDB values the flat below the price.</li>
  <li><strong>Shortlist.</strong> Searches the towns or projects you name and checks each home against registered sales of the same flat type, storey band and remaining lease.</li>
  <li><strong>Price.</strong> Recommends an offer from those sales, and for an HDB flat, how likely the price is to sit above HDB’s valuation.</li>
  <li><strong>Negotiate.</strong> Deals with the seller’s agent on price, the option terms, the completion date and any items left in the home.</li>
  <li><strong>Paperwork.</strong> Takes you through the Option to Purchase, HDB’s Request for Value, the resale application or your lawyer’s conveyancing, stamp duty and completion.</li>
</ul>

<h2 id="hdb-steps">Buying an HDB resale flat, in order</h2>
<ol>
  <li><strong>Get an HFE letter.</strong> HDB requires a valid HFE letter before you obtain an Option to Purchase and again when you submit the resale application. It is valid for 9 months, and processing can take up to a month after HDB has all your documents. Source: ${src('hdbHfe', 'HDB, HFE letter')}.</li>
  <li><strong>Set the budget.</strong> Add up the loan, CPF and grants your HFE letter shows, and keep cash for the option fees and any amount above valuation.</li>
  <li><strong>Price flats from registered sales.</strong> Compare the same flat type nearby, giving most weight to recent sales on a similar storey and lease.</li>
  <li><strong>Take the Option to Purchase.</strong> The seller grants HDB’s prescribed OTP for an Option Fee of $1 to $1,000. The option runs 21 calendar days, including weekends and public holidays, and expires at 4pm on the 21st day. If you do not exercise it, the seller keeps the Option Fee. Source: ${src('hdbOtp', 'HDB, Option to Purchase')}.</li>
  <li><strong>Request HDB’s value.</strong> If you are using CPF or a housing loan, you submit a Request for Value by the next working day after the Option Date and pay HDB’s $120 processing fee. Any amount by which the price exceeds the value is cash over valuation, paid in cash. Source: ${src('hdbRfv', 'HDB, Request for Value terms')}.</li>
  <li><strong>Exercise and apply.</strong> You exercise the option by paying the Option Exercise Fee, which with the Option Fee cannot exceed $5,000. You and the seller then each submit your portion of the resale application, within the days agreed in the OTP and within 7 calendar days of each other. Source: ${src('hdbOtp', 'HDB, Option to Purchase')}.</li>
  <li><strong>Pay stamp duty and complete.</strong> Buyer’s Stamp Duty, and any Additional Buyer’s Stamp Duty, is paid to IRAS; for a document signed in Singapore the deadline is 14 days after signing. Source: ${src('irasWhenToPay', 'IRAS, when to pay stamp duty')}. HDB says completion is about 8 weeks after it accepts the resale application. Source: ${src('hdbCompletion', 'HDB, resale completion')}.</li>
</ol>

<h2 id="private">Buying a resale condo</h2>
<p>A private purchase runs through lawyers rather than HDB. Price the unit from URA caveats for the same bedroom type in the project. Your bank lends against the lower of the price and its own valuation, so a price above that valuation is paid in cash. For a private sale the option fee, option period and exercise deposit are agreed between buyer and seller. A 1% option fee, a 14-day option and a further 4% on exercise are market conventions, not rules. The <a href="/insights/how-to-sell-condo-singapore.html">condo selling guide</a> follows the same transaction from the seller’s side.</p>

<h2 id="guides">Guides for buyers</h2>
<ul class="sg-links">
  <li><a href="/insights/hfe-letter-singapore-guide.html">HFE letter application</a><span>Documents, processing time and the nine-month validity.</span></li>
  <li><a href="/insights/hdb-loan-eligibility-singapore.html">HDB loan eligibility</a><span>Who qualifies for an HDB loan and how much it can be.</span></li>
  <li><a href="/insights/msr-vs-tdsr-singapore.html">MSR vs TDSR</a><span>The two limits on how much of your income can go to the loan.</span></li>
  <li><a href="/insights/hdb-resale-grants-singapore.html">HDB resale grants</a><span>Which CPF housing grants a resale buyer can combine.</span></li>
  <li><a href="/insights/hdb-downpayment-cash-cpf-grants.html">HDB downpayment</a><span>How cash, CPF and grants fit together.</span></li>
  <li><a href="/insights/hdb-valuation-explained.html">HDB valuation and COV</a><span>When HDB values a flat and what cash over valuation means for you.</span></li>
  <li><a href="/neighbour-prices/">Sold prices by block</a><span>Every registered HDB resale in a block and street, by postal code.</span></li>
  <li><a href="/condo-prices/">Condo prices by district</a><span>Resale prices per square foot from URA caveats.</span></li>
  <li><a href="/calculator/">Affordability calculator</a><span>The loan, CPF and cash a purchase price needs.</span></li>
  <li><a href="/stamp-duty-calculator/">Stamp duty calculator</a><span>Buyer’s Stamp Duty and ABSD on your purchase.</span></li>
</ul>
<p>Selling a home to fund this one? <a href="/insights/sell-hdb-first-or-buy-condo-first.html">Sell first or buy first</a> sets out the stamp duty, loan and timing consequences of each order.</p>`,
    faqs: [
      ['Do I need my own agent to buy a resale flat?', 'No. You may buy without one. The agent advertising a flat represents the seller, so appoint your own agent only if you want someone negotiating for you, and agree the fee in writing first.'],
      ['Who pays a buyer’s agent?', 'The buyer who appoints them. CEA says an agent cannot collect commission from more than one party in the same transaction, and there are no fixed commission rates.'],
      ['When do I need an HFE letter?', 'Before you obtain an Option to Purchase from an HDB flat seller, and again when you submit the resale application. It is valid for 9 months from the date of issue.'],
      ['How long does an HDB resale purchase take?', 'The option runs up to 21 calendar days. After you exercise it, both sides submit the resale application, and HDB says completion is about 8 weeks after it accepts the application.'],
    ],
    reviewLine: `Reviewed ${reviewed} against HDB’s Option to Purchase (page last updated 7 September 2026), HFE letter (28 October 2026), Request for Value terms and resale completion pages, CEA’s buying or selling with a property agent and IRAS’s when to pay stamp duty (2 November 2026).`,
  },
  {
    path: 'rent/index.html',
    pagePath: '/rent/',
    url: 'https://joetay.com/rent/',
    crumb: 'Renting a home',
    title: 'Rent a Home in Singapore: Tenant’s Agent | PropertySG',
    headline: 'Renting a home in Singapore, with an agent acting for you',
    description: 'How Joe Tay acts for tenants in Singapore: shortlisting, the HDB and URA rules a rental must meet, the tenancy agreement and lease stamp duty.',
    lede: 'Most rental listings are advertised by the landlord’s agent, who works for the landlord. Joe can act for you instead: shortlisting homes, checking the home can lawfully be let to you and negotiating the tenancy.',
    serviceType: 'Tenant’s agent for HDB flats and private homes',
    leadType: 'tenant',
    ctaLocation: 'rent_page',
    whatsappText: 'Hi Joe, I am looking for a home to rent.',
    body: `
<div class="callout"><strong>The short answer</strong><p>An HDB flat must be rented for at least 6 months and needs HDB’s approval before you move in. A private home must be rented for at least 3 consecutive months. Either way the tenancy agreement is stamped: IRAS charges 0.4% of the total rent for a lease of up to four years, and the agreement normally makes the tenant pay it.</p></div>

<h2 id="representation">Who works for you when you rent</h2>
<p>The agent advertising a rental normally represents the landlord. An agent can collect commission from only one party in the same transaction, so if you want someone negotiating for you, appoint your own tenant’s agent. The party who appoints the agent pays them. There is no fixed rate; Joe quotes rental work case by case and agrees it in writing before viewings start.</p>

<h2 id="what-joe-does">What Joe does for a tenant</h2>
<ul>
  <li><strong>Shortlist.</strong> Finds homes in your budget and area, using recent rents for the same flat or unit type to tell you what is fair.</li>
  <li><strong>Check the rules.</strong> For an HDB flat, confirms the owner may rent it out and that you, and everyone moving in with you, fit HDB’s tenant and quota rules. For a condo, checks the occupancy cap.</li>
  <li><strong>Viewings and offer.</strong> Arranges viewings, then negotiates the rent, term, deposit, repairs and early-termination terms with the landlord’s agent.</li>
  <li><strong>Tenancy agreement.</strong> Goes through the agreement with you before you sign, gets it stamped on time and records the condition of the home at handover.</li>
</ul>

<h2 id="hdb">Renting a whole HDB flat</h2>
<ul>
  <li><strong>Who may rent.</strong> Singapore Citizens, Singapore Permanent Residents, and non-citizens legally in Singapore on an Employment Pass, S Pass, Work Permit, Student Pass, Dependant Pass or Long-Term Social Visit Pass with at least 6 months’ validity. Tourists may not rent an HDB flat.</li>
  <li><strong>Minimum period.</strong> At least 6 months per tenant; short-term letting is not allowed. The owner must have HDB’s approval before you move in.</li>
  <li><strong>Non-citizen quota.</strong> If any tenant is a non-Malaysian non-citizen, the block and neighbourhood quota applies: 8% for the neighbourhood and 11% for the block. Once it is full, only Singaporeans and Malaysians can rent a whole flat there.</li>
  <li><strong>How many people.</strong> Up to 4 tenants in a 1-room or 2-room flat, 6 in a 3-room flat and 8 in a 4-room or bigger flat, reverting to 6 for a rental period that extends beyond 31 December 2028. The cap does not apply if all the tenants are one family unit.</li>
</ul>
<p>Sources: ${src('hdbRentEligibility', 'HDB, eligibility for renting out a flat')} and ${src('hdbRentRegulations', 'regulations for renting out a flat')}.</p>

<h2 id="private">Renting a condo or private home</h2>
<p>No government approval is needed, but URA’s rules apply. Every occupant must stay at least three consecutive months. A home smaller than 90 square metres may house up to six unrelated persons; a larger home registered with URA may house up to eight until 31 December 2028. The development’s by-laws also bind you, for example on move-in and renovation hours. Source: ${src('uraRenting', 'URA, renting property')}.</p>

<h2 id="agreement">The tenancy agreement and stamp duty</h2>
<p>The agreement should state the rent, the term, the deposit, who pays for repairs and how either side may end the lease early. It is then stamped. IRAS charges lease duty at 0.4% of the total rent for a lease of four years or less, and leases with an average annual rent of $1,000 or less are exempt. Duty is due within 14 days of signing if the agreement is signed in Singapore. Sources: ${src('irasStampRates', 'IRAS, stamp duty rates')} and ${src('irasWhenToPay', 'when to pay stamp duty')}.</p>
<div class="callout"><strong>Worked example</strong><p>A two-year lease at $3,400 a month has a total rent of $81,600. Lease duty is 0.4% × $81,600 = $326, rounded down to the nearest dollar.</p></div>

<h2 id="guides">Useful for tenants</h2>
<ul class="sg-links">
  <li><a href="/insights/singapore-rental-market-3q-2026.html">Rental market 3Q 2026</a><span>Median HDB rent for every town, by flat type.</span></li>
  <li><a href="/insights/renting-out-hdb-condo-singapore.html">The rules from the landlord’s side</a><span>Approval, minimum periods, occupancy caps, stamp duty and tax.</span></li>
  <li><a href="/faq/">Selling and renting FAQ</a><span>Short answers to the questions owners and tenants ask most.</span></li>
  <li><a href="/glossary/">Property glossary</a><span>Terms such as OTP, MOP and COV explained.</span></li>
</ul>
<p>Own the home and want to let it? See <a href="/rent-out/">renting out with Joe</a>.</p>`,
    faqs: [
      ['Do tenants pay agent commission in Singapore?', 'Only if they appoint their own agent. The agent advertising a rental normally represents the landlord, and an agent can collect commission from only one party in the same transaction. There is no fixed rate.'],
      ['What is the minimum rental period?', 'At least 6 months per tenant for a whole HDB flat, and at least three consecutive months for a private home. Short-term letting is not allowed in either.'],
      ['Who pays the stamp duty on a tenancy agreement?', 'The tenancy agreement normally makes the tenant responsible. IRAS charges 0.4% of the total rent for a lease of four years or less, due within 14 days of signing in Singapore.'],
      ['Can a foreigner rent a whole HDB flat?', 'Yes, on an Employment Pass, S Pass, Work Permit, Student Pass, Dependant Pass or Long-Term Social Visit Pass with at least 6 months’ validity, subject to the block’s non-citizen quota. Tourists may not.'],
    ],
    reviewLine: `Reviewed ${reviewed}. The HDB, URA and IRAS rental rules were checked on 15 Nov 2026 against HDB’s eligibility for renting out a flat (page last updated 1 November 2026) and regulations for renting out a flat, URA’s renting property (6 November 2026) and IRAS’s stamp duty rates; the stamping deadline against IRAS’s when to pay stamp duty (2 November 2026).`,
  },
];

export function servicePage(page) {
  const faqHtml = page.faqs.map(([question, answer]) => `<h3>${esc(question)}</h3>\n<p>${esc(answer)}</p>`).join('\n');
  const schemas = [
    {
      '@context': 'https://schema.org', '@type': 'WebPage', name: page.headline, description: page.description,
      url: page.url, inLanguage: 'en-SG', author: AUTHOR, publisher: PUBLISHER,
    },
    {
      '@context': 'https://schema.org', '@type': 'Service', name: page.headline, serviceType: page.serviceType,
      url: page.url, provider: PUBLISHER, areaServed: { '@type': 'Country', name: 'Singapore' },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://joetay.com/' },
        { '@type': 'ListItem', position: 2, name: page.crumb, item: page.url },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faqs.map(([name, text]) => ({
        '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text },
      })),
    },
  ];
  return `${headHtml({
    title: page.title, description: page.description, url: page.url, ogType: 'website', ogTitle: page.headline,
    schemas, stylesheet: '/insights/blog.css', extraCss: PAGE_CSS,
  })}
<body>
<a class="skip-link" href="#main">Skip to content</a>
${siteHeaderHtml({ pagePath: page.pagePath })}
<main id="main" tabindex="-1" class="blog-main"><article class="article">
<div class="article-breadcrumb" role="navigation" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><span aria-current="page">${esc(page.crumb)}</span></div>
<header class="article-header">
<h1 id="article-title">${esc(page.headline)}</h1><p class="article-lede">${esc(page.lede)}</p>
${BYLINE}</header>
<section class="article-body" aria-labelledby="article-title">
${page.body}
<h2 id="questions">Common questions</h2>
${faqHtml}
<p><em>${esc(page.reviewLine)}</em></p>
<div class="callout"><strong>Important</strong><p>${DISCLAIMER}</p></div>
<div class="article-cta">
  <h3>Want Joe to act for you?</h3>
  <p>Tell Joe what you are looking for, where and your budget. He will reply on WhatsApp with what the search involves and how he works.</p>
  <div class="article-cta-actions">
    <a href="${whatsapp(page.whatsappText)}" target="_blank" rel="noopener" data-cta-location="${page.ctaLocation}" data-lead-type="${page.leadType}">WhatsApp Joe →</a>
    <a class="article-cta-secondary" href="tel:+6581881488" data-cta-location="${page.ctaLocation}" data-lead-type="${page.leadType}">Call +65 8188 1488</a>
  </div>
</div>
</section></article></main>
${FOOTER}
<script src="/assets/conversion-tracking.js" defer></script>
${consentBannerHtml()}
</body>
</html>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let changed = 0;
  for (const page of PAGES) {
    const file = path.join(ROOT, page.path);
    const output = servicePage(page);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current === output) continue;
    if (checkOnly) {
      console.error(`::error file=${page.path}::generated service page is stale — run: node scripts/generate-buy-rent-pages.mjs`);
      process.exitCode = 1;
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, output);
      changed += 1;
    }
  }
  if (!process.exitCode) console.log(checkOnly ? `Buy and rent pages are current — ${PAGES.length} pages` : `Buy and rent pages: ${changed} page(s) written`);
}
