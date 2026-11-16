#!/usr/bin/env node
// Generates the seller and landlord guides added after the November 2026 audit
// (A4, G3, G4) and the seller's guide hub that orders every selling guide:
//
//   insights/seller-stamp-duty-singapore.html
//   insights/how-to-sell-condo-singapore.html
//   insights/renting-out-hdb-condo-singapore.html
//   sell/guide/index.html
//
// Same shape as generate-hdb-grants-cluster.mjs. Every rule and rate below was
// read from the official page named in SOURCES on the review date; nothing is
// taken from third-party summaries. Market conventions that no agency sets
// (option fee, option period, completion time for private sales) are labelled
// as conventions in the copy.
//
//   node scripts/generate-seller-cluster.mjs          # write
//   node scripts/generate-seller-cluster.mjs --check  # fail if any page is stale

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml } from './lib/consent-banner.mjs';
import { siteFooterHtml } from './lib/site-footer.mjs';
import { mobileHeaderAssetsHtml } from './lib/mobile-header.mjs';
import { siteHeaderHtml, SITE_THEME_ASSETS_HTML } from './lib/site-header.mjs';
import { fontLinksHtml } from './lib/self-hosted-fonts.mjs';
import { injectToc } from './lib/article-toc.mjs';
import { injectCover, loadCover } from './lib/article-covers.mjs';
import { guideEndCtaHtml } from './lib/guide-cta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
export const published = '2026-11-15';
export const reviewed = '15 Nov 2026';

function visibleDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export const SOURCES = {
  irasSsd: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-residential-property",
  irasStampRates: 'https://www.iras.gov.sg/quick-links/tax-rates/stamp-duty',
  irasRentalIncome: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/what-is-taxable-what-is-not/income-from-property-rented-out',
  uraRenting: 'https://www.ura.gov.sg/Corporate/Property/Residential/Renting-Property',
  hdbRentEligibility: 'https://www.hdb.gov.sg/managing-my-home/home-ownership/renting-out-a-flat-or-bedrooms/renting-out-a-flat/eligibility',
  hdbRentRegulations: 'https://www.hdb.gov.sg/managing-my-home/home-ownership/renting-out-a-flat-or-bedrooms/renting-out-a-flat/regulations',
  hdbRentBedrooms: 'https://www.hdb.gov.sg/managing-my-home/home-ownership/renting-out-a-flat-or-bedrooms/renting-out-bedrooms',
  ceaPrivate: 'https://www.cea.gov.sg/consumers/transacting-on-your-own/buying-or-selling-a-private-residential-property/',
  ceaEngaging: 'https://www.cea.gov.sg/consumers/engaging-a-property-agent/buying-or-selling/',
  cpfProceeds: 'https://www.cpf.gov.sg/member/infohub/educational-resources/sales-proceeds-after-selling-your-home',
};

const DISCLAIMER = 'This guide is general education, not legal, tax or financial advice. IRAS, HDB, URA and CPF Board apply the prevailing rules to the facts of your own case; check the official page or ask a conveyancing lawyer before you commit.';

