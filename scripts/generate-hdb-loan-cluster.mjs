#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml } from './lib/consent-banner.mjs';
import { siteFooterHtml } from './lib/site-footer.mjs';
import { mobileHeaderAssetsHtml } from './lib/mobile-header.mjs';
import { hdbPolicyArticle, policySources } from './content/hdb-policy-august-2026.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'insights');
const checkOnly = process.argv.includes('--check');
const published = '2026-08-25';
const reviewed = '25 Aug 2026';

const SOURCES = {
  loan: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb',
  rate: 'https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate',
  hfe: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/application-for-an-hdb-flat-eligibility-hfe-letter',
  ratios: 'https://www.cpf.gov.sg/member/home-ownership/home-buying-guide-for-members-below-55',
  compare: 'https://www.cpf.gov.sg/member/infohub/educational-resources/3-differences-between-hdb-loan-and-bank-loan',
};

const ARTICLES = [
  {
    slug: 'hdb-loan-eligibility-singapore',
    title: 'HDB Loan Eligibility Singapore (2026) | Joe Tay',
    headline: 'HDB loan eligibility in Singapore: the 2026 requirements',
    description: 'Check HDB loan eligibility, income ceilings, LTV, tenure, MSR and HFE requirements using current official HDB rules, then estimate affordability.',
    category: 'Home financing',
    readTime: '9 min read',
    lede: 'Eligibility is only the first gate. Your HFE letter, age, income, debts, flat lease and credit assessment determine the actual HDB loan amount.',
    body: `
<div class="callout"><strong>Quick answer</strong><p>You generally need at least one Singapore Citizen applicant, no more than one previous HDB housing loan, income within the applicable ceiling, and no disqualifying private-property interest. HDB still performs a credit assessment, so meeting the headline rules does not guarantee the maximum loan.</p></div>

<h2>Who can qualify for an HDB housing loan?</h2>
<table aria-label="HDB housing loan eligibility requirements">
  <tr><th>Requirement</th><th>Current rule</th></tr>
  <tr><td>Citizenship</td><td>At least one applicant must be a Singapore Citizen.</td></tr>
  <tr><td>Previous HDB loans</td><td>Core household members must not have taken two or more HDB housing loans.</td></tr>
  <tr><td>Average gross monthly household income</td><td>Up to $16,000 for families, $24,000 for extended families, or $8,000 for singles under the Single Singapore Citizen Scheme.</td></tr>
  <tr><td>Private residential property</td><td>Applicants and occupiers must not own one locally or overseas, and generally must not have disposed of one within the previous 30 months.</td></tr>
  <tr><td>Flat lease</td><td>The remaining lease affects both CPF use and the maximum loan. A lease that does not cover the youngest applicant to age 95 can reduce the LTV limit.</td></tr>
</table>
<p>These are summaries, not a substitute for an HFE outcome. Read the <a href="${SOURCES.loan}" rel="noopener">full HDB eligibility conditions</a> before committing to a purchase.</p>
<p><strong>Income-ceiling update checked 26 Aug 2026:</strong> these revised limits apply to HFE applications from <strong>24 August 2026</strong>. For an extended family, each family nucleus must also stay within $16,000. Existing HFE holders should check the <a href="/insights/hdb-income-ceiling-2026-ndr-changes.html">August policy changes and transition rules</a>; $18,000 is the qualifying new-EC ceiling, not the general HDB loan ceiling.</p>

<h2>How much can HDB lend?</h2>
<p>For applications covered by the current rules, the HDB LTV limit is up to <strong>75% of the purchase price</strong> for a new flat, or up to 75% of the lower of the resale price and HDB value for a resale flat. That is a ceiling, not an entitlement.</p>
<p>The loan period is capped at the shortest of 25 years, 65 years minus the applicants' average age, or the remaining flat lease minus 20 years. HDB also considers income, job stability, existing debts, repayment records and cash savings.</p>
<p>Use the <a href="/calculator/">HDB loan calculator</a> to model the 25-year ceiling, the 30% MSR constraint and the current assessment assumptions before you shortlist flats.</p>

<h2>Why your approved amount can be lower than 75%</h2>
<ul>
  <li><strong>MSR:</strong> monthly instalments for HDB and applicable EC loans are capped at 30% of gross monthly income.</li>
  <li><strong>Existing debts:</strong> car, education, credit-card and other commitments affect affordability and credit assessment.</li>
  <li><strong>Age and lease:</strong> a shorter permitted tenure raises the monthly instalment; a short remaining lease may reduce LTV.</li>
  <li><strong>Income stability:</strong> HDB assesses whether applicants can sustain repayments, not only the current payslip total.</li>
</ul>

<h2>The practical sequence</h2>
<ol>
  <li>Estimate a conservative property budget with the <a href="/calculator/">calculator</a>.</li>
  <li>Apply for an <a href="/insights/hfe-letter-singapore-guide.html">HFE letter</a> before applying for a new flat or taking a resale OTP.</li>
  <li>Compare the HDB result with any bank IPA, including cash downpayment and rate risk.</li>
  <li>Keep a buffer for stamp duty, legal fees, renovation and income changes.</li>
</ol>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against HDB's <a href="${SOURCES.loan}" rel="noopener">Housing Loan from HDB</a>, <a href="${SOURCES.hfe}" rel="noopener">HFE application guide</a> and <a href="${SOURCES.rate}" rel="noopener">concessionary interest-rate page</a>.</p>`,
    faqs: [
      ['What is the HDB loan income ceiling in 2026?', 'For HFE applications from 24 August 2026, the average gross monthly household income ceiling is $16,000 for families, $24,000 for extended families with each family nucleus within $16,000, and $8,000 for singles under the Single Singapore Citizen Scheme, subject to the full HDB conditions.'],
      ['Can I borrow 75% from HDB automatically?', 'No. Seventy-five per cent is the maximum LTV under the current rules. Your approved amount can be lower after MSR, age, remaining lease, income, debts and credit assessment are considered.'],
      ['Do I need an HFE letter for a resale HDB flat?', 'Yes. A buyer must have a valid HFE letter before obtaining an Option to Purchase from a resale-flat seller and when submitting the resale application.'],
    ],
  },
  {
    slug: 'hfe-letter-singapore-guide',
    title: 'HFE Letter Singapore: Application Guide (2026) | Joe Tay',
    headline: 'HFE letter Singapore: what it covers and when to apply',
    description: 'A current HFE letter guide covering eligibility checks, HDB loan and grant outcomes, application timing, validity, documents and bank IPA options.',
    category: 'HFE letter',
    readTime: '8 min read',
    lede: 'The HFE letter brings flat eligibility, CPF housing grants and HDB loan eligibility into one outcome. Apply before you start making binding purchase decisions.',
    body: `
<div class="callout"><strong>Timing matters</strong><p>For a new flat, you need a valid HFE letter when you apply. For a resale flat, you need it before the seller grants you an Option to Purchase and again when the resale application is submitted.</p></div>

<h2>August 2026 income-ceiling transition</h2>
<p>HFE applications from 24 August 2026 use the revised ceilings. Already-eligible holders of valid letters need no action solely for this change. If your valid letter excluded you because of the old income ceiling and you have not submitted a flat application, HDB allows cancellation and reapplication. Applications submitted before 24 August and still processing use the old ceilings unless replaced with a fresh application.</p>
<p>A fresh application uses a new income-assessment period. Do not cancel without checking your circumstances, especially if a flat application is underway. For the November 2026 BTO exercise, HDB advises submitting all HFE documents by 25 September 2026. Transition guidance checked 26 Aug 2026 against <a href="${policySources.annexB}" rel="noopener">HDB Annex B</a>; see the <a href="/insights/hdb-income-ceiling-2026-ndr-changes.html">full income-ceiling and BTO update</a>.</p>

<h2>What an HFE letter tells you</h2>
<ul>
  <li>Your eligibility to buy a new or resale HDB flat.</li>
  <li>The CPF housing grants you may qualify for and their indicative amounts.</li>
  <li>Whether you qualify for an HDB housing loan and the eligible loan amount.</li>
  <li>For second-timers, applicable resale levy or premium information.</li>
</ul>
<p>The letter does not replace your own affordability planning. Compare the HFE result with a cash-flow estimate from the <a href="/calculator/">HDB loan calculator</a>.</p>

<h2>How to apply</h2>
<ol>
  <li>Log in to the HDB Flat Portal using Singpass.</li>
  <li>Complete the preliminary HFE check.</li>
  <li>Submit the full HFE application with all applicants and required occupiers.</li>
  <li>Retrieve Myinfo details and provide any additional income documents HDB requests.</li>
  <li>Wait for the result by SMS and email.</li>
</ol>
<p>HDB states that processing can take up to one month after receiving the complete document set, and may take longer around sales exercises. The online application is free.</p>

<h2>How long is the HFE letter valid?</h2>
<p>An HFE letter is valid for <strong>nine months from issue</strong>. If it will expire within 30 days and you still need time to submit a new or resale application, HDB says to apply for a fresh letter.</p>
<p>A used HFE letter can continue supporting the submitted flat application after expiry. Changes to household members, marital status, citizenship or property ownership can trigger a review or require a fresh application.</p>

<h2>Can you compare bank loans during the HFE process?</h2>
<p>Yes. HDB's integrated loan application service lets buyers request an In-Principle Approval from participating financial institutions while applying for the HFE letter. An IPA is indicative; the confirmed Letter of Offer comes later after a flat is secured.</p>
<p>Before choosing, compare the current differences in <a href="/insights/hdb-loan-vs-bank-loan-singapore.html">HDB loans versus bank loans</a>, including cash downpayment, rate variability, lock-ins and refinancing options.</p>

<h2>Documents and details to prepare</h2>
<ul>
  <li>Singpass access for every applicant and required occupier.</li>
  <li>Accurate household, employment, income and property-ownership details.</li>
  <li>Supporting income documents where Myinfo does not contain everything required.</li>
  <li>A realistic budget below the maximum loan amount, including duties and renovation.</li>
</ul>

<h2>Official source and review date</h2>
<p>Reviewed ${reviewed} against HDB's <a href="${SOURCES.hfe}" rel="noopener">Application for an HFE Letter</a> and <a href="${SOURCES.loan}" rel="noopener">Housing Loan from HDB</a> pages.</p>`,
    faqs: [
      ['How long does an HFE letter application take?', 'HDB says processing can take up to one month after it receives all required documents, and may take longer before or during a sales exercise.'],
      ['How long is an HFE letter valid?', 'An HFE letter is valid for nine months from its issue date. A used letter can continue supporting the submitted flat application after it expires.'],
      ['Is an HFE letter free?', 'Yes. HDB states that the online HFE application is free of charge.'],
    ],
  },
  {
    slug: 'msr-vs-tdsr-singapore',
    title: 'MSR vs TDSR Singapore: HDB Loan Limits Explained | Joe Tay',
    headline: 'MSR vs TDSR in Singapore: how both limit your home loan',
    description: 'Understand Singapore MSR and TDSR limits, the 30% and 55% thresholds, worked examples and how existing debts affect HDB affordability.',
    category: 'Affordability',
    readTime: '8 min read',
    lede: 'MSR measures the housing instalment. TDSR measures all monthly debt. For an HDB purchase, the tighter result—not the larger percentage—sets the practical limit.',
    body: `
<table aria-label="Difference between MSR and TDSR">
  <tr><th>Ratio</th><th>What it measures</th><th>Current ceiling</th></tr>
  <tr><td>MSR</td><td>Monthly instalments for the HDB flat or applicable executive condominium loan</td><td>30% of gross monthly income</td></tr>
  <tr><td>TDSR</td><td>All monthly debt repayments, including the new home loan</td><td>55% of gross monthly income</td></tr>
</table>

<h2>A worked example</h2>
<p>Take a household with $8,000 gross monthly income and a $900 monthly car loan.</p>
<ul>
  <li><strong>MSR ceiling:</strong> $8,000 × 30% = $2,400 for the housing instalment.</li>
  <li><strong>TDSR ceiling:</strong> $8,000 × 55% = $4,400 for all debts. After the $900 car loan, $3,500 remains.</li>
</ul>
<p>The HDB instalment is therefore constrained by the lower $2,400 MSR result, before the lender's interest-rate stress test and credit assessment.</p>

<h2>When TDSR becomes the tighter limit</h2>
<p>With the same $8,000 income but $2,500 of existing monthly debt, TDSR leaves only $1,900 for the new home loan. That is below the $2,400 MSR ceiling, so TDSR becomes the practical constraint.</p>
<p>Existing debts can include car, education, personal and other property loans, plus assessed credit-card obligations. Paying down debt can change affordability, but do not close facilities or restructure borrowing purely to pass a ratio without understanding the lender's rules.</p>

<h2>Why a ratio-compliant loan can still be uncomfortable</h2>
<p>The regulatory ceilings are not a recommended household budget. They do not know your childcare costs, renovation plan, variable income or retirement targets. CPF recommends prudent planning and notes that a lower housing ratio can leave more room for other commitments.</p>
<p>Use the <a href="/calculator/">HDB loan calculator</a> to test a lower monthly budget, then compare it with your <a href="/insights/hdb-loan-eligibility-singapore.html">HDB loan eligibility</a> and eventual HFE result.</p>

<h2>Three useful stress tests</h2>
<ol>
  <li>Run the budget using stable base income rather than bonuses.</li>
  <li>Check whether the payment still works if one income falls temporarily.</li>
  <li>Keep cash and CPF buffers after downpayment, duties and renovation.</li>
</ol>

<h2>Official source and review date</h2>
<p>Reviewed ${reviewed} against CPF Board's <a href="${SOURCES.ratios}" rel="noopener">home-buying guide</a>, which states the current 30% MSR and 55% TDSR ceilings.</p>`,
    faqs: [
      ['What is the MSR limit in Singapore?', 'MSR is capped at 30% of gross monthly income for housing loans used to buy an HDB flat or an executive condominium whose minimum occupation period has not expired.'],
      ['What is the TDSR limit in Singapore?', 'TDSR is capped at 55% of gross monthly income and includes all assessed monthly debt repayments, including the new housing loan.'],
      ['Do both MSR and TDSR apply to an HDB bank loan?', 'For an HDB purchase, lenders assess the applicable housing and total-debt limits. The practical housing instalment is constrained by whichever assessment produces the lower permitted amount.'],
    ],
  },
  {
    slug: 'hdb-loan-vs-bank-loan-singapore',
    title: 'HDB Loan vs Bank Loan Singapore (2026) | Joe Tay',
    headline: 'HDB loan vs bank loan in Singapore: a 2026 comparison',
    description: 'Compare HDB and bank housing loans by interest rate, downpayment, CPF use, lock-in, early repayment and refinancing before choosing.',
    category: 'Loan comparison',
    readTime: '9 min read',
    lede: 'The cheapest advertised rate is not the whole decision. Cash downpayment, rate resets, lock-in clauses and the one-way switch away from HDB matter too.',
    body: `
<table aria-label="HDB housing loan and bank loan comparison">
  <tr><th>Feature</th><th>HDB housing loan</th><th>Bank housing loan</th></tr>
  <tr><td>Interest</td><td>2.6% p.a. for Jul–Sep 2026; pegged 0.1 percentage point above the CPF OA rate</td><td>Market package; fixed or floating terms can change</td></tr>
  <tr><td>Maximum LTV</td><td>Up to 75%, subject to eligibility and assessment</td><td>Generally up to 75% for a first housing loan, subject to lender and regulatory rules</td></tr>
  <tr><td>Minimum downpayment at 75% LTV</td><td>25%, payable using CPF OA, cash or both</td><td>25%, with at least 5% in cash and the balance in cash or CPF OA</td></tr>
  <tr><td>Lock-in and early repayment</td><td>No lock-in or early repayment penalty</td><td>Lock-in periods and early repayment charges may apply</td></tr>
  <tr><td>Future switch</td><td>Can refinance to a bank later</td><td>Cannot switch that flat's bank loan back to an HDB housing loan</td></tr>
</table>

<h2>When an HDB loan may fit better</h2>
<ul>
  <li>You qualify and value a stable published rate.</li>
  <li>You need the option to use CPF OA or cash for the full downpayment.</li>
  <li>You want flexibility to make lump-sum repayments without a bank penalty.</li>
  <li>You prefer keeping the option to refinance to a bank later.</li>
</ul>

<h2>When a bank loan may fit better</h2>
<ul>
  <li>You do not qualify for an HDB housing loan.</li>
  <li>You have enough cash for the mandatory cash portion of the downpayment.</li>
  <li>You understand the package after its fixed period and can absorb rate changes.</li>
  <li>You are comfortable with the lock-in, repricing and redemption terms.</li>
</ul>

<h2>Compare the total package, not only year-one interest</h2>
<p>Ask each bank for the fixed-period rate, subsequent pricing formula, lock-in period, partial-prepayment terms, full-redemption charge, repricing fee and estimated effective cost. Model a higher future rate before choosing a floating or short fixed package.</p>
<p>Start with your HFE outcome and the <a href="/calculator/">HDB loan calculator</a>. Then compare the same property price, loan amount and tenure across offers.</p>

<h2>Downpayment example</h2>
<p>At a $600,000 flat price and 75% LTV, the minimum downpayment is $150,000. With an HDB loan, it may be paid using CPF OA, cash or both. With a bank loan, at least $30,000 (5% of the flat price) must be cash, while the remaining $120,000 can be cash or CPF OA, subject to applicable rules.</p>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against HDB's <a href="${SOURCES.rate}" rel="noopener">interest-rate page</a> and CPF Board's current <a href="${SOURCES.compare}" rel="noopener">HDB loan or bank loan comparison</a>. Bank packages are not quoted because they change; obtain current written offers.</p>`,
    faqs: [
      ['What is the HDB housing loan interest rate in 2026?', 'HDB publishes a 2.6% concessionary rate for 1 July to 30 September 2026. The rate is pegged 0.1 percentage point above the prevailing CPF Ordinary Account rate and can be reviewed quarterly.'],
      ['Can I switch from a bank loan back to an HDB loan?', 'No. CPF Board states that a flat already financed with a bank loan cannot switch back to an HDB housing loan for that property.'],
      ['How much cash is required for an HDB flat with a bank loan?', 'At 75% LTV, the 25% downpayment includes at least 5% of the flat price in cash. The remaining 20% can be paid with cash or CPF OA, subject to the applicable rules.'],
    ],
  },
  hdbPolicyArticle,
];

