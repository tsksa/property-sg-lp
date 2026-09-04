#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml } from './lib/consent-banner.mjs';
import { siteFooterHtml } from './lib/site-footer.mjs';
import { mobileHeaderAssetsHtml } from './lib/mobile-header.mjs';
import { policySources } from './content/hdb-policy-august-2026.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'insights');
const checkOnly = process.argv.includes('--check');
const published = '2026-08-25';
const reviewed = '25 Aug 2026';

const SOURCES = {
  ehgFamily: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/couples-and-families/enhanced-cpf-housing-grant',
  resaleFamily: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/couples-and-families/cpf-housing-grant',
  resaleSingles: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/singles/cpf-housing-grant',
  phgFamily: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/couples-and-families/proximity-housing-grant',
  hfe: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/application-for-an-hdb-flat-eligibility-hfe-letter',
  cpfUse: 'https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home',
  cpfLimits: 'https://www.cpf.gov.sg/member/infohub/educational-resources/how-much-cpf-savings-you-can-use-for-your-home-purchase',
  cpfDownpayment: 'https://www.cpf.gov.sg/service/article/can-i-use-my-cpf-savings-for-the-down-payment-of-my-property',
  cpfRefund: 'https://www.cpf.gov.sg/service/article/do-i-have-to-refund-the-housing-grant-to-my-cpf-account-upon-sale-of-my-property',
};