export const ARTICLES = [
  {
    slug: 'seller-stamp-duty-singapore',
    title: 'Seller’s Stamp Duty Singapore: Rates & Rules | PropertySG',
    headline: 'Seller’s Stamp Duty in Singapore: rates, holding period and who pays',
    description: 'Seller’s Stamp Duty rates for homes bought before and after 4 July 2025, how the holding period is counted, when SSD is due and which sales are exempt.',
    category: 'Selling',
    readTime: '6 min read',
    lede: 'Seller’s Stamp Duty is charged when you sell a home within a set holding period. The rate depends on the date you bought it, and the rules changed on 4 July 2025.',
    body: `
<div class="callout"><strong>The short answer</strong><p>For a home bought <strong>on or after 4 July 2025</strong>, Seller’s Stamp Duty (SSD) applies for <strong>four years</strong>: 16% if you sell within the first year, 12% in the second, 8% in the third and 4% in the fourth. For a home bought between 11 March 2017 and 3 July 2025 the holding period is three years, at 12%, 8% and 4%. After the holding period there is no SSD.</p></div>

<h2>What Seller’s Stamp Duty is</h2>
<p>SSD is a duty the seller pays when a residential property is sold or disposed of within the holding period. IRAS applies it to residential properties and residential land acquired on or after 20 February 2010. It is separate from the Buyer’s Stamp Duty and Additional Buyer’s Stamp Duty a purchaser pays; use the <a href="/stamp-duty-calculator/">stamp duty calculator</a> for those.</p>

<h2>SSD rates by purchase date</h2>
<p>The rate is fixed by the date you bought the property, not the date you sell it. These are the two bands that cover almost every home sold today.</p>
<table aria-label="Seller's Stamp Duty rates by date of purchase and holding period">
  <tr><th>Holding period when you sell</th><th>Bought 11 Mar 2017 to 3 Jul 2025</th><th>Bought on or after 4 Jul 2025</th></tr>
  <tr><td>Up to 1 year</td><td>12%</td><td>16%</td></tr>
  <tr><td>More than 1 year, up to 2 years</td><td>8%</td><td>12%</td></tr>
  <tr><td>More than 2 years, up to 3 years</td><td>4%</td><td>8%</td></tr>
  <tr><td>More than 3 years, up to 4 years</td><td>No SSD</td><td>4%</td></tr>
  <tr><td>More than 4 years</td><td>No SSD</td><td>No SSD</td></tr>
</table>
<p>The July 2025 change lengthened the holding period from three years to four and raised each rate by four percentage points. IRAS states it applies to purchases on or after 4 July 2025, with no transition period. Older bands, for homes bought before 11 March 2017, are listed on the <a href="${SOURCES.irasSsd}" rel="noopener">IRAS Seller’s Stamp Duty page</a>.</p>

<h2>How the holding period is counted</h2>
<p>The period runs from the date of purchase to the date of sale. IRAS treats the purchase date as, in most cases, the date the Option to Purchase was accepted or the Sale and Purchase Agreement was signed; for a new HDB flat it is the date of the Agreement for Lease. The sale date is set the same way: usually the date your buyer accepts the option or signs the agreement, not the completion date.</p>
<p>That detail matters near an anniversary. A sale agreed one week before the third or fourth anniversary of your purchase is taxed at the higher band, even if completion falls after it.</p>

<h2>What SSD is charged on</h2>
<p>SSD is charged on the selling price or the market value at the date of sale, whichever is higher, and rounded down to the nearest dollar.</p>
<div class="callout"><strong>Worked example</strong><p>You bought a condo in August 2025 and agree to sell it for $1,500,000 in October 2027. The holding period is more than two years and not more than three, so the rate is 8%. SSD is 8% × $1,500,000 = <strong>$120,000</strong>. Had the sale been agreed after the fourth anniversary, in or after August 2029, there would be no SSD.</p></div>

<h2>Who pays, and when</h2>
<p>The seller pays. IRAS requires payment within 14 days of the sale contract being executed, says stamp duty payment cannot be deferred, and charges a late-payment penalty. In practice your conveyancing lawyer pays it from the sale proceeds or asks you for the funds, so budget for it before you grant an option.</p>

<h2>Does SSD apply to HDB flats?</h2>
<p>Yes. HDB flats are residential property, and IRAS says that meeting the Minimum Occupation Period does not remove SSD if the sale falls within the holding period. For most owners the five-year MOP is longer than the SSD holding period, so the two rarely overlap, but they can where a flat is sold early with HDB’s approval. See <a href="/insights/selling-hdb-after-mop-singapore.html">selling an HDB flat after MOP</a> for how MOP itself is counted.</p>

<h2>Sales that are exempt</h2>
<p>IRAS lists a small number of exemptions, including:</p>
<ul>
  <li>property compulsorily acquired under the Land Acquisition Act;</li>
  <li>disposals in bankruptcy or the involuntary winding up of a company;</li>
  <li>HDB flats returned to or taken back by HDB, including under the Selective En bloc Redevelopment Scheme;</li>
  <li>HDB flats that owners must dispose of under HDB rules after an inheritance or a marriage;</li>
  <li>foreigners required to sell under the Residential Property Act.</li>
</ul>
<p>An ordinary change of plan, a job move or a need for cash is not an exemption. If you think one applies to you, confirm it with IRAS or your lawyer before you price the sale.</p>

<h2>Before you sell inside the holding period</h2>
<ol>
  <li>Find your purchase date on the option or Sale and Purchase Agreement, and count forward to each anniversary.</li>
  <li>Work out the duty at the price you expect, and add it to your <a href="/insights/property-agent-commission-singapore.html">agent commission</a>, legal fees and CPF refund.</li>
  <li>Compare the result with waiting. A few months’ delay can drop the rate by four percentage points of the whole price.</li>
  <li>If you are selling to buy, read <a href="/insights/sell-hdb-first-or-buy-condo-first.html">sell first or buy first</a>; the buyer’s duties on the next home can be larger than the SSD on this one.</li>
</ol>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against IRAS’s <a href="${SOURCES.irasSsd}" rel="noopener">Seller’s Stamp Duty (SSD) for Residential Property</a> (page last updated 13 August 2026) and the IRAS <a href="${SOURCES.irasStampRates}" rel="noopener">stamp duty rates</a> page.</p>`,
    faqs: [
      ['How much is Seller’s Stamp Duty in Singapore?', 'For a home bought on or after 4 July 2025, SSD is 16% if sold within one year, 12% in the second year, 8% in the third and 4% in the fourth. For a home bought between 11 March 2017 and 3 July 2025 it is 12%, 8% and 4% over three years. It is charged on the higher of the selling price and market value.'],
      ['How long must I hold a property to avoid SSD?', 'More than four years if you bought on or after 4 July 2025, and more than three years if you bought between 11 March 2017 and 3 July 2025. IRAS counts from the date of purchase to the date of sale, which is usually the date the option is accepted or the agreement is signed, not the completion date.'],
      ['Who pays Seller’s Stamp Duty, and when is it due?', 'The seller pays. IRAS requires payment within 14 days of the sale contract being executed and says payment cannot be deferred. Your conveyancing lawyer normally arranges it from the sale proceeds.'],
      ['Does Seller’s Stamp Duty apply to HDB flats?', 'Yes. IRAS says meeting the Minimum Occupation Period does not remove SSD if the sale falls within the holding period. Because the usual five-year MOP is longer than the SSD holding period, the two rarely overlap in practice.'],
    ],
  },
  {
    slug: 'how-to-sell-condo-singapore',
    title: 'How to Sell a Condo in Singapore: Steps & Costs | PropertySG',
    headline: 'How to sell a condo in Singapore: steps, costs and what you keep',
    description: 'How a private condo sale works in Singapore: pricing from URA caveats, the Option to Purchase, lawyers, Seller’s Stamp Duty, the CPF refund and completion.',
    category: 'Selling',
    readTime: '8 min read',
    lede: 'A condo sale is a private contract run by two law firms, not an HDB process. The steps are fewer than for a flat, but more of the terms are yours to negotiate.',
    body: `
<div class="callout"><strong>The short answer</strong><p>Price the unit from recent caveats in your project, check whether Seller’s Stamp Duty applies, grant an Option to Purchase, and let your conveyancing lawyer take the sale to completion. Your cash proceeds are the price less the outstanding loan, the CPF refund with accrued interest, any Seller’s Stamp Duty, legal fees and agent commission.</p></div>

<h2>How a condo sale differs from an HDB sale</h2>
<table aria-label="Differences between selling a private condo and selling an HDB flat">
  <tr><th>What differs</th><th>Private condo</th><th>HDB flat</th></tr>
  <tr><td>Who runs the process</td><td>The seller’s and buyer’s lawyers</td><td>HDB, through its resale portal</td></tr>
  <tr><td>Option terms</td><td>Agreed between seller and buyer</td><td>Set by HDB’s Option to Purchase</td></tr>
  <tr><td>Minimum Occupation Period</td><td>None for private condos</td><td>Must be met before selling</td></tr>
  <tr><td>Valuation</td><td>The buyer’s bank values the unit for its loan</td><td>HDB values the flat after the option is granted</td></tr>
</table>
<p>Executive condominiums are different again for their first years: they are bought under HDB rules and carry their own occupation period. If you own an HDB flat rather than a condo, start with <a href="/insights/how-to-sell-hdb-flat-singapore.html">how to sell an HDB flat</a>.</p>

<h2>Step 1: check what you would owe before you price</h2>
<ul>
  <li><strong>Seller’s Stamp Duty.</strong> It applies if you sell within four years of a purchase made on or after 4 July 2025, or within three years of one made between 11 March 2017 and 3 July 2025. See <a href="/insights/seller-stamp-duty-singapore.html">Seller’s Stamp Duty: rates and rules</a>.</li>
  <li><strong>Your outstanding loan.</strong> Ask your bank for the redemption amount, and whether your loan has a lock-in period, a redemption notice period or a clawback of subsidies.</li>
  <li><strong>Your CPF refund.</strong> Check the principal and accrued interest for each owner in your CPF home ownership dashboard.</li>
</ul>

<h2>Step 2: price it from caveats in your own project</h2>
<p>URA publishes caveats lodged for private home sales. Recent sales of the same bedroom type in your project, adjusted for floor, facing, size and condition, are the evidence a buyer and their bank will look at. Start with <a href="/condo-prices/">condo prices by district</a>, which are built from URA caveats, then ask for a <a href="/valuation.html">free valuation</a> if you want it done for your stack.</p>
<p>A buyer who needs a loan can borrow only against the lower of the price and the bank’s valuation. A price well above what the banks will support narrows your buyers to those with spare cash.</p>

<h2>Step 3: decide how you will sell</h2>
<p>You may sell on your own or appoint an agent. CEA publishes <a href="${SOURCES.ceaPrivate}" rel="noopener">checklists and standard contract templates</a> for owners who transact on their own, and says to consider an agent if you are unfamiliar with the process. Commission is not fixed in Singapore; it is agreed between you and the agent. <a href="/insights/property-agent-commission-singapore.html">Property agent commission</a> explains what to compare.</p>

<h2>Step 4: grant the Option to Purchase</h2>
<p>When you accept an offer, you grant the buyer an Option to Purchase (OTP) in return for an option fee. The buyer then has the option period to exercise it by signing and paying the balance of the deposit.</p>
<p>No agency sets these terms for a private sale. By market convention the option fee is 1% of the price, the option period is 14 days, and the buyer pays a further 4% on exercise, making a 5% deposit. Each of these can be negotiated, and whatever you agree should be written into the option. If the buyer does not exercise the option in time, it lapses and you normally keep the option fee.</p>
<p>The date the buyer accepts the option is, in most cases, the date IRAS uses to measure your holding period for Seller’s Stamp Duty.</p>

<h2>Step 5: your lawyer takes it to completion</h2>
<p>Each side appoints a conveyancing law firm. Yours holds the deposit as the option provides, answers the buyer’s legal requisitions, arranges redemption of your loan and the CPF refund, pays any Seller’s Stamp Duty, and apportions property tax and management fees up to the completion date.</p>
<p>Completion is commonly set 8 to 12 weeks after the option is exercised. That is a convention too, and both sides can agree a shorter or longer period, which matters if you need to line it up with your next purchase.</p>

<h2>What comes out of the sale price</h2>
<table aria-label="Deductions from a condo sale price">
  <tr><th>Item</th><th>What to know</th></tr>
  <tr><td>Outstanding housing loan</td><td>Repaid to your bank at completion. Check lock-in and notice terms early.</td></tr>
  <tr><td>CPF refund</td><td>CPF Board requires the principal withdrawn and its accrued interest to be refunded to your own CPF account. It is your money, but not cash in hand.</td></tr>
  <tr><td>Seller’s Stamp Duty</td><td>Only if you sell within the holding period.</td></tr>
  <tr><td>Legal fees</td><td>Agreed with your law firm.</td></tr>
  <tr><td>Agent commission</td><td>Agreed with your agent; GST is added if the agency is GST-registered.</td></tr>
  <tr><td>Property tax and management fees</td><td>Yours up to the completion date, then the buyer’s.</td></tr>
</table>
<p>CPF Board says that if the sale proceeds are not enough to cover the refund, you do not need to top up the shortfall in cash provided the property is sold at market value. It also counts option money you received in cash as part of the selling price.</p>

<h2>If you are buying your next home as well</h2>
<p>The order matters more than the sale itself. Buying before you sell can mean paying Additional Buyer’s Stamp Duty on the next home; selling first can mean renting in between. Work through <a href="/insights/sell-hdb-first-or-buy-condo-first.html">sell first or buy first</a> and check the duty with the <a href="/stamp-duty-calculator/">stamp duty calculator</a> before you grant an option.</p>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against CEA’s <a href="${SOURCES.ceaPrivate}" rel="noopener">Buying or selling a private residential property</a>, IRAS’s <a href="${SOURCES.irasSsd}" rel="noopener">Seller’s Stamp Duty for Residential Property</a> and CPF Board’s <a href="${SOURCES.cpfProceeds}" rel="noopener">Sales proceeds after selling your home</a>. Option fee, option period and completion time are market conventions, not rules, and are described as such above.</p>`,
    faqs: [
      ['How long does it take to sell a condo in Singapore?', 'Once a buyer exercises the Option to Purchase, completion is commonly set 8 to 12 weeks later, and both sides can agree a different period. Finding the buyer comes before that and depends on price, condition and demand in your project.'],
      ['Do I need to meet an MOP before selling a private condo?', 'No. Private condos have no Minimum Occupation Period. Check Seller’s Stamp Duty instead: it applies if you sell within four years of a purchase made on or after 4 July 2025, or within three years of one made between 11 March 2017 and 3 July 2025. Executive condominiums have their own occupation rules.'],
      ['Do I have to refund CPF when I sell my condo?', 'Yes. CPF Board requires the principal you withdrew and its accrued interest to be refunded to your own CPF account. If the proceeds are not enough to cover it, you do not need to top up the shortfall in cash provided the property is sold at market value.'],
      ['Is the option fee for a private property fixed?', 'No. For a private sale the option fee, the option period and the exercise deposit are agreed between seller and buyer. A 1% option fee, a 14-day option and a further 4% on exercise are market conventions, not rules.'],
    ],
  },
  {
    slug: 'renting-out-hdb-condo-singapore',
    title: 'Renting Out an HDB Flat or Condo: The Rules | PropertySG',
    headline: 'Renting out an HDB flat or condo in Singapore: the rules, the tax and the steps',
    description: 'Who may rent out an HDB flat or condo in Singapore, minimum rental periods, occupancy caps, the non-citizen quota, stamp duty on the lease and tax on rent.',
    category: 'Renting out',
    readTime: '8 min read',
    lede: 'HDB flats and private homes are let under different rules. HDB decides who may rent out a flat and to whom; URA sets the minimum stay and occupancy cap for private homes.',
    body: `
<div class="callout"><strong>The short answer</strong><p>To rent out a whole HDB flat you must be a Singapore Citizen, have met the Minimum Occupation Period and have HDB’s approval; each tenant must stay at least <strong>6 months</strong>. A private home needs no approval, but every occupant must stay at least <strong>3 consecutive months</strong>. Either way the lease is stamped and the net rent is taxable.</p></div>

<h2>Renting out a whole HDB flat</h2>
<h3>Who may rent out</h3>
<p>HDB allows only Singapore Citizen owners to rent out a whole flat; Singapore Permanent Resident owners may not. You must first meet the 5-year Minimum Occupation Period. For a non-subsidised flat bought on the open market before 30 August 2010 it is 3 years. HDB says owners of Prime and Plus flats are not allowed to rent out the whole flat even after their 10-year MOP.</p>
<h3>Approval and rental period</h3>
<p>You need HDB’s written approval, applied for online, before the tenants move in, and you must reapply each time you rent out the flat again or renew. The minimum rental period is 6 months for each tenant; short-term letting is not allowed. Approval runs for up to 3 years if every tenant is Singaporean or Malaysian, and up to 2 years if any tenant is a non-Malaysian non-citizen.</p>
<h3>Who may be your tenant</h3>
<p>Tenants must be Singapore Citizens, Singapore Permanent Residents, or non-citizens legally residing in Singapore on an Employment Pass, S Pass, Work Permit, Student Pass, Dependant Pass or Long-Term Social Visit Pass with at least 6 months’ validity at the date of application. HDB adds that Work Permit holders from the construction, manufacturing, marine and process sectors must be Malaysians, and that tourists may not be tenants.</p>
<h3>Non-citizen quota</h3>
<p>If any tenant is a non-Malaysian non-citizen, the non-citizen quota applies: 8% at the neighbourhood level and 11% at the block level. Once it is reached, only Singaporeans and Malaysians can rent a whole flat there. HDB has an e-service to check the quota for your block before you advertise.</p>
<h3>How many tenants</h3>
<table aria-label="Maximum number of tenants in an HDB flat">
  <tr><th>Flat type</th><th>Maximum number of tenants</th></tr>
  <tr><td>1-room and 2-room</td><td>4</td></tr>
  <tr><td>3-room</td><td>6</td></tr>
  <tr><td>4-room and bigger</td><td>8, reverting to 6 for a rental period that extends beyond 31 December 2028</td></tr>
</table>
<p>HDB says the maximum does not apply if all the tenants renting a whole flat are from the same family unit.</p>
<h3>Your responsibilities as owner</h3>
<p>HDB holds the owner responsible for what happens in the flat. You must make sure only the authorised tenants live there, that they are legally residing in Singapore, that they use it only as a home and that they do not sublet it. If you live overseas during the rental, you must appoint an attorney to manage the flat, and that attorney cannot be one of the tenants.</p>
<p>Renting out bedrooms while you continue to live in the flat follows a separate set of rules; see HDB’s <a href="${SOURCES.hdbRentBedrooms}" rel="noopener">renting out bedrooms</a> pages.</p>

<h2>Renting out a private condo or house</h2>
<p>No government approval is needed to let a private home, but URA’s rules apply to the owner:</p>
<ul>
  <li><strong>Minimum stay.</strong> Every occupant must stay at least three consecutive months. Renting it out as short-term accommodation is not allowed.</li>
  <li><strong>Occupancy cap.</strong> A home smaller than 90 square metres may house up to six unrelated persons. A home of at least 90 square metres may house up to eight until 31 December 2028, if the owner registers it with URA and pays the $20 fee.</li>
  <li><strong>Subletting.</strong> The cap applies to tenants who sublet as well, and URA says the owner must ensure tenants follow the rules.</li>
</ul>
<p>Check your development’s by-laws too. The management corporation can set house rules on move-ins, renovation hours and use of facilities that your tenant must follow.</p>

<h2>The tenancy agreement and stamp duty</h2>
<p>A written tenancy agreement should state the rent, the term, the deposit, who pays for repairs and how either side may end the lease early. It is then stamped. IRAS charges lease duty at 0.4% of the total rent for a lease of four years or less, and leases with an average annual rent of $1,000 or less are exempt. The agreement normally makes the tenant responsible for paying it. Stamp duty is due within 14 days of signing if the document is signed in Singapore.</p>
<div class="callout"><strong>Worked example</strong><p>A two-year lease at $3,400 a month has a total rent of $81,600. Lease duty is 0.4% × $81,600 = <strong>$326</strong>, rounded down to the nearest dollar.</p></div>

<h2>Tax on rental income</h2>
<p>Net rental income is taxable and is declared in your own income tax return. IRAS taxes rent from the date it is due, not the date you receive it. You may deduct expenses incurred to produce the rent, such as mortgage interest, property tax, fire insurance, maintenance and the cost of securing a tenant.</p>
<p>For a residential property you can instead claim deemed expenses of 15% of the gross rent, and still claim mortgage interest on top. You cannot mix the two methods for the same property. Renovation, additions and initial repairs are not deductible. Keep the tenancy agreement, loan statements and receipts for at least 5 years.</p>
<p>Property tax changes too. Owner-occupier rates apply only to a home you live in, and HDB notes that the property tax on a flat is revised when it is rented out. IRAS publishes the <a href="https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates" rel="noopener">current property tax rates</a>.</p>

<h2>Steps to rent out your home</h2>
<ol>
  <li>Confirm you are allowed to: citizenship and MOP for an HDB flat, and the non-citizen quota for your block.</li>
  <li>Set the rent from recent rentals in your town or project. The <a href="/insights/singapore-rental-market-3q-2026.html">rental market report</a> has the median HDB rent for every town.</li>
  <li>Check each prospective tenant’s identity and pass, and that the number of occupants is within the cap.</li>
  <li>Sign the tenancy agreement and have it stamped.</li>
  <li>For an HDB flat, obtain HDB’s approval before the tenants move in.</li>
  <li>Hand over with a dated inventory and photographs, and note the dates for renewal and for your tax return.</li>
</ol>
<p>If you would rather have this handled for you, see <a href="/rent-out/">renting out with Joe</a>. If you are weighing renting against selling, start with <a href="/valuation.html">a free valuation</a> so you can compare the rent with what a sale would release.</p>

<h2>Official sources and review date</h2>
<p>Reviewed ${reviewed} against HDB’s <a href="${SOURCES.hdbRentEligibility}" rel="noopener">Eligibility for renting out a flat</a> (page last updated 1 November 2026) and <a href="${SOURCES.hdbRentRegulations}" rel="noopener">Regulations for renting out a flat</a>, URA’s <a href="${SOURCES.uraRenting}" rel="noopener">Renting property</a> (last updated 6 November 2026), IRAS’s <a href="${SOURCES.irasStampRates}" rel="noopener">stamp duty rates</a> and IRAS’s <a href="${SOURCES.irasRentalIncome}" rel="noopener">Income from property rented out</a> (last updated 15 October 2026).</p>`,
    faqs: [
      ['Can I rent out my whole HDB flat?', 'Only if you are a Singapore Citizen owner who has met the Minimum Occupation Period, and only with HDB’s approval. Singapore Permanent Resident owners may not rent out a whole flat, and HDB says owners of Prime and Plus flats may not do so even after their 10-year MOP.'],
      ['What is the minimum rental period in Singapore?', 'For an HDB flat, each tenant must rent for at least 6 months per application. For a private home, URA requires every occupant to stay at least three consecutive months. Short-term letting is not allowed in either.'],
      ['How many tenants can I have?', 'In an HDB flat: 4 in a 1-room or 2-room flat, 6 in a 3-room flat and 8 in a 4-room or bigger flat, reverting to 6 for a rental period that extends beyond 31 December 2028. In a private home smaller than 90 square metres the cap is six unrelated persons; larger homes may house eight until 31 December 2028 if registered with URA.'],
      ['What is the non-citizen quota for HDB rentals?', 'It is 8% at the neighbourhood level and 11% at the block level, and it applies when any tenant of a whole flat is a non-Malaysian non-citizen. Once the quota is reached, only Singaporeans and Malaysians can rent a whole flat there. It does not apply to the rental of bedrooms.'],
      ['Is rental income taxable in Singapore?', 'Yes. Net rental income is taxable. You may deduct actual expenses such as mortgage interest, property tax, fire insurance and maintenance, or for a residential property claim deemed expenses of 15% of gross rent plus mortgage interest.'],
    ],
  },
];