const EXISTING_GUIDES = [
  ['hdb-valuation-explained', 'HDB valuation explained'],
  ['how-long-to-sell-hdb-singapore-2026', 'How long it takes to sell an HDB flat'],
  ['property-agent-commission-singapore', 'Property agent commission in Singapore'],
  ['selling-hdb-after-mop-singapore', 'Selling an HDB flat after MOP'],
];

const GRANT_GUIDES = [
  ['enhanced-cpf-housing-grant-singapore', 'Enhanced CPF Housing Grant'],
  ['hdb-resale-grants-singapore', 'HDB resale grants'],
  ['use-cpf-buy-hdb-flat-singapore', 'Using CPF to buy an HDB flat'],
  ['hdb-downpayment-cash-cpf-grants', 'HDB downpayment: cash, CPF and grants'],
];

const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function schemas(article) {
  const url = `https://joetay.com/insights/${article.slug}.html`;
  return [
    {
      '@context': 'https://schema.org', '@type': 'Article', headline: article.headline,
      description: article.description, image: 'https://joetay.com/joetay-social-preview.jpg',
      datePublished: article.published || published, dateModified: article.modified || '2026-08-26', inLanguage: 'en-SG',
      author: { '@type': 'Person', name: 'Joe Tay', url: 'https://joetay.com/about-joe/', jobTitle: 'District Director, ERA Realty Network', identifier: 'CEA R009618D' },
      publisher: { '@type': 'RealEstateAgent', name: 'PropertySG', url: 'https://joetay.com/', alternateName: 'Joe Tay' },
      mainEntityOfPage: url,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://joetay.com/' },
        { '@type': 'ListItem', position: 2, name: 'Insights', item: 'https://joetay.com/insights/' },
        { '@type': 'ListItem', position: 3, name: article.headline, item: url },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: article.faqs.map(([name, text]) => ({
        '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text },
      })),
    },
  ].map((schema) => `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`).join('\n');
}

