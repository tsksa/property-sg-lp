#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml } from './lib/consent-banner.mjs';
import { siteFooterHtml } from './lib/site-footer.mjs';
import { mobileHeaderAssetsHtml } from './lib/mobile-header.mjs';
import { siteHeaderHtml, SITE_THEME_ASSETS_HTML } from './lib/site-header.mjs';
import { hdbPolicyArticle, policySources } from './content/hdb-policy-august-2026.mjs';
import { fontLinksHtml } from './lib/self-hosted-fonts.mjs';
import { injectToc } from './lib/article-toc.mjs';
import { injectCover, loadCover } from './lib/article-covers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'insights');
const checkOnly = process.argv.includes('--check');
const published = '2026-08-25';
const reviewed = '25 Aug 2026';

function visibleDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const SOURCES = {
  loan: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb',
  rate: 'https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate',
  hfe: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/application-for-an-hdb-flat-eligibility-hfe-letter',
  ratios: 'https://www.cpf.gov.sg/member/home-ownership/home-buying-guide-for-members-below-55',
  compare: 'https://www.cpf.gov.sg/member/infohub/educational-resources/3-differences-between-hdb-loan-and-bank-loan',
  hfeIncome: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/application-for-an-hdb-flat-eligibility-hfe-letter/income-guidelines-and-documents',
  hfeKeo: 'https://www.hdb.gov.sg/business/estate-agents-and-salespersons/letters-to-keos/Implementation-of-HDB-Flat-Eligibility-Letter',
};

// Primary sources for the HDB-vs-bank comparison. Bank rates are quoted only
// from each bank's own HDB-loan page, never from comparison sites or brokers.
const LOAN_SOURCES = {
  hdbRate: SOURCES.rate,
  hdbFi: 'https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-financial-institutions',
  cpfOa: 'https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest',
  masLtv: 'https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits',
  masMsr: 'https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules',
  masTdsr: 'https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr',
  mas2022: 'https://www.mas.gov.sg/news/media-releases/2022/measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand',
  sora: 'https://eservices.mas.gov.sg/statistics/dir/DomesticInterestRates.aspx',
  dbs: 'https://www.dbs.com.sg/personal/loans/home-loans/hdb-loan',
  uob: 'https://www.uob.com.sg/personal/borrow/property-loans/hdb-home-loan.page',
  ocbc: 'https://www.ocbc.com/personal-banking/loans/new-purchase-of-hdb-private-property',
};

// REFRESH STEP (monthly, and whenever HDB revises its rate in Jan/Apr/Jul/Oct):
// 1. Re-check HDB's rate page, the CPF OA rate, and the DBS, UOB and OCBC pages
//    above. Update the rates table, quick answer and FAQs in the
//    hdb-loan-vs-bank-loan-singapore entry; drop any package a bank no longer
//    publishes.
// 2. Read the latest 3M compounded SORA from MAS and update SORA_LATEST, the
//    SORA table and the break-even sentence.
// 3. Re-run the instalment maths if any rate changed, then bump `modified`,
//    the "Reviewed" line and BANK_RATES_CHECKED, and regenerate.
const BANK_RATES_CHECKED = { iso: '2026-10-30', label: '30 Oct 2026' };
const SORA_LATEST = { value: '1.2748%', valueDate: '29 Oct 2026', published: '30 Oct 2026' };
const RATE_STALE_DAYS = 45;