// The seller's guide hub: every selling guide, in the order an owner needs it.
export const HUB = {
  path: 'sell/guide/index.html',
  url: 'https://joetay.com/sell/guide/',
  title: 'Seller’s Guide: Selling a Home in Singapore | PropertySG',
  headline: 'The seller’s guide: selling a home in Singapore, step by step',
  description: 'Every selling guide in order: what your home is worth, whether you can sell, how long it takes, what it costs, commission, stamp duty and what to do next.',
  steps: [
    {
      title: 'Know what your home is worth',
      intro: 'Price decides how long a sale takes and how much you keep. Start with registered sales, not asking prices.',
      links: [
        ['/neighbour-prices/', 'Your block’s sold prices', 'Every registered HDB resale in your block and street, by postal code.'],
        ['/hdb-prices/', 'HDB resale prices by town', 'Median price by flat type for all 26 towns, updated monthly.'],
        ['/condo-prices/', 'Condo prices by district', 'Resale prices per square foot from URA caveats.'],
        ['/insights/hdb-valuation-explained.html', 'HDB valuation explained', 'When HDB values a flat, who pays, and what Cash Over Valuation means.'],
      ],
    },
    {
      title: 'Check that you can sell, and what it triggers',
      intro: 'An HDB flat must meet its Minimum Occupation Period. Any home sold soon after purchase may attract Seller’s Stamp Duty.',
      links: [
        ['/insights/selling-hdb-after-mop-singapore.html', 'Selling an HDB flat after MOP', 'How MOP is counted, the CPF refund and the paperwork in order.'],
        ['/insights/seller-stamp-duty-singapore.html', 'Seller’s Stamp Duty: rates and rules', 'The holding period and rates for homes bought before and after 4 July 2025.'],
      ],
    },
    {
      title: 'Plan the timeline',
      intro: 'HDB’s eight weeks starts only when it accepts the resale application. The whole sale takes longer.',
      links: [
        ['/insights/how-long-to-sell-hdb-singapore-2026.html', 'How long it takes to sell an HDB flat', 'Each stage from listing to completion, with the deadlines HDB sets.'],
      ],
    },
    {
      title: 'Follow the steps and know the costs',
      intro: 'What to do in order, what each party pays, and how to estimate the cash and CPF you will receive.',
      links: [
        ['/insights/how-to-sell-hdb-flat-singapore.html', 'How to sell an HDB flat', 'Intent to Sell, Option to Purchase, resale application and completion, with a net-proceeds example.'],
        ['/insights/how-to-sell-condo-singapore.html', 'How to sell a condo', 'Pricing from caveats, the option, lawyers, the CPF refund and completion.'],
        ['/insights/property-agent-commission-singapore.html', 'Property agent commission', 'Commission is negotiable. What to compare, when it is paid and how GST applies.'],
      ],
    },
    {
      title: 'Decide what happens next',
      intro: 'If you are buying again, the order of the two transactions affects stamp duty, loans and where you live in between.',
      links: [
        ['/insights/sell-hdb-first-or-buy-condo-first.html', 'Sell first or buy first?', 'The stamp duty, loan and timing consequences of each order.'],
        ['/insights/15-month-wait-out-removed-private-owners-hdb.html', 'The 15-month wait-out is gone', 'What changed for private owners buying a resale flat.'],
        ['/stamp-duty-calculator/', 'Stamp duty calculator', 'Buyer’s Stamp Duty and ABSD on your next home.'],
      ],
    },
    {
      title: 'Or keep it and rent it out',
      intro: 'Renting has its own rules, and they differ for HDB flats and private homes.',
      links: [
        ['/insights/renting-out-hdb-condo-singapore.html', 'Renting out an HDB flat or condo', 'Who may rent out, minimum periods, occupancy caps, stamp duty and tax.'],
        ['/insights/singapore-rental-market-3q-2026.html', 'Rental market 3Q 2026', 'Median HDB rents for every town and gross yields.'],
      ],
    },
  ],
};