const ARTICLES = [
  {
    slug: 'enhanced-cpf-housing-grant-singapore',
    modified: '2026-08-26',
    title: 'Enhanced CPF Housing Grant Singapore (2026) | Joe Tay',
    headline: 'Enhanced CPF Housing Grant: amounts and eligibility in 2026',
    description: 'Check 2026 Enhanced CPF Housing Grant amounts, income and employment rules, lease requirements and how EHG works for HDB buyers.',
    category: 'Housing grants',
    readTime: '9 min read',
    lede: 'The Enhanced CPF Housing Grant can reduce the flat price or loan required, but the amount depends on household profile, assessed income and the remaining lease.',
    body: `
<div class="callout"><strong>Current maximums</strong><p>Eligible first-timer families can receive up to <strong>$120,000</strong>. An eligible single buying alone can receive up to <strong>$60,000</strong>. The amount steps down as assessed income rises, and your HFE letter confirms the result.</p></div>

<h2>Who may qualify for EHG?</h2>
<p><strong>August 2026 clarification:</strong> the higher general HDB and resale-grant income ceilings do not raise the separate EHG limits below. See the <a href="/insights/hdb-income-ceiling-2026-ndr-changes.html">HDB income-ceiling update</a> before treating a $16,000 household ceiling as EHG eligibility.</p>
<table aria-label="Enhanced CPF Housing Grant requirements">
  <tr><th>Requirement</th><th>Current rule</th></tr>
  <tr><td>Applicant status</td><td>At least one core applicant must be a first-timer. Different grant shares apply to first-timer/second-timer couples and singles.</td></tr>
  <tr><td>Employment</td><td>An applicant or eligible core member must generally have worked continuously for at least 12 months, ending two months before the HFE application, and still be working at application.</td></tr>
  <tr><td>Income</td><td>For a first-timer family, average gross monthly household income must not exceed $9,000. For an eligible single buying alone, the assessed ceiling is $4,500.</td></tr>
  <tr><td>Flat lease</td><td>The flat must have more than 20 years remaining. It must cover the youngest eligible core member to age 95 for the full grant; otherwise EHG is pro-rated.</td></tr>
</table>

<h2>How the grant amount changes with income</h2>
<p>For a first-timer family, the published EHG table runs from $120,000 at household income of not more than $1,500 to $5,000 at $8,501–$9,000. For a single buying alone, the maximum is half the corresponding family amount, up to $60,000.</p>
<p>Do not estimate the grant using only the latest payslip. HDB assesses income over the prescribed period and applies household-specific rules. Use the <a href="/insights/hfe-letter-singapore-guide.html">HFE letter guide</a> to prepare the application.</p>

<h2>Can EHG be used for both BTO and resale flats?</h2>
<p>Yes, subject to eligibility. First-timer households may use EHG for an eligible new or resale flat. A resale buyer must first qualify for the applicable CPF Housing Grant before EHG is considered.</p>
<p>The grant is credited to eligible members' CPF accounts for the flat purchase. It reduces the amount you need to fund from CPF, cash and a housing loan; it is not paid out as spending cash.</p>

<h2>What happens when you sell?</h2>
<p>CPF Board states that CPF used for the property—including housing grants—and accrued interest must be refunded to CPF when the property is sold, subject to the applicable refund rules and available sale proceeds. Model the purchase conservatively with the <a href="/calculator/">HDB loan calculator</a>.</p>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against HDB's <a href="${SOURCES.ehgFamily}" rel="noopener">Enhanced CPF Housing Grant</a> rules, its <a href="${SOURCES.hfe}" rel="noopener">HFE letter guide</a>, and CPF Board's <a href="${SOURCES.cpfRefund}" rel="noopener">housing-grant refund guidance</a>.</p>`,
    faqs: [
      ['What is the maximum Enhanced CPF Housing Grant in 2026?', 'The maximum is $120,000 for an eligible first-timer family and $60,000 for an eligible single buying alone. Actual amounts depend on assessed income, household profile, flat lease and the prevailing rules.'],
      ['What is the EHG income ceiling?', 'For a first-timer family, the average gross monthly household income ceiling is $9,000. For an eligible single buying alone, the assessed ceiling is $4,500.'],
      ['Does an HDB grant need to be refunded when the flat is sold?', 'CPF Board states that CPF withdrawn for the property, including housing grants, and accrued interest must be refunded to CPF upon sale, subject to the applicable refund rules and available sale proceeds.'],
    ],
  },
  {
    slug: 'hdb-resale-grants-singapore',
    modified: '2026-08-26',
    title: 'HDB Resale Grants Singapore (2026): Amounts | Joe Tay',
    headline: 'HDB resale grants in 2026: family, singles and proximity amounts',
    description: 'Compare current HDB resale grants for families and singles, including CPF Housing Grant, EHG and Proximity Housing Grant amounts.',
    category: 'Resale grants',
    readTime: '10 min read',
    lede: 'A resale-flat buyer may qualify for more than one grant, but each layer has different first-timer, income, household, property and proximity conditions.',
    body: `
<table aria-label="Current HDB resale grant amounts">
  <tr><th>Grant</th><th>Families</th><th>Single buying alone</th></tr>
  <tr><td>CPF Housing Grant, 2- to 4-room resale flat</td><td>Up to $80,000</td><td>Up to $40,000</td></tr>
  <tr><td>CPF Housing Grant, 5-room or bigger resale flat</td><td>Up to $50,000</td><td>Up to $25,000</td></tr>
  <tr><td>Enhanced CPF Housing Grant</td><td>Up to $120,000</td><td>Up to $60,000</td></tr>
  <tr><td>Proximity Housing Grant: live with parent/child</td><td>$30,000</td><td>$15,000</td></tr>
  <tr><td>Proximity Housing Grant: live within 4 km</td><td>$20,000</td><td>$10,000</td></tr>
</table>
<p>These are headline maximums, not an automatic package. Your HFE letter assesses the household and confirms which grants can be combined.</p>

<h2>CPF Housing Grant for resale flats</h2>
<p>Eligible first-timer families may receive $80,000 for a 2- to 4-room resale flat or $50,000 for a 5-room or larger flat. An eligible first-timer single buying alone may receive $40,000 or $25,000 respectively.</p>
<p>For HFE applications from <strong>24 August 2026</strong>, the general CPF Housing Grant income ceiling is <strong>$16,000 for a family</strong> and <strong>$8,000 for an eligible single buying alone</strong>. Eligible extended families may use the $24,000 ceiling, with each family nucleus within $16,000. Household, citizenship, flat-type and property-ownership conditions still apply.</p>
<p>Income-ceiling update checked 26 Aug 2026 against <a href="${policySources.announcement}" rel="noopener">HDB's announcement</a> and Annex A. Existing HFE holders should read the <a href="/insights/hdb-income-ceiling-2026-ndr-changes.html">transition rules</a> before reapplying. This is not an increase in grant amounts or in the separate EHG income ceiling.</p>

<h2>Enhanced CPF Housing Grant</h2>
<p>EHG adds income-tiered support. A first-timer family can receive up to $120,000, while a single buying alone can receive up to $60,000. The remaining lease must be more than 20 years and cover the youngest eligible core member to age 95 for the full EHG amount.</p>
<p>Read the <a href="/insights/enhanced-cpf-housing-grant-singapore.html">full EHG guide</a> before treating an online estimate as available funds.</p>

<h2>Proximity Housing Grant</h2>
<p>PHG supports eligible resale buyers who live with or near parents or children. Families may receive $30,000 when living together or $20,000 when living within 4 km. Eligible singles receive half those amounts.</p>
<p>Unlike most housing grants, PHG has no income ceiling, but it has household, relationship, residence, distance and one-time usage conditions. Confirm the addresses and distance through HDB before committing.</p>

<h2>Plan using the net purchase price</h2>
<ol>
  <li>Apply for an HFE letter before taking a resale Option to Purchase.</li>
  <li>Use confirmed grants to calculate the net purchase price.</li>
  <li>Budget cash for option fees, any cash-over-valuation and other non-CPF items.</li>
  <li>Estimate the remaining loan with the <a href="/calculator/">HDB loan calculator</a>.</li>
</ol>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against HDB's current <a href="${SOURCES.resaleFamily}" rel="noopener">family resale grant</a>, <a href="${SOURCES.resaleSingles}" rel="noopener">Singles Grant</a>, <a href="${SOURCES.ehgFamily}" rel="noopener">EHG</a> and <a href="${SOURCES.phgFamily}" rel="noopener">PHG</a> guidance.</p>`,
    faqs: [
      ['How much HDB resale grant can a family receive?', 'The CPF Housing Grant is up to $80,000 for an eligible family buying a 2- to 4-room resale flat or $50,000 for a 5-room or larger flat. EHG and PHG may be added if the household meets their separate conditions.'],
      ['What is the Proximity Housing Grant amount?', 'Eligible families may receive $30,000 to live with parents or children, or $20,000 to live within 4 km. Eligible singles receive $15,000 or $10,000 respectively.'],
      ['Can I receive both EHG and the Proximity Housing Grant?', 'Potentially, yes. The grants have separate conditions and can be combined for an eligible resale purchase, but the HFE letter confirms the actual household entitlement.'],
    ],
  },
  {
    slug: 'use-cpf-buy-hdb-flat-singapore',
    title: 'Using CPF to Buy an HDB Flat (2026) | Joe Tay',
    headline: 'Using CPF to buy an HDB flat: downpayment, limits and refunds',
    description: 'Learn how CPF OA can fund an HDB downpayment, monthly instalments, stamp and legal fees, plus valuation and withdrawal limits.',
    category: 'CPF planning',
    readTime: '9 min read',
    lede: 'CPF Ordinary Account savings can cover several housing costs, but the flat lease, valuation, loan type and retirement safeguards determine how much is usable.',
    body: `
<h2>What CPF OA can pay for</h2>
<ul>
  <li>Eligible portions of the purchase price and downpayment.</li>
  <li>Housing-loan principal and interest.</li>
  <li>Eligible stamp duty and legal fees.</li>
  <li>Home Protection Scheme premiums for HDB flats.</li>
</ul>
<p>CPF housing grants are also credited into eligible members' CPF accounts for the purchase. They are not a cash rebate.</p>

<h2>How the CPF usage limit changes by purchase</h2>
<table aria-label="CPF usage for different HDB purchases">
  <tr><th>Purchase and loan</th><th>General CPF OA treatment</th></tr>
  <tr><td>New HDB flat with HDB loan</td><td>OA savings may be used for the full purchase price, including the housing loan, subject to CPF rules.</td></tr>
  <tr><td>Resale HDB flat with HDB loan</td><td>OA usage is generally capped at the lower of purchase price and valuation. Any cash-over-valuation must be paid in cash.</td></tr>
  <tr><td>HDB flat with bank loan</td><td>OA may generally be used up to the valuation limit, then up to 120% of that limit if the applicable Basic Retirement Sum condition is met.</td></tr>
</table>

<h2>Remaining lease matters</h2>
<p>Where the remaining lease can cover the youngest owner to age 95, CPF usage may reach the applicable full limit. If it cannot, CPF usage is pro-rated. A flat with 20 years or less remaining generally cannot be funded using CPF under the usual housing rules.</p>

<h2>Should you empty the OA?</h2>
<p>CPF Board highlights the option to retain up to $20,000 in the OA at the point of purchase. Keeping a buffer can protect monthly instalments during job changes or unexpected expenses and preserves retirement compounding.</p>
<p>Compare a larger CPF downpayment with a smaller loan using the <a href="/calculator/">HDB loan calculator</a>. The lowest loan is not automatically the best outcome if it leaves no liquidity. One thing CPF cannot pay for is renovation — budget that separately with the <a href="/renovation-loan-calculator/">renovation loan calculator</a>.</p>

<h2>Monthly instalments and Home Protection Scheme</h2>
<p>CPF OA can be used for eligible HDB housing-loan instalments. HDB flat owners using CPF for monthly instalments must generally be insured under the Home Protection Scheme, subject to HPS eligibility and coverage rules.</p>

<h2>What happens on sale?</h2>
<p>The CPF principal used for the property—including applicable housing grants—and accrued interest must be refunded to CPF when the home is sold, subject to the prevailing refund rules and available sale proceeds. This is your own CPF being restored for future housing or retirement use, not an additional tax.</p>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against CPF Board's <a href="${SOURCES.cpfUse}" rel="noopener">Using your CPF to buy a home</a>, <a href="${SOURCES.cpfLimits}" rel="noopener">CPF housing usage limits</a>, <a href="${SOURCES.cpfDownpayment}" rel="noopener">downpayment guidance</a> and <a href="${SOURCES.cpfRefund}" rel="noopener">grant refund guidance</a>.</p>`,
    faqs: [
      ['Can CPF pay the full HDB downpayment?', 'For an HDB loan, the downpayment can generally be paid using CPF OA, cash or both, subject to available savings and CPF usage rules. A bank loan still requires the applicable minimum cash portion.'],
      ['Can CPF pay cash over valuation for a resale flat?', 'No. The amount above the HDB valuation is cash-over-valuation and must be paid in cash. CPF usage is based on the applicable valuation and withdrawal limits.'],
      ['Must CPF used for housing be refunded when I sell?', 'Yes. CPF Board requires the principal CPF used for the property, including applicable housing grants, and accrued interest to be refunded upon sale, subject to the prevailing rules and available sale proceeds.'],
    ],
  },
  {
    slug: 'hdb-downpayment-cash-cpf-grants',
    title: 'HDB Downpayment: Cash, CPF and Grants (2026) | Joe Tay',
    headline: 'HDB downpayment in 2026: how cash, CPF and grants fit together',
    description: 'Plan an HDB downpayment using cash, CPF OA and housing grants, including HDB versus bank loan requirements and resale cash costs.',
    category: 'Purchase budget',
    readTime: '9 min read',
    lede: 'The headline downpayment is only one part of the cash plan. Loan type, option fees, valuation, grants and available CPF OA determine what must come from your bank account.',
    body: `
<table aria-label="HDB and bank loan downpayment comparison">
  <tr><th>Financing</th><th>At 75% LTV</th><th>How the 25% downpayment may be paid</th></tr>
  <tr><td>HDB housing loan</td><td>25%</td><td>CPF OA, cash or both, subject to CPF rules and available savings</td></tr>
  <tr><td>Bank housing loan</td><td>25%</td><td>At least 5% of the lower purchase price or valuation in cash; the balance may use CPF OA or cash</td></tr>
</table>
<p>The actual loan may be below 75% after age, lease, income, debts and credit assessment. A lower approved loan increases the amount you must fund. Work the numbers for a new flat with the <a href="/bto-calculator/">BTO calculator</a> — it shows the 25% downpayment and option fee at your budget.</p>

<h2>Cash items buyers often miss</h2>
<ul>
  <li><strong>Option fees:</strong> the required option fee—and for resale, the option exercise fee—must be paid in cash before CPF reimbursement rules are considered.</li>
  <li><strong>Cash over valuation:</strong> for a resale flat, any price above HDB's valuation must be cash.</li>
  <li><strong>Bank-loan cash minimum:</strong> at 75% LTV, at least 5% must be cash.</li>
  <li><strong>Non-purchase buffer:</strong> keep room for renovation, moving, insurance and emergency savings.</li>
</ul>

<h2>How housing grants reduce the amount needed</h2>
<p>Confirmed grants are credited to eligible members' CPF accounts and applied to the flat purchase. They can reduce the purchase amount that must be covered by existing CPF OA, cash and the housing loan.</p>
<p>Do not subtract a headline maximum before receiving the HFE result. Start with the <a href="/insights/hdb-resale-grants-singapore.html">HDB resale grant guide</a> and <a href="/insights/enhanced-cpf-housing-grant-singapore.html">EHG guide</a>.</p>

<h2>A $600,000 resale-flat example</h2>
<p>Assume the price and HDB valuation are both $600,000 and the buyer qualifies for 75% LTV. The loan ceiling is $450,000 and the downpayment is $150,000.</p>
<ul>
  <li>With an HDB loan, the $150,000 may be funded with available CPF OA, confirmed grants, cash or a combination.</li>
  <li>With a bank loan, at least $30,000 is cash. The remaining $120,000 may use CPF OA, grants or cash, subject to the rules.</li>
  <li>If the agreed price were $620,000 but HDB valued the flat at $600,000, the additional $20,000 cash-over-valuation would also be cash.</li>
</ul>

<h2>Build the budget in the right order</h2>
<ol>
  <li>Get a valid HFE letter and confirmed grants.</li>
  <li>Check available CPF OA and whether you want to retain a buffer.</li>
  <li>Separate mandatory cash items from CPF-eligible costs.</li>
  <li>Estimate the remaining loan and payment using the <a href="/calculator/">HDB loan calculator</a>.</li>
  <li><a href="/calculator/#resaleCashPanel">Check resale cash needed</a> using your purchase price, valuation, confirmed loan, usable CPF and cost reserves. Include any deposit already paid only once.</li>
  <li>Keep a contingency below the maximum affordable price.</li>
</ol>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against CPF Board's <a href="${SOURCES.cpfDownpayment}" rel="noopener">property downpayment</a> and <a href="${SOURCES.cpfLimits}" rel="noopener">housing usage limit</a> guidance, plus HDB's <a href="${SOURCES.hfe}" rel="noopener">HFE letter process</a>.</p>`,
    faqs: [
      ['How much is the HDB downpayment with an HDB loan?', 'At the current maximum 75% LTV, the downpayment is 25%. It may generally be paid using CPF OA, cash or both, subject to CPF rules and the buyer’s available savings.'],
      ['How much cash is needed with a bank loan for an HDB flat?', 'At 75% LTV, at least 5% of the lower purchase price or valuation must be paid in cash. The remainder of the downpayment may use CPF OA or cash, subject to applicable rules.'],
      ['Can HDB grants pay the downpayment?', 'Confirmed housing grants are credited to eligible members’ CPF accounts and applied to the flat purchase, reducing the amount that must come from existing CPF OA, cash or a housing loan.'],
    ],
  },
];