const ARTICLES = [
  {
    slug: 'hdb-loan-eligibility-singapore',
    title: 'HDB Loan Eligibility Singapore (2026) | PropertySG',
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
<p>Use the <a href="/calculator/">HDB loan calculator</a> to model the 25-year ceiling, the 30% MSR constraint and the current assessment assumptions before you shortlist flats. Buying at a launch instead of resale? The <a href="/bto-calculator/">BTO calculator</a> applies the same MSR and tenure rules to a new flat.</p>

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
    title: 'HFE Letter Application: Documents & Validity | PropertySG',
    modified: '2026-10-09',
    headline: 'HFE letter application: documents, validity and how to apply',
    description: 'How to apply for an HFE letter: the two steps, documents HDB may request, processing time, how to view your letter and its nine-month validity.',
    category: 'HFE letter',
    readTime: '10 min read',
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

<h2>HFE letter vs HLE letter: what changed</h2>
<p>The HFE letter replaced the HDB Loan Eligibility (HLE) letter, and the Intent to Buy used by resale buyers, from <strong>9 May 2023</strong>. The HLE letter only assessed whether you could take an HDB housing loan. The HFE letter combines three checks in one application: whether you can buy the flat, which CPF housing grants you qualify for, and your HDB loan eligibility. If an older guide mentions an HLE letter, the HFE letter is what you apply for today.</p>

<h2>HFE application: how to apply in two steps</h2>
<p>You apply online through the HDB Flat Portal using Singpass, and every applicant and required occupier needs a valid Singpass account. The application is free. You can only be listed in one HFE application at a time, as either an applicant or an occupier.</p>
<ol>
  <li><strong>Step 1: Check Preliminary HDB Flat Eligibility.</strong> Enter your household, employment and income details to get a preliminary outcome.</li>
  <li><strong>Step 2: Apply for the HDB Flat Eligibility letter.</strong> Submit the full application, retrieving your details through Myinfo, and upload any documents HDB asks for.</li>
</ol>
<p>Complete both steps within 30 calendar days of each other, and ideally in the same calendar month. Otherwise you will need to update the employment and income details of everyone in the application. Check everything before you submit Step 2: after that the application cannot be edited, only cancelled and made afresh.</p>

<h2>HFE application documents required</h2>
<p>HDB does not publish a fixed list of documents to prepare upfront. When you apply, your details are retrieved through <strong>Myinfo</strong> to keep paperwork to a minimum. HDB then tells you by SMS and email if it needs supporting documents, usually because Myinfo does not hold everything it needs. Get those from your employer or the relevant agency, or a letter from them if they cannot provide the information.</p>
<p>What HDB assesses decides what it may ask you for:</p>
<ul>
  <li><strong>Income period:</strong> 12 months, ending two months before the month you apply. An application made in May 2024, for example, is assessed on April 2023 to March 2024.</li>
  <li><strong>What counts:</strong> all income from employment or trade, including your own CPF deductions and allowances such as overtime, transport and shift pay. Employer CPF contributions, bonuses, the Annual Wage Supplement, rental income and dividends are not counted.</li>
  <li><strong>Average monthly income:</strong> total income divided by the months actually worked. Employees exclude months on no-pay leave; self-employed persons are assessed over 12 months, or from when the business started.</li>
  <li><strong>More than one job:</strong> if documents are requested, you must provide them for each job or trade.</li>
  <li><strong>Still working:</strong> you must be working when you apply to be considered for the Enhanced CPF Housing Grant and an HDB housing loan.</li>
</ul>
<p>Uploads must be PDF, JPG or PNG files that are not encrypted, up to 5 MB each and 40 MB in total. Documents that are not in English, Chinese, Malay or Tamil need an official English translation that is notarised, certified by a local commissioner, or endorsed by an embassy or high commission. To upload, log in to the HDB Flat Portal and select <em>My Flat Dashboard, Applying an HDB Flat Eligibility (HFE) letter, Step 2, Upload Documents</em>. HDB may not process the application until it has the complete set.</p>

<h2>HFE processing and waiting time</h2>
<p>HDB says processing takes <strong>up to one month</strong> after it receives the full set of required documents. It can take longer before and during the month of a sales exercise, when application volumes are high. You get an SMS and email once the outcome is ready, so apply early if you plan to buy.</p>

<div class="article-cta">
  <h3>Waiting for your HFE letter?</h3>
  <p>Use the month to shortlist flats your letter is likely to cover. Joe can go through your expected loan, CPF and cash with you, so you are ready to view and make an offer once the letter arrives.</p>
  <a href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20am%20applying%20for%20my%20HFE%20letter%20and%20would%20like%20help%20planning%20my%20flat%20budget." target="_blank" rel="noopener" data-cta-location="insights_hfe_guide_mid" data-lead-type="hdb_buyer">WhatsApp Joe about your budget →</a>
</div>

<h2>How to view your HFE letter</h2>
<p>Log in to the HDB Flat Portal and select <em>My Flat Dashboard, Applying an HDB Flat Eligibility (HFE) letter, Step 2, View Letter</em>. The same screen shows the status of an application that is still being processed.</p>

<h2>HFE letter validity and expiry</h2>
<p>An HFE letter is valid for <strong>nine months from the date of issue</strong>. For a new flat you need a valid letter when you apply. For a resale flat you need one before the seller grants you an Option to Purchase, and again when you submit the resale application.</p>
<p>Once you have submitted a flat application with the letter, you can continue with that purchase even after the letter expires. An expired letter that was never used for a flat application can no longer be viewed.</p>
<p>If your letter expires within the next 30 days and you need more time, apply for a fresh one. If nothing has changed except employment or income, the first applicant can re-apply through <em>View/ Re-apply HFE Letter</em> on the same dashboard. You can keep using the unexpired letter until the new one is issued.</p>

<h2>When HDB reviews your HFE letter</h2>
<p>HDB reviews the outcome if information given was untrue or incorrect, if anyone listed does not meet the conditions to buy a flat, receive grants or take an HDB loan, or if your family circumstances or HDB's policies change. Adding or removing a household member, or a change in marital status, citizenship or private-property ownership, needs a fresh application if you have not yet applied for a flat. A change in household income alone needs no action once the letter is approved.</p>
<p>If you book an uncompleted flat, HDB reviews your finances again nearer completion, and the loan amount may be reduced if your ability to service it has worsened.</p>

<h2>Can you compare bank loans during the HFE process?</h2>
<p>Yes. HDB's integrated loan application service lets buyers request an In-Principle Approval from participating financial institutions while applying for the HFE letter. An IPA is indicative; the confirmed Letter of Offer comes later after a flat is secured.</p>
<p>Before choosing, compare the current differences in <a href="/insights/hdb-loan-vs-bank-loan-singapore.html">HDB loans versus bank loans</a>, including cash downpayment, rate variability, lock-ins and refinancing options.</p>

<div class="article-cta">
  <h3>Got your HFE letter?</h3>
  <p>The letter shows the HDB loan you qualify for, not what the monthly instalment will feel like. Check the instalment in the calculator, then compare it with a bank offer before you take an OTP.</p>
  <div class="article-cta-actions">
    <a href="/calculator/" data-calculator="repayment" data-entry-point="hfe_guide" data-cta-location="insights_hfe_guide_end" data-lead-type="hdb_buyer">Check your monthly instalment →</a>
    <a class="article-cta-secondary" href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20have%20my%20HFE%20letter%20and%20would%20like%20help%20choosing%20between%20an%20HDB%20loan%20and%20a%20bank%20loan." target="_blank" rel="noopener" data-cta-location="insights_hfe_guide_end" data-lead-type="hdb_buyer">WhatsApp Joe about your loan</a>
  </div>
</div>

<h2>Official source and review date</h2>
<p>Reviewed ${reviewed} against HDB's <a href="${SOURCES.hfe}" rel="noopener">Application for an HFE Letter</a> and <a href="${SOURCES.loan}" rel="noopener">Housing Loan from HDB</a> pages. The application steps, documents, validity and HLE sections were checked on 9 October 2026 against HDB's <a href="${SOURCES.hfeIncome}" rel="noopener">Income Guidelines and Documents</a> page and its <a href="${SOURCES.hfeKeo}" rel="noopener">notice introducing the HFE letter</a>.</p>`,
    faqs: [
      ['How long does an HFE letter application take?', 'HDB says processing can take up to one month after it receives all required documents, and may take longer before or during a sales exercise.'],
      ['How long is an HFE letter valid?', 'An HFE letter is valid for nine months from its issue date. A used letter can continue supporting the submitted flat application after it expires.'],
      ['Is an HFE letter free?', 'Yes. HDB states that the online HFE application is free of charge.'],
      ['What documents are required for an HFE application?', 'HDB retrieves most details through Myinfo when you apply, and tells you by SMS and email if it needs supporting documents. It assesses 12 months of income ending two months before the month you apply, so any documents it requests relate to that period and to each job you hold.'],
      ['How do I view or download my HFE letter?', 'Log in to the HDB Flat Portal and select My Flat Dashboard, then Applying an HDB Flat Eligibility (HFE) letter, Step 2, and View Letter. The same screen shows the status of an application that is still being processed.'],
      ['What is an HLE letter?', 'The HDB Loan Eligibility (HLE) letter assessed only whether you could take an HDB housing loan. From 9 May 2023 it was replaced by the HFE letter, which combines flat eligibility, CPF housing grants and HDB loan eligibility in one application.'],
    ],
  },
  {
    slug: 'msr-vs-tdsr-singapore',
    title: 'MSR vs TDSR Singapore: HDB Loan Limits | PropertySG',
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
    title: 'HDB Loan vs Bank Loan Interest Rate (2026) | PropertySG',
    modified: '2026-10-30',
    headline: 'HDB loan vs bank loan in 2026: interest rates, cash and which costs less',
    description: 'HDB loan: 2.6% for Oct–Dec 2026. 3M SORA: 1.27% (29 Oct). Compare bank rates for HDB flats, cash needed, the 4% stress test and a $450,000 example.',
    category: 'Loan comparison',
    readTime: '14 min read',
    lede: 'HDB charges 2.6% a year from 1 October to 31 December 2026. Some banks now advertise HDB-flat packages below that, from 1.78%. This guide shows what each loan costs on $450,000, the cash each needs, and what you give up for the lower rate.',
    body: `
<div class="callout"><strong>Quick answer</strong><p>HDB's loan rate is 2.6% a year from 1 October to 31 December 2026, set at 0.1 percentage point above the CPF Ordinary Account rate. Bank packages for HDB flats, as published on the banks' own websites on ${BANK_RATES_CHECKED.label}, start lower: DBS advertises 1.78% for the first three years, and UOB advertises 3-month compounded SORA + 0.70%, about 1.97% at the latest SORA of ${SORA_LATEST.value} (${SORA_LATEST.valueDate}). On a $450,000 loan over 25 years, that is $140 to $182 a month less than HDB in the first years.</p><p>The trade-off: a bank loan needs at least 5% of the price in cash, is tested at 4% instead of HDB's 3% so it can approve a smaller loan, usually comes with a lock-in, and you can never move that flat back to an HDB loan.</p></div>

<h2 id="bank-loan-rates-today">HDB bank loan interest rates today (checked ${BANK_RATES_CHECKED.label})</h2>
<p>These are the rates each lender publishes on its own website for HDB flats. They are advertised rates, not offers. UOB, for example, says its rates are confirmed only in the Letter of Offer and can change without notice. Rates from comparison sites and mortgage brokers are left out.</p>
<p>On a small screen, scroll the tables sideways.</p>
<div role="region" aria-label="Scrollable table of current HDB and bank loan rates" tabindex="0" style="overflow-x:auto">
<table aria-label="HDB loan rate and bank-published HDB flat loan rates, checked ${BANK_RATES_CHECKED.label}" style="min-width:640px">
  <tr><th>Lender and package</th><th>Early years</th><th>After that</th><th>How the rate moves</th><th>Lock-in and conditions</th></tr>
  <tr><td><a href="${LOAN_SOURCES.hdbRate}" rel="noopener">HDB housing loan</a></td><td>2.60%</td><td>2.60% for now</td><td>CPF OA rate (2.5%) plus 0.10 point. HDB can revise it in January, April, July and October.</td><td>No lock-in and no early repayment penalty</td></tr>
  <tr><td><a href="${LOAN_SOURCES.dbs}" rel="noopener">DBS 3-Year CPF-OA HDB Loan</a></td><td>1.78% in years 1 to 3</td><td>2.20% in years 4 and 5, then 2.40%</td><td>Pegged below the CPF OA rate: 0.72 point below, then 0.30, then 0.10</td><td>3-year commitment period; minimum loan $100,000</td></tr>
  <tr><td><a href="${LOAN_SOURCES.uob}" rel="noopener">UOB HDB Home Loan, SORA package</a></td><td>SORA + 0.70% in years 1 and 2 (about 1.97% today), SORA + 0.80% in year 3 (about 2.07%)</td><td>SORA + 1.00% (about 2.27% today)</td><td>3-month compounded SORA plus a fixed spread, so it rises and falls with SORA</td><td>2-year lock-in; minimum loan $250,000; completed flats; new Direct-to-Bank+ customers; applications 1 Oct 2026 to 31 Mar 2027</td></tr>
</table>
</div>
<p>"Today" uses 3-month compounded SORA of <strong>${SORA_LATEST.value}</strong> for ${SORA_LATEST.valueDate}, published by <a href="${LOAN_SOURCES.sora}" rel="noopener">MAS</a> on ${SORA_LATEST.published}. The UOB figures will move as SORA moves. OCBC's <a href="${LOAN_SOURCES.ocbc}" rel="noopener">home loan page</a> lists 3-month SORA and two-year fixed packages for HDB flats without rates for them, so ask OCBC for a written offer.</p>

<div class="article-cta">
  <h3>What would your instalment be?</h3>
  <p>Put your flat price, loan and rate into the calculator to see the monthly instalment. To compare an HDB loan with a bank offer on a flat you are looking at, WhatsApp Joe.</p>
  <div class="article-cta-actions">
    <a href="/calculator/" data-calculator="repayment" data-entry-point="hdb_vs_bank_guide" data-cta-location="insights_hdb_vs_bank_mid" data-lead-type="hdb_buyer">Check your monthly instalment →</a>
    <a class="article-cta-secondary" href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20read%20your%20HDB%20loan%20vs%20bank%20loan%20guide%20and%20would%20like%20help%20choosing%20a%20loan." target="_blank" rel="noopener" data-cta-location="insights_hdb_vs_bank_mid" data-lead-type="hdb_buyer">WhatsApp Joe about your loan</a>
  </div>
</div>

<h2>HDB bank loan interest rate: how bank packages are priced</h2>
<p>Banks price loans for HDB flats in three ways:</p>
<ul>
  <li><strong>Fixed, then floating.</strong> The rate is fixed for one to three years, then moves to a floating formula. The formula after the fixed years matters more than the fixed rate, because it applies for most of the loan.</li>
  <li><strong>Pegged to SORA.</strong> The rate is 3-month compounded SORA plus the bank's spread. SORA is the Singapore Overnight Rate Average, published daily by MAS. The 3-month compounded figure averages the past three months, so it moves slowly. Ask how often the bank resets your rate.</li>
  <li><strong>Pegged to the CPF OA rate.</strong> The rate is a fixed margin below the CPF Ordinary Account rate, the same rate HDB adds 0.1 point to. DBS's package works this way. If the CPF OA rate changes, HDB's rate and the package rate move by the same amount, so the gap stays. The CPF OA rate has a legislated minimum of 2.5%, so DBS's year 1 to 3 rate cannot fall below 1.78% either.</li>
</ul>
<p>The rate after the promotional years is called the thereafter rate. It is 2.40% on the DBS package and SORA + 1.00% on the UOB package. That is the rate you pay for most of a 25-year loan, so compare it with HDB's 2.6% before the year-one rate.</p>
<p>Whatever the package rate, the bank must check that you could pay at a higher rate. <a href="${LOAN_SOURCES.masTdsr}" rel="noopener">MAS</a> sets this at the higher of 4% or the package's thereafter rate, within the 30% Mortgage Servicing Ratio and the 55% Total Debt Servicing Ratio. <a href="msr-vs-tdsr-singapore.html">MSR vs TDSR</a> explains both ratios.</p>

<h2>3-month SORA since 2024, and when a SORA loan costs more than 2.6%</h2>
<p>A SORA package is cheaper than an HDB loan only while SORA stays low. These are MAS's 3-month compounded SORA figures on the first business day of each month shown.</p>
<table aria-label="3-month compounded SORA, January 2024 to October 2026">
  <tr><th>Date</th><th>3M compounded SORA</th></tr>
  <tr><td>January 2024</td><td>3.7012%</td></tr>
  <tr><td>October 2024</td><td>3.4966%</td></tr>
  <tr><td>January 2025</td><td>3.0227%</td></tr>
  <tr><td>April 2025</td><td>2.5496%</td></tr>
  <tr><td>July 2025</td><td>2.0470%</td></tr>
  <tr><td>October 2025</td><td>1.4489%</td></tr>
  <tr><td>January 2026</td><td>1.1797%</td></tr>
  <tr><td>May 2026 (lowest of the dates shown)</td><td>1.0356%</td></tr>
  <tr><td>July 2026</td><td>1.0871%</td></tr>
  <tr><td>September 2026</td><td>1.1905%</td></tr>
  <tr><td>October 2026</td><td>1.2337%</td></tr>
  <tr><td>${SORA_LATEST.valueDate} (latest)</td><td>${SORA_LATEST.value}</td></tr>
</table>
<p><strong>Break-even with HDB's 2.6%:</strong> a package at SORA + 1.00% costs more than an HDB loan once SORA is above 1.60%. At SORA + 0.70%, the line is 1.90%. SORA is 1.27% now, 0.33 point below the first line. It was 2.05% in July 2025 and 3.02% in January 2025. If it went back to 3.02%, a SORA + 1.00% loan would charge 4.02%.</p>
<p>A CPF-OA-pegged package such as DBS's carries no SORA risk, because every stage of the published package is pegged below the CPF OA rate. Its risks are the commitment period and giving up the HDB loan for good.</p>

<h2>HDB loan vs bank loan: side-by-side</h2>
<div role="region" aria-label="Scrollable HDB and bank loan comparison" tabindex="0" style="overflow-x:auto">
<table aria-label="HDB housing loan and bank loan comparison" style="min-width:600px">
  <tr><th>Feature</th><th>HDB housing loan</th><th>Bank loan for an HDB flat</th></tr>
  <tr><td>Interest rate</td><td>2.6% a year for 1 October to 31 December 2026; 0.1 point above the CPF OA rate, reviewed quarterly</td><td>Set by each bank: fixed, SORA-pegged or CPF-OA-pegged (see the table above)</td></tr>
  <tr><td>Who can borrow</td><td>At least one Singapore Citizen; household income up to $16,000 a month for families, $24,000 for extended families, $8,000 for singles; fewer than two previous HDB loans</td><td>No HDB income ceiling; the bank's credit assessment and MAS limits apply</td></tr>
  <tr><td>Maximum loan-to-value</td><td>75% of the price, or of the lower of price and valuation for resale</td><td>75% if the tenure is 25 years or less and the loan ends by age 65; otherwise 55%</td></tr>
  <tr><td>Minimum cash downpayment</td><td>None: the 25% can be paid from CPF OA, cash or both</td><td>5% of the lower of price and valuation (10% when the 55% limit applies)</td></tr>
  <tr><td>Longest tenure</td><td>25 years, or less if 65 minus your average age, or the remaining lease minus 20 years, is shorter</td><td>30 years, but over 25 years the limit drops to 55%</td></tr>
  <tr><td>Rate used to test affordability</td><td>Higher of 3% or the HDB rate: 3% now</td><td>Higher of 4% or the package's thereafter rate: 4% for the packages above</td></tr>
  <tr><td>Debt limits</td><td>30% MSR; HDB also looks at existing debts</td><td>30% MSR and 55% TDSR covering all debts</td></tr>
  <tr><td>CPF savings</td><td>You must use your OA savings first, keeping up to $20,000 in each OA</td><td>HDB's OA rule does not apply</td></tr>
  <tr><td>Lock-in and early repayment</td><td>No lock-in, no penalty</td><td>Usually 1 to 3 years; CPF Board says the penalty could be around 1.5% of the outstanding loan</td></tr>
  <tr><td>Cash-over-valuation</td><td>Paid in cash</td><td>Paid in cash</td></tr>
  <tr><td>Switching later</td><td>Can refinance to a bank at any time</td><td>Can never switch that flat back to an HDB loan</td></tr>
</table>
</div>

<h2>Worked example: $600,000 resale flat, $450,000 loan over 25 years</h2>
<p>This is the same flat as the worked example in the <a href="/calculator/#worked-example-title">home loan calculator</a>, with two bank packages added. Assume a resale flat has both a $600,000 purchase price and a $600,000 valuation, the buyers qualify for 75% LTV, and a 25-year loan ends before they turn 65. The loan is $450,000 and the minimum downpayment is $150,000.</p>
<ul>
  <li><strong>HDB loan:</strong> the $150,000 can come from CPF OA, cash or both. There is no minimum cash amount.</li>
  <li><strong>Bank loan:</strong> at least $30,000 (5% of the flat price) must be cash. The other $120,000 can be cash or CPF OA.</li>
  <li><strong>Either loan:</strong> stamp duty, legal fees and any cash-over-valuation come on top. If the price is above valuation, the difference is paid in cash and the loan is still capped at 75% of the valuation.</li>
</ul>
<div role="region" aria-label="Scrollable worked instalment comparison" tabindex="0" style="overflow-x:auto">
<table aria-label="Monthly instalments and interest on a $450,000 loan over 25 years" style="min-width:600px">
  <tr><th>Loan</th><th>Rate</th><th>Monthly instalment</th><th>Interest, first 3 years</th><th>Interest, first 5 years</th></tr>
  <tr><td>HDB</td><td>2.6%</td><td>$2,041.51</td><td>$33,608</td><td>$54,233</td></tr>
  <tr><td>DBS CPF-OA package</td><td>1.78%, then 2.20% (years 4 to 5), then 2.40%</td><td>$1,859.52, then $1,941.12, then $1,977.40</td><td>$22,897</td><td>$40,145</td></tr>
  <tr><td>UOB SORA package</td><td>1.9748% (SORA ${SORA_LATEST.value} + 0.70%), then 2.0748% (+ 0.80%, year 3), then 2.2748% (+ 1.00%)</td><td>$1,901.83, then $1,922.16, then $1,961.58</td><td>$25,850</td><td>$43,742</td></tr>
</table>
</div>
<p>Assumptions: the CPF OA rate stays at 2.5%, 3-month SORA stays at ${SORA_LATEST.value}, and the instalment is recalculated over the remaining term each time the rate changes, using the standard formula: instalment = loan × r ÷ (1 − (1 + r)^−n), where r is the monthly rate and n the number of months. On those assumptions, over five years the DBS package costs about $14,088 less in interest than HDB and the UOB package about $10,492 less. Over the full 25 years, total interest comes to about $162,454 with HDB, $138,106 with DBS and $136,568 with UOB. Rates will not stay still for 25 years, so treat the long-run figures as a direction, not a forecast.</p>
<p>The bank saving has a price: $30,000 in cash up front, a lock-in, and no way back to HDB. If SORA rises above 1.60%, the UOB package costs more than HDB from year 4.</p>

<h2>Stress test: why a bank may lend you less than HDB</h2>
<p>Neither lender approves a loan on today's rate. <a href="${SOURCES.loan}" rel="noopener">HDB</a> checks the 30% MSR at the higher of 3% or its own rate, which is 3% now. Banks use the higher of 4% or the package's thereafter rate, which is 4% for every package above. <a href="${LOAN_SOURCES.mas2022}" rel="noopener">MAS raised its floor to 4% and HDB brought in its 3% floor</a> from 30 September 2022.</p>
<table aria-label="Income needed for a $450,000 loan over 25 years under the HDB and bank stress tests">
  <tr><th>Same $450,000 loan over 25 years</th><th>HDB loan</th><th>Bank loan</th></tr>
  <tr><td>Rate used for the test</td><td>3%</td><td>4%</td></tr>
  <tr><td>Test instalment</td><td>$2,133.95</td><td>$2,375.27</td></tr>
  <tr><td>Gross monthly income needed at 30% MSR</td><td>About $7,114</td><td>About $7,918</td></tr>
  <tr><td>Largest 25-year loan on $7,000 a month</td><td>About $442,800</td><td>About $397,900</td></tr>
</table>
<p>So a household earning $7,000 a month could borrow about $45,000 less from a bank than from HDB, before LTV, other debts and credit checks. A lower bank rate does not help if the bank will not lend enough. Banks also apply the 55% TDSR across all your debts, including car and personal loans.</p>

<h2>Can you switch? HDB to bank yes, bank to HDB never</h2>
<p>You can refinance an HDB loan to a bank at any time, subject to the bank's approval. You cannot go the other way: once a flat's loan is with a bank, <a href="${SOURCES.compare}" rel="noopener">CPF Board</a> and <a href="${LOAN_SOURCES.hdbFi}" rel="noopener">HDB</a> say it cannot be refinanced to an HDB loan. After a bank's lock-in ends, you can reprice with the same bank or refinance to another bank.</p>
<p>That makes the choice lopsided. Starting with HDB keeps both doors open: if bank rates stay well below 2.6%, you can refinance later. Starting with a bank closes the HDB door for that flat. Leaving a bank during its lock-in costs a penalty, which CPF Board says could be around 1.5% of the outstanding loan, or about $6,750 on $450,000.</p>

<h2>When an HDB loan may fit better</h2>
<ul>
  <li><strong>You have little cash.</strong> The HDB loan needs no cash downpayment; a bank loan needs at least 5% of the price.</li>
  <li><strong>Your income is close to the limit.</strong> HDB's 3% test lets you borrow more than a bank's 4% test on the same income.</li>
  <li><strong>You may sell or repay early.</strong> There is no lock-in and no early repayment penalty.</li>
  <li><strong>You want to keep the choice open.</strong> You can move to a bank later when the rate suits you, but not back.</li>
  <li><strong>You want a rate that is not tied to market rates.</strong> The HDB rate follows the CPF OA rate, which has a legislated minimum of 2.5%, not SORA.</li>
</ul>

<h2>When a bank loan may fit better</h2>
<ul>
  <li><strong>You do not qualify for an HDB loan</strong>, for example because household income is above $16,000 for a family or no applicant is a Singapore Citizen.</li>
  <li><strong>You have the 5% cash and pass the 4% test with room to spare.</strong></li>
  <li><strong>You will keep the loan past the lock-in and want the lower rate now.</strong> DBS's published package is below HDB's rate at every stage.</li>
  <li><strong>You accept SORA risk.</strong> A SORA package costs more than HDB if SORA climbs back above about 1.6% to 1.9%.</li>
  <li><strong>You need a longer tenure than HDB allows</strong> and accept that a bank loan over 25 years on an HDB flat is capped at 55% with 10% cash.</li>
</ul>

<h2>Compare the total package, not only year-one interest</h2>
<p>Ask each bank for the fixed-period rate, subsequent pricing formula, lock-in period, partial-prepayment terms, full-redemption charge, repricing fee and estimated effective cost. Model a higher future rate before choosing a floating or short fixed package.</p>
<p>Use the bank’s <a href="https://www.moneysense.gov.sg/how-home-loans-work/" rel="noopener">property loan fact sheet</a> to compare offers on the same loan amount and tenure. Check these three points before deciding:</p>
<ol>
  <li><strong>Monthly budget:</strong> compare the initial instalment and the bank’s illustration of payments if rates rise.</li>
  <li><strong>After the initial rate:</strong> record the next pricing formula and reset frequency. Ask for the fixed-rate end date and lock-in end date separately.</li>
  <li><strong>Your likely exit:</strong> if you sell, repay early or refinance, ask for the charges and any subsidy clawback in writing.</li>
</ol>
<p>Start with your HFE outcome and the <a href="/calculator/">HDB loan calculator</a>. Then compare the same property price, loan amount and tenure across offers.</p>

<h2>HDB mortgage loan: which loans an HDB flat can take</h2>
<p>Both options are mortgage loans secured on the flat. With an HDB housing loan the flat is mortgaged to HDB at the concessionary rate. With a bank loan it is mortgaged to the bank at the package rate. A flat carries one or the other, never both, and a flat already financed by a bank cannot move back to an HDB housing loan. An executive condominium bought from the developer and any private property cannot take an HDB housing loan at all, so for those the bank route is the only route.</p>

<h2>Bank loan for an HDB flat: what the bank will ask for</h2>
<ul>
  <li>For a resale flat at 75% LTV, at least 5% of the lower of purchase price and valuation in cash, with the remaining 20% in cash or CPF Ordinary Account savings. Cash-over-valuation is additional; lower LTV limits require a larger downpayment.</li>
  <li>Income documents to assess the 30% MSR and 55% TDSR at the stress-test rate, counting existing car, renovation and personal loans.</li>
</ul>
<p>The steps, in order:</p>
<ol>
  <li><strong>Get your HFE letter.</strong> It confirms you can buy the flat and whether you qualify for an HDB loan. Read the <a href="hfe-letter-singapore-guide.html">HFE letter guide</a> for timing.</li>
  <li><strong>Get an In-Principle Approval.</strong> The HDB Flat Portal's integrated loan application lets you request one from DBS, Hong Leong Finance, Maybank, OCBC and UOB while you apply for the HFE letter. You can also go to a bank directly.</li>
  <li><strong>Get a Letter of Offer before you commit.</strong> <a href="${LOAN_SOURCES.hdbFi}" rel="noopener">HDB</a> requires a valid Letter of Offer before you sign the Agreement for Lease for a new flat or exercise the Option to Purchase for a resale flat.</li>
  <li><strong>Check the valuation.</strong> The loan is capped at 75% of the lower of price and valuation, so any cash-over-valuation is paid in cash on top of the downpayment.</li>
</ol>

<h2>What changed in 2024 to 2026</h2>
<ul>
  <li><strong>20 August 2024:</strong> HDB cut its loan limit from 80% to 75% for complete resale applications from that date, and for new flats from the October 2024 sales exercise.</li>
  <li><strong>SORA fell:</strong> from 3.7012% in January 2024 to 1.0356% in May 2026, the lowest of the dates in the table above. It was ${SORA_LATEST.value} on ${SORA_LATEST.valueDate}.</li>
  <li><strong>Bank rates went below HDB's:</strong> the packages above start under 2.6%. CPF Board notes some bank rates went above 4% in 2022 and 2023, when HDB was the cheaper loan.</li>
  <li><strong>24 August 2026:</strong> HDB loan income ceilings rose to $16,000 for families, $24,000 for extended families and $8,000 for singles, for HFE applications from that date. See the <a href="hdb-income-ceiling-2026-ndr-changes.html">income-ceiling changes</a>.</li>
  <li><strong>Unchanged:</strong> MAS's 4% stress-test floor and HDB's 3% floor, both in place since 30 September 2022, and the 2.5% legislated minimum for the CPF OA rate.</li>
</ul>

<div class="article-cta">
  <h3>Choosing between an HDB loan and a bank offer?</h3>
  <p>Send Joe the flat you are considering. He can lay out the HDB loan and the bank offer on the same price, loan and tenure, including the cash each one needs before you take an OTP.</p>
  <div class="article-cta-actions">
    <a href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20would%20like%20to%20compare%20an%20HDB%20loan%20with%20a%20bank%20loan%20for%20an%20HDB%20flat." target="_blank" rel="noopener" data-cta-location="insights_hdb_vs_bank_end" data-lead-type="hdb_buyer">WhatsApp Joe to compare your loans →</a>
    <a class="article-cta-secondary" href="/#book" data-cta-location="insights_hdb_vs_bank_end" data-lead-type="hdb_buyer">Book a 30-minute call</a>
  </div>
</div>

<h2>Official sources and review date</h2>
<p>Reviewed 30 Oct 2026. Bank package rates were checked on the banks' own pages, and 3-month compounded SORA on MAS's domestic interest rates page, on ${BANK_RATES_CHECKED.label}. The loan rules on this page come from these official sources:</p>
<ul>
  <li>HDB: <a href="${SOURCES.rate}" rel="noopener">concessionary interest rate</a>, <a href="${SOURCES.loan}" rel="noopener">housing loan from HDB</a>, <a href="${LOAN_SOURCES.hdbFi}" rel="noopener">housing loan from financial institutions</a> and <a href="https://www.hdb.gov.sg/buying-a-flat/financial-planning-for-a-flat-purchase/credit-to-finance-a-flat-purchase" rel="noopener">credit to finance a flat purchase</a>.</li>
  <li>CPF Board: <a href="${LOAN_SOURCES.cpfOa}" rel="noopener">CPF interest rates</a>, <a href="${SOURCES.compare}" rel="noopener">3 differences between an HDB loan and a bank loan</a> and the <a href="${SOURCES.ratios}" rel="noopener">home-buying guide</a>.</li>
  <li>MAS: <a href="${LOAN_SOURCES.masLtv}" rel="noopener">loan tenure and LTV limits</a>, <a href="${LOAN_SOURCES.masMsr}" rel="noopener">MSR and TDSR rules</a>, <a href="${LOAN_SOURCES.masTdsr}" rel="noopener">calculating TDSR</a>, the <a href="${LOAN_SOURCES.mas2022}" rel="noopener">29 September 2022 media release</a> and <a href="${LOAN_SOURCES.sora}" rel="noopener">domestic interest rates (SORA)</a>.</li>
  <li>Banks' own pages: <a href="${LOAN_SOURCES.dbs}" rel="noopener">DBS HDB Loan</a>, <a href="${LOAN_SOURCES.uob}" rel="noopener">UOB HDB Home Loan</a> and <a href="${LOAN_SOURCES.ocbc}" rel="noopener">OCBC home loans</a>.</li>
</ul>
<p>Instalments and interest figures are our own calculations from those rates. Bank packages change often; only a Letter of Offer confirms your rate.</p>`,
    faqs: [
      ['What is the HDB housing loan interest rate in 2026?', 'HDB publishes a 2.6% concessionary rate for 1 October to 31 December 2026. The rate is pegged 0.1 percentage point above the prevailing CPF Ordinary Account rate and can be reviewed quarterly.'],
      ['Is a bank loan cheaper than an HDB loan now?', 'At the rates banks published on 30 October 2026, yes for the first years. DBS advertises 1.78% for years one to three on a package pegged below the CPF OA rate, and UOB advertises 3-month compounded SORA plus 0.70%, about 1.97% at the 29 October 2026 SORA of 1.2748%, against 2.6% for HDB. A bank loan needs at least 5% cash, is tested at 4% instead of 3%, usually has a lock-in, and cannot be switched back to an HDB loan.'],
      ['What is the bank loan interest rate for an HDB flat?', 'There is no single rate. On 30 October 2026, DBS published 1.78% for years one to three, 2.20% for years four and five and 2.40% after that. UOB published 3-month compounded SORA plus 0.70% in years one and two, plus 0.80% in year three and plus 1.00% after that. These are advertised rates; only a Letter of Offer confirms yours.'],
      ['What is the stress test rate for an HDB bank loan?', 'Banks must work out your instalment at the higher of 4% or the thereafter rate of your package, under MAS rules in place since 30 September 2022. HDB uses the higher of 3% or its own loan rate. On a $450,000 loan over 25 years, that means about $7,918 of monthly income for a bank loan against about $7,114 for an HDB loan under the 30% MSR.'],
      ['What is the maximum bank loan tenure for an HDB flat?', 'MAS allows up to 30 years. But for an HDB flat, a tenure over 25 years, or a loan that runs past age 65, cuts the bank loan limit from 75% to 55% and raises the minimum cash downpayment from 5% to 10%. An HDB loan is capped at 25 years.'],
      ['Can I switch from a bank loan back to an HDB loan?', 'No. CPF Board states that a flat already financed with a bank loan cannot switch back to an HDB housing loan for that property.'],
      ['How much cash is required for an HDB flat with a bank loan?', 'For a resale flat at 75% LTV, at least 5% of the lower of price and valuation must be cash. The remaining 20% can be cash or CPF OA, subject to the applicable rules. Cash-over-valuation and any funding shortfall require additional cash.'],
      ['Does the 30% MSR apply to a bank loan for an HDB flat?', 'Yes. The Mortgage Servicing Ratio applies to housing loans for HDB flats and executive condominiums whether the lender is HDB or a bank, and a bank loan must also pass the 55% Total Debt Servicing Ratio at the stress-test rate.'],
    ],
  },
  hdbPolicyArticle,
];

const EXISTING_GUIDES = [
  ['sell-hdb-first-or-buy-condo-first', 'Sell HDB first or buy condo first?'],
  ['q3-2026-ura-private-home-prices', 'Q3 2026 URA prices: buyer and seller guide'],
  ['hdb-resale-prices-2q-2026-by-town', 'HDB Resale Prices 2Q 2026 by Town'],
  ['15-month-wait-out-removed-private-owners-hdb', '15-Month Wait-Out Removed: What Owners Do Now'],
  ['cheapest-4-room-5-room-hdb-resale-flats', 'Cheapest 4-Room and 5-Room HDB Resale Towns'],
  ['singapore-rental-market-2q-2026', 'Singapore Rental Market 2Q 2026: Landlord Guide'],
  ['new-condo-launches-2026-2027-calendar', 'New Condo Launches 2026–2027: Launch Calendar'],
  ['ec-vs-private-condo-2027', 'EC vs private condo in 2027: which to buy'],
  ['singapore-mega-launches-2027', 'Singapore’s 2027 mega launches: Hougang Central Residences and the pipeline'],
  ['hdb-valuation-explained', 'HDB valuation explained'],
  ['how-long-to-sell-hdb-singapore-2026', 'How long it takes to sell an HDB flat'],
  ['how-to-sell-hdb-flat-singapore', 'How to sell an HDB flat: steps, fees and proceeds'],
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
      author: { '@type': 'Person', '@id': 'https://joetay.com/about-joe/#joe-tay', name: 'Joe Tay', url: 'https://joetay.com/about-joe/', identifier: 'CEA R009618D' },
      publisher: { '@type': 'RealEstateAgent', '@id': 'https://joetay.com/#agent', name: 'PropertySG', url: 'https://joetay.com/', alternateName: 'Joe Tay' },
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
  const dateLabel = `${article.published && article.published === modified ? '' : 'Updated '}${visibleDate(modified)}`;
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
${fontLinksHtml()}
<link rel="stylesheet" href="blog.css">
<style>.skip-link{position:absolute;left:-9999px;top:0;z-index:10050;background:#0b1e3f;color:#fff;padding:12px 20px;border-radius:0 0 10px 0;font-weight:700;text-decoration:none}.skip-link:focus{left:0;outline:2px solid #10b981;outline-offset:2px}</style>
<link rel="alternate" type="application/atom+xml" title="PropertySG Insights" href="https://joetay.com/insights/feed.xml">
<link rel="alternate" type="application/feed+json" title="PropertySG Insights (JSON Feed)" href="https://joetay.com/insights/feed.json">
<script src="/assets/analytics-loader.js" defer data-meta="false"></script>
${SITE_THEME_ASSETS_HTML}
${mobileHeaderAssetsHtml()}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${siteHeaderHtml({ pagePath: `/insights/${article.slug}.html` })}
<main id="main" tabindex="-1" class="blog-main"><article class="article">
<div class="article-breadcrumb" role="navigation" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><a href="/insights/">Insights</a><span class="sep">›</span><span aria-current="page">${esc(article.headline)}</span></div>
<header class="article-header"><div class="article-meta-top"><span class="cat">${esc(article.category)}</span><span class="dot" aria-hidden="true">·</span><span>${article.readTime}</span><span class="dot" aria-hidden="true">·</span><time datetime="${modified}">${dateLabel}</time></div>
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

// Warn (never fail: the build must stay deterministic) when the quoted bank
// rates are older than RATE_STALE_DAYS, so the refresh step above is not missed.
const rateAgeDays = Math.floor((Date.now() - Date.parse(`${BANK_RATES_CHECKED.iso}T00:00:00+08:00`)) / 86400000);
if (rateAgeDays > RATE_STALE_DAYS) {
  console.warn(`::warning file=scripts/generate-hdb-loan-cluster.mjs::bank rates on hdb-loan-vs-bank-loan-singapore were checked ${rateAgeDays} days ago (${BANK_RATES_CHECKED.label}); re-check the bank and MAS sources`);
}

let changed = 0;
for (const article of ARTICLES) {
  const file = path.join(OUT_DIR, `${article.slug}.html`);
  // Same post-processing as the hand-built articles: TOC, then cover.
  const output = injectCover(injectToc(page(article)), loadCover(article.slug));
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