export const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const SKIP_LINK_CSS = '.skip-link{position:absolute;left:-9999px;top:0;z-index:10050;background:#0b1e3f;color:#fff;padding:12px 20px;border-radius:0 0 10px 0;font-weight:700;text-decoration:none}.skip-link:focus{left:0;outline:2px solid #10b981;outline-offset:2px}';
export const AUTHOR = { '@type': 'Person', '@id': 'https://joetay.com/about-joe/#joe-tay', name: 'Joe Tay', url: 'https://joetay.com/about-joe/', identifier: 'CEA R009618D' };
export const PUBLISHER = { '@type': 'RealEstateAgent', '@id': 'https://joetay.com/#agent', name: 'PropertySG', url: 'https://joetay.com/', alternateName: 'Joe Tay' };
export const BYLINE = '<div class="article-byline"><picture><source type="image/webp" srcset="/joe-tay-propertysg-advisor-400.webp"><img src="/joe-tay-propertysg-advisor-400.jpg" alt="Joe Tay" width="40" height="40" loading="lazy" decoding="async"></picture><div>By <strong><a href="/about-joe/">Joe Tay</a></strong> · District Director, ERA Realty Network · CEA R009618D</div></div>';
export const FOOTER = `<footer class="blog-footer">
${siteFooterHtml()}
<div class="blog-footer-inner"><p>&copy; 2026 PropertySG · <a href="/">Home</a> · <a href="/privacy-policy.html">Privacy Policy</a> · <a href="mailto:joe@joetay.com">joe@joetay.com</a></p><p class="creds">Joe Tay, District Director · ERA Realty Network Pte Ltd · Agency Lic. No. L3002382K · CEA Reg. No. R009618D</p></div>
</footer>`;
const ldJson = (schemas) => schemas.map((schema) => `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`).join('\n');
export const whatsapp = (text) => `https://wa.me/6581881488?text=${encodeURIComponent(text)}`;