function relatedGuides(currentSlug) {
  return `<aside class="callout" aria-labelledby="related-guides-title"><strong id="related-guides-title">HDB loan planning guides</strong><ul style="margin-bottom:0">
    <li><a href="/calculator/">HDB loan calculator</a></li>
${ARTICLES.filter((article) => article.slug !== currentSlug).map((article) => `    <li><a href="${article.slug}.html">${esc(article.headline)}</a></li>`).join('\n')}
${GRANT_GUIDES.map(([slug, title]) => `    <li><a href="${slug}.html">${esc(title)}</a></li>`).join('\n')}
${EXISTING_GUIDES.map(([slug, title]) => `    <li><a href="${slug}.html">${esc(title)}</a></li>`).join('\n')}
  </ul></aside>`;
}

function page(article) {
  const url = `https://joetay.com/insights/${article.slug}.html`;
  const modified = article.modified || '2026-08-26';
  const faqHtml = article.faqs.map(([question, answer]) => `<h3>${esc(question)}</h3>\n<p>${esc(answer)}</p>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en-SG">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(article.title)}</title>
<meta name="description" content="${esc(article.description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0b1e3f">
<link rel="manifest" href="/site.webmanifest">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en-SG" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="PropertySG">
<meta property="og:title" content="${esc(article.headline)}">
<meta property="og:description" content="${esc(article.description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="en_SG">
<meta property="og:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(article.headline)}">
<meta name="twitter:description" content="${esc(article.description)}">
<meta name="twitter:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta property="article:author" content="Joe Tay">
<meta property="article:published_time" content="${article.published || published}">
<meta property="article:modified_time" content="${modified}">
<meta property="article:section" content="${esc(article.category)}">
${schemas(article)}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="blog.css">
<style>.skip-link{position:absolute;left:-9999px;top:0;z-index:10050;background:#0b1e3f;color:#fff;padding:12px 20px;border-radius:0 0 10px 0;font-weight:700;text-decoration:none}.skip-link:focus{left:0;outline:2px solid #10b981;outline-offset:2px}</style>
<link rel="alternate" type="application/atom+xml" title="PropertySG Insights" href="https://joetay.com/insights/feed.xml">
<link rel="alternate" type="application/feed+json" title="PropertySG Insights (JSON Feed)" href="https://joetay.com/insights/feed.json">
<script>try{if(localStorage.getItem('pdpa_consent')==='declined'){window['ga-disable-GT-KVFDZD5V']=true;window._pdpaDeclined=true;}}catch(e){}</script>
<script>if(!window._pdpaDeclined){var gaS=document.createElement('script');gaS.async=true;gaS.src='https://www.googletagmanager.com/gtag/js?id=GT-KVFDZD5V';document.head.appendChild(gaS);}</script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GT-KVFDZD5V');</script>
${mobileHeaderAssetsHtml()}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="blog-topbar"><div class="blog-topbar-inner"><a href="/" class="blog-logo">PropertySG</a><nav class="blog-nav" aria-label="Primary"><a href="/">Home</a><a href="/insights/">Insights</a><a href="/calculator/">Calculator</a><a href="/#book" class="blog-nav-cta">Book a Call</a></nav></div></header>
<main id="main" tabindex="-1" class="blog-main"><article class="article">
<div class="article-breadcrumb" role="navigation" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><a href="/insights/">Insights</a><span class="sep">›</span><span aria-current="page">${esc(article.headline)}</span></div>
<header class="article-header"><div class="article-meta-top"><span class="cat">${esc(article.category)}</span><span class="dot" aria-hidden="true">·</span><span>${article.readTime}</span><span class="dot" aria-hidden="true">·</span><time datetime="${modified}">${article.published ? '' : 'Updated '}Aug 26, 2026</time></div>
<h1 id="article-title">${esc(article.headline)}</h1><p class="article-lede">${esc(article.lede)}</p>
<div class="article-byline"><picture><source type="image/webp" srcset="/joe-tay-propertysg-advisor-400.webp"><img src="/joe-tay-propertysg-advisor-400.jpg" alt="Joe Tay" width="40" height="40" loading="lazy" decoding="async"></picture><div>By <strong><a href="/about-joe/">Joe Tay</a></strong> · District Director, ERA Realty Network · CEA R009618D</div></div></header>
<section class="article-body" aria-labelledby="article-title">
${article.body}
${relatedGuides(article.slug)}
<h2>Frequently asked questions</h2>
${faqHtml}
<div class="callout"><strong>Important</strong><p>This guide is general education, not a loan offer or personal financial advice. HDB and financial institutions decide eligibility and loan amounts using the prevailing rules and your application details.</p></div>
</section></article></main>
<footer class="blog-footer">
${siteFooterHtml()}
<div class="blog-footer-inner"><p>&copy; 2026 PropertySG · <a href="/">Home</a> · <a href="/privacy-policy.html">Privacy Policy</a> · <a href="mailto:joe@joetay.com">joe@joetay.com</a></p><p class="creds">Joe Tay, District Director · ERA Realty Network Pte Ltd · Agency Lic. No. L3002382K · CEA Reg. No. R009618D</p></div>
</footer>
<script src="/assets/conversion-tracking.js" defer></script>
${consentBannerHtml()}
</body>
</html>
`;
}

let changed = 0;
for (const article of ARTICLES) {
  const file = path.join(OUT_DIR, `${article.slug}.html`);
  const output = page(article);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current === output) continue;
  if (checkOnly) {
    console.error(`::error file=insights/${article.slug}.html::generated HDB loan article is stale`);
    process.exitCode = 1;
  } else {
    fs.writeFileSync(file, output);
    changed += 1;
  }
}

if (!process.exitCode) console.log(checkOnly ? `HDB loan cluster is current — ${ARTICLES.length} articles` : `HDB loan cluster: ${changed} article(s) written`);