const LOAN_GUIDES = [
  ['hdb-income-ceiling-2026-ndr-changes', 'August 2026 HDB income ceilings and HFE changes'],
  ['hdb-loan-eligibility-singapore', 'HDB loan eligibility'],
  ['hfe-letter-singapore-guide', 'HFE letter application guide'],
  ['msr-vs-tdsr-singapore', 'MSR versus TDSR'],
  ['hdb-loan-vs-bank-loan-singapore', 'HDB loan versus bank loan'],
];

const EDITORIAL_GUIDES = [
  ['hdb-valuation-explained', 'HDB valuation explained'],
  ['how-long-to-sell-hdb-singapore-2026', 'How long it takes to sell an HDB flat'],
  ['property-agent-commission-singapore', 'Property agent commission in Singapore'],
  ['selling-hdb-after-mop-singapore', 'Selling an HDB flat after MOP'],
];

const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function schemas(article) {
  const url = `https://joetay.com/insights/${article.slug}.html`;
  return [
    {
      '@context': 'https://schema.org', '@type': 'Article', headline: article.headline,
      description: article.description, image: 'https://joetay.com/joetay-social-preview.jpg',
      datePublished: published, dateModified: article.modified || published, inLanguage: 'en-SG',
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
  return `<aside class="callout" aria-labelledby="related-guides-title"><strong id="related-guides-title">HDB grants and financing guides</strong><ul style="margin-bottom:0">
    <li><a href="/calculator/">HDB loan calculator</a></li>
${ARTICLES.filter((article) => article.slug !== currentSlug).map((article) => `    <li><a href="${article.slug}.html">${esc(article.headline)}</a></li>`).join('\n')}
${LOAN_GUIDES.map(([slug, title]) => `    <li><a href="${slug}.html">${esc(title)}</a></li>`).join('\n')}
${EDITORIAL_GUIDES.map(([slug, title]) => `    <li><a href="${slug}.html">${esc(title)}</a></li>`).join('\n')}
  </ul></aside>`;
}

function page(article) {
  const url = `https://joetay.com/insights/${article.slug}.html`;
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
<meta property="article:published_time" content="${published}">
<meta property="article:modified_time" content="${article.modified || published}">
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
<header class="article-header"><div class="article-meta-top"><span class="cat">${esc(article.category)}</span><span class="dot" aria-hidden="true">·</span><span>${article.readTime}</span><span class="dot" aria-hidden="true">·</span><time datetime="${article.modified || published}">${article.modified ? 'Updated Aug 26, 2026' : 'Aug 25, 2026'}</time></div>
<h1 id="article-title">${esc(article.headline)}</h1><p class="article-lede">${esc(article.lede)}</p>
<div class="article-byline"><picture><source type="image/webp" srcset="/joe-tay-propertysg-advisor-400.webp"><img src="/joe-tay-propertysg-advisor-400.jpg" alt="Joe Tay" width="40" height="40" loading="lazy" decoding="async"></picture><div>By <strong><a href="/about-joe/">Joe Tay</a></strong> · District Director, ERA Realty Network · CEA R009618D</div></div></header>
<section class="article-body" aria-labelledby="article-title">
${article.body}
${relatedGuides(article.slug)}
<h2>Frequently asked questions</h2>
${faqHtml}
<div class="callout"><strong>Important</strong><p>This guide is general education, not a grant decision or personal financial advice. HDB and CPF Board apply the prevailing rules to the household and property details in the HFE and purchase applications.</p></div>
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
    console.error(`::error file=insights/${article.slug}.html::generated HDB grants article is stale`);
    process.exitCode = 1;
  } else {
    fs.writeFileSync(file, output);
    changed += 1;
  }
}

if (!process.exitCode) console.log(checkOnly ? `HDB grants cluster is current — ${ARTICLES.length} articles` : `HDB grants cluster: ${changed} article(s) written`);