export function headHtml({ title, description, url, ogType, ogTitle, extraMeta = '', schemas, stylesheet, extraCss = '' }) {
  return `<!DOCTYPE html>
<html lang="en-SG">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0b1e3f">
<link rel="manifest" href="/site.webmanifest">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en-SG" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="PropertySG">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="en_SG">
<meta property="og:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="https://joetay.com/joetay-social-preview.jpg">
${extraMeta}${ldJson(schemas)}
${fontLinksHtml()}
<link rel="stylesheet" href="${stylesheet}">
<style>${SKIP_LINK_CSS}${extraCss}</style>
<link rel="alternate" type="application/atom+xml" title="PropertySG Insights" href="https://joetay.com/insights/feed.xml">
<link rel="alternate" type="application/feed+json" title="PropertySG Insights (JSON Feed)" href="https://joetay.com/insights/feed.json">
<script src="/assets/analytics-loader.js" defer data-meta="false"></script>
${SITE_THEME_ASSETS_HTML}
${mobileHeaderAssetsHtml()}
</head>`;
}

// The consistency guard requires every insights article to link every sibling,
// so the list is the whole feed (which names each article once) minus this one.
const FEED_ITEMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'insights/feed.json'), 'utf8')).items
  .map((item) => [item.url.match(/\/insights\/([^/]+)\.html$/)[1], item.title]);

function relatedGuides(currentSlug) {
  const own = ARTICLES.map((article) => article.slug);
  const others = ARTICLES.filter((article) => article.slug !== currentSlug);
  return `<aside class="callout" aria-labelledby="related-guides-title"><strong id="related-guides-title">More for sellers and landlords</strong><ul style="margin-bottom:0">
    <li><a href="/sell/guide/">The seller’s guide: every selling guide in order</a></li>
    <li><a href="/faq/">Selling and renting out: common questions</a></li>
${others.map((article) => `    <li><a href="${article.slug}.html">${esc(article.headline)}</a></li>`).join('\n')}
${FEED_ITEMS.filter(([slug]) => !own.includes(slug)).map(([slug, title]) => `    <li><a href="${slug}.html">${esc(title)}</a></li>`).join('\n')}
  </ul></aside>`;
}

export function articlePage(article) {
  const url = `https://joetay.com/insights/${article.slug}.html`;
  const faqHtml = article.faqs.map(([question, answer]) => `<h3>${esc(question)}</h3>\n<p>${esc(answer)}</p>`).join('\n');
  const schemas = [
    {
      '@context': 'https://schema.org', '@type': 'Article', headline: article.headline,
      description: article.description, image: 'https://joetay.com/joetay-social-preview.jpg',
      datePublished: published, dateModified: article.modified || published, inLanguage: 'en-SG',
      author: AUTHOR, publisher: PUBLISHER, mainEntityOfPage: url,
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
  ];
  if (!guideEndCtaHtml(article.slug)) throw new Error(`${article.slug}: add its end-of-guide prompt to scripts/lib/guide-cta.mjs`);
  return `${headHtml({
    title: article.title, description: article.description, url, ogType: 'article', ogTitle: article.headline,
    extraMeta: `<meta property="article:author" content="Joe Tay">
<meta property="article:published_time" content="${published}">
<meta property="article:modified_time" content="${article.modified || published}">
<meta property="article:section" content="${esc(article.category)}">
`,
    schemas, stylesheet: 'blog.css',
  })}
<body>
<a class="skip-link" href="#main">Skip to content</a>
${siteHeaderHtml({ pagePath: `/insights/${article.slug}.html` })}
<main id="main" tabindex="-1" class="blog-main"><article class="article">
<div class="article-breadcrumb" role="navigation" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><a href="/insights/">Insights</a><span class="sep">›</span><span aria-current="page">${esc(article.headline)}</span></div>
<header class="article-header"><div class="article-meta-top"><span class="cat">${esc(article.category)}</span><span class="dot" aria-hidden="true">·</span><span>${article.readTime}</span><span class="dot" aria-hidden="true">·</span><time datetime="${article.modified || published}">${article.modified ? `Updated ${visibleDate(article.modified)}` : visibleDate(published)}</time></div>
<h1 id="article-title">${esc(article.headline)}</h1><p class="article-lede">${esc(article.lede)}</p>
${BYLINE}</header>
<section class="article-body" aria-labelledby="article-title">
${article.body}
${relatedGuides(article.slug)}
<h2>Frequently asked questions</h2>
${faqHtml}
<div class="callout"><strong>Important</strong><p>${DISCLAIMER}</p></div>
${guideEndCtaHtml(article.slug)}
</section></article></main>
${FOOTER}
<script src="/assets/conversion-tracking.js" defer></script>
${consentBannerHtml()}
</body>
</html>
`;
}

export function hubPage() {
  const steps = HUB.steps.map((step, index) => `<h2 id="step-${index + 1}"><span class="sg-num">${index + 1}.</span> ${esc(step.title)}</h2>
<p>${esc(step.intro)}</p>
<ul class="sg-links">
${step.links.map(([href, label, note]) => `  <li><a href="${href}">${esc(label)}</a><span>${esc(note)}</span></li>`).join('\n')}
</ul>`).join('\n');
  const schemas = [
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: HUB.headline, description: HUB.description,
      url: HUB.url, inLanguage: 'en-SG', author: AUTHOR, publisher: PUBLISHER,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://joetay.com/' },
        { '@type': 'ListItem', position: 2, name: 'Seller’s guide', item: HUB.url },
      ],
    },
  ];
  return `${headHtml({
    title: HUB.title, description: HUB.description, url: HUB.url, ogType: 'website', ogTitle: HUB.headline,
    schemas, stylesheet: '/insights/blog.css',
    extraCss: `
.article-body ul.sg-links{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:12px}
.article-body ul.sg-links li{margin:0;padding:16px 18px;border:1px solid rgba(11,30,63,.14);border-radius:12px;background:#fff}
.article-body ul.sg-links a{display:inline-block;font-weight:700;margin-bottom:4px}
.article-body ul.sg-links span{display:block;font-size:.93rem;line-height:1.5;color:#4a5872}
@media(min-width:720px){.article-body ul.sg-links{grid-template-columns:1fr 1fr}}
.article-body h2[id]{scroll-margin-top:84px}
html.jt-theme-dark .article-body ul.sg-links li{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.14)}
html.jt-theme-dark .article-body ul.sg-links span{color:#c3cede}`,
  })}
<body>
<a class="skip-link" href="#main">Skip to content</a>
${siteHeaderHtml({ pagePath: '/sell/guide/' })}
<main id="main" tabindex="-1" class="blog-main"><article class="article">
<div class="article-breadcrumb" role="navigation" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><span aria-current="page">Seller’s guide</span></div>
<header class="article-header">
<h1 id="article-title">${esc(HUB.headline)}</h1><p class="article-lede">Every selling guide on this site, in the order an owner needs them. Each one cites the official HDB, CPF Board, IRAS, URA or CEA page it relies on.</p>
${BYLINE}</header>
<section class="article-body" aria-labelledby="article-title">
${steps}
<h2 id="questions">Quick answers</h2>
<p>For short answers to the questions owners ask most, see <a href="/faq/">selling and renting out: common questions</a>. For terms such as OTP, MOP and COV, see the <a href="/glossary/">property glossary</a>.</p>
<div data-jt-checklist></div>
<div class="article-cta">
  <h3>Want this worked out for your home?</h3>
  <p>Joe will price your home from registered sales nearby and set out the steps, costs and timing for your case. Free, no obligation.</p>
  <div class="article-cta-actions">
    <a href="/valuation.html">Get a free valuation →</a>
    <a class="article-cta-secondary" href="${whatsapp('Hi Joe, I am thinking of selling my property.')}" target="_blank" rel="noopener">WhatsApp Joe</a>
  </div>
</div>
</section></article></main>
${FOOTER}
<script src="/assets/conversion-tracking.js" defer></script>
<script src="/js/recaptcha-helper.js" defer></script>
<script src="/assets/checklist-offer.js" defer></script>
${consentBannerHtml()}
</body>
</html>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputs = [
    ...ARTICLES.map((article) => [
      `insights/${article.slug}.html`,
      // Same post-processing as the other articles: TOC, then cover.
      injectCover(injectToc(articlePage(article)), loadCover(article.slug)),
    ]),
    [HUB.path, hubPage()],
  ];
  let changed = 0;
  for (const [rel, output] of outputs) {
    const file = path.join(ROOT, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current === output) continue;
    if (checkOnly) {
      console.error(`::error file=${rel}::generated seller guide is stale — run: node scripts/generate-seller-cluster.mjs`);
      process.exitCode = 1;
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, output);
      changed += 1;
    }
  }
  if (!process.exitCode) console.log(checkOnly ? `Seller cluster is current — ${outputs.length} pages` : `Seller cluster: ${changed} page(s) written`);
}
