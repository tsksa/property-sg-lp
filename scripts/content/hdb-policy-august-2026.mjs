// Policy facts checked against HDB's announcement and both annexes on 26 Aug 2026.
export const policySources = {
  announcement: 'https://www.hdb.gov.sg/hdb-pulse/news/2026/increase-in-income-ceilings-and-greater-support-for-families-with-children',
  annexA: 'https://www.hdb.gov.sg/-/media/hdb-pulse/news/2026/increase-in-income-ceilings-and-greater-support-for-families-with-children/Annex-A.pdf?sc_lang=en&hash=791DCCF1F12CD509C997A5A5831DE08F',
  annexB: 'https://www.hdb.gov.sg/-/media/hdb-pulse/news/2026/increase-in-income-ceilings-and-greater-support-for-families-with-children/Annex-B.pdf?sc_lang=en&hash=05C2364C54C2ED2BBA548DBB3B664555',
  waitOut: 'https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners',
};

export const hdbPolicyArticle = {
  slug: 'hdb-income-ceiling-2026-ndr-changes',
  published: '2026-08-26',
  modified: '2026-08-26',
  title: 'HDB Income Ceiling 2026: $16,000 HDB, $18,000 EC | Joe Tay',
  headline: 'HDB income ceiling 2026: $16,000 for families, $18,000 for qualifying ECs',
  description: 'Understand the 24 August 2026 HDB income-ceiling changes, singles and EC limits, existing HFE letters, November BTO timing and 2027 ballot chances.',
  category: 'Housing policy',
  readTime: '7 min read',
  lede: 'More households can consider subsidised housing, but the new $18,000 ceiling is not the general HDB limit. Your household type, HFE application date and the EC land tender still matter.',
  body: `
<div class="callout"><strong>The headline, correctly separated</strong><p>For HFE applications from 24 August 2026, the general family ceiling for subsidised HDB housing and HDB loans is $16,000; eligible singles buying alone have an $8,000 ceiling. The $18,000 limit is for qualifying new EC units, not all HDB purchases. This follows the National Day Rally announcement on 23 August.</p></div>

<h2>Which income ceiling applies to you?</h2>
<table aria-label="August 2026 housing income ceiling changes">
  <thead><tr><th scope="col">Household or purchase</th><th scope="col">Previous</th><th scope="col">Revised</th></tr></thead>
  <tbody>
    <tr><th scope="row">Typical family: subsidised HDB housing / HDB loan</th><td>$14,000</td><td>$16,000</td></tr>
    <tr><th scope="row">Eligible single buying alone: subsidised flat / Singles Grant / HDB loan</th><td>$7,000</td><td>$8,000</td></tr>
    <tr><th scope="row">Eligible extended family where the higher ceiling applies</th><td>$21,000</td><td>$24,000; each family nucleus at most $16,000</td></tr>
    <tr><th scope="row">New EC unit with qualifying land tender</th><td>$16,000</td><td>$18,000</td></tr>
  </tbody>
</table>
<p>These are monthly household income limits, not approved loan amounts. Flat-type and household exceptions remain: a new 99-year 2-room Flexi flat has an $8,000 ceiling, and 3-room project limits can differ. Joint singles and single buyers are not interchangeable. Use <a href="${policySources.annexA}" rel="noopener">HDB's complete household and flat-type tables (Annex A)</a> rather than applying one figure to every purchase.</p>

<h2>Is the EC ceiling $18,000 for every launch?</h2>
<p>No. The new limit applies to EC units on sites whose <strong>land sale tender closes on or after 24 August 2026</strong>. Balance units in existing EC projects and projects from earlier awarded tenders do not gain the new ceiling simply because a buyer applies now. Ask for the site's tender details before paying a booking fee.</p>
<p>The change widens the group who may apply; it does not replace the other EC eligibility and financing conditions. A household earning $17,000 should not assume it qualifies for an existing EC launch, or for an HDB loan.</p>

<h2>What if you already have an HFE letter?</h2>
<p><a href="${policySources.annexB}" rel="noopener">HDB's transition instructions (Annex B)</a> distinguish four cases:</p>
<ul>
  <li><strong>Apply on or after 24 August:</strong> the revised ceilings are used.</li>
  <li><strong>Valid letter, already eligible:</strong> no action is required solely because of the ceiling change.</li>
  <li><strong>Valid letter, previously excluded by income:</strong> if no flat application has been submitted, HDB allows cancellation and a fresh HFE application for assessment under the new ceilings.</li>
  <li><strong>Pre-24 August application still processing:</strong> the old ceiling applies unless you cancel and apply afresh.</li>
</ul>
<p>A fresh application also changes the income-assessment period. Do not cancel automatically: check whether your income or circumstances have changed, and ask HDB first if a flat application is already underway. See the <a href="/insights/hfe-letter-singapore-guide.html">HFE application guide</a> for the wider process.</p>

<h2>Does the higher ceiling mean a bigger grant or loan?</h2>
<p>Not automatically. The CPF Housing Grant for resale flats and the Enhanced CPF Housing Grant (EHG) are different schemes. EHG still has its own income test: $9,000 for a first-timer family and $4,500 for an eligible single buying alone. A family newly admitted at $15,000 does not gain EHG just because it passes the new general ceiling. Check the <a href="/insights/hdb-resale-grants-singapore.html">resale grant guide</a> and <a href="/insights/enhanced-cpf-housing-grant-singapore.html">EHG guide</a>.</p>
<p>Nor is the ceiling a purchase budget. Current HDB lending still depends on the 75% maximum LTV, the 30% MSR, age, lease and credit assessment. The HDB concessionary rate remains 2.6% for July–September 2026; the income announcement is not a rate cut. Use the <a href="/calculator/">HDB loan calculator</a> for repayment estimates, then rely on HDB's HFE outcome for eligibility and the approved amount.</p>

<h2>Three practical household examples</h2>
<ul>
  <li><strong>A family earning $15,000:</strong> the new general ceiling may reopen an HDB option. Compare the actual HFE outcome with your cash, CPF and monthly budget before increasing your target price.</li>
  <li><strong>An eligible single earning $7,500:</strong> the higher ceiling may matter for a qualifying flat, Singles Grant or HDB loan. Age, flat type and other conditions still apply; this income is above the single-buyer EHG ceiling.</li>
  <li><strong>A family earning $17,000:</strong> check qualifying future EC sites or other eligible resale/bank-financed routes. The $18,000 EC number does not turn into a $18,000 HDB loan ceiling.</li>
</ul>
<p>These are illustrations of the income test, not individual approval predictions. Buying an Unclassified or Standard resale flat without the CPF Housing Grant has no general purchase income ceiling; HDB loan and grant conditions are separate. Plus and Prime resale flats retain additional restrictions.</p>

<h2>November 2026 BTO and February 2027 ballot changes</h2>
<p>The next BTO exercise moves from October to <strong>November 2026</strong>. HDB advises applicants to submit the complete HFE document set by <strong>25 September 2026</strong>. Around 7,960 flats are planned in Bedok, Geylang, Sembawang, Tengah, Toa Payoh and Yishun; launch details remain subject to HDB's release.</p>
<p>From the <strong>February 2027</strong> exercise, first-timer families with or expecting children receive an extra ballot chance per Singapore Citizen child aged 18 or below, across BTO and SBF applications. This is not a November 2026 benefit and does not guarantee a flat. Confirm the qualifying details in the applicable sales exercise.</p>

<h2>Other households covered by the announcement</h2>
<p>Annex A also raises the income limits for PPHS, Fresh Start and the Step-Up CPF Housing Grant from $7,000 to $8,000. For eligible seniors, the Lease Buyback Scheme, Silver Housing Bonus, Community Care Apartments and short-lease 2-room Flexi purchases move from $14,000 to $16,000. The separate scheme conditions still apply.</p>

<h2>Separate July change: the private-owner wait-out rule</h2>
<p>The <a href="${policySources.waitOut}" rel="noopener">July 2026 wait-out announcement</a> removed the 15-month wait for private owners buying a non-subsidised HDB resale flat without an HDB loan. It did <strong>not</strong> remove the 30-month private-property disposal requirement for subsidised purchases, new ECs or HDB loans. Private property must still be disposed of within six months of completing the eligible resale purchase.</p>

<h2>Your next steps</h2>
<ol>
  <li>Identify the correct household, flat and financing route.</li>
  <li>Check your HFE date and status before deciding whether to reapply.</li>
  <li>Use confirmed grants and a comfortable repayment, not a headline ceiling, to set the budget.</li>
  <li>For ECs, verify the land-tender cohort; for November BTO, prepare HFE documents early.</li>
</ol>
<p><a href="/#book">Discuss your housing options with Joe</a> if you want help comparing routes. Keep HDB's written assessment as the basis for any commitment.</p>

<h2>Official sources and review date</h2>
<p>Reviewed 26 Aug 2026 using the <a href="${policySources.announcement}" rel="noopener">HDB income-ceiling announcement</a> and its Annexes A and B, HDB's <a href="https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb" rel="noopener">housing loan conditions</a>, <a href="https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/couples-and-families/enhanced-cpf-housing-grant" rel="noopener">EHG conditions</a> and <a href="https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate" rel="noopener">interest-rate page</a>. Recheck official conditions before applying.</p>`,
  faqs: [
    ['Is the HDB income ceiling $18,000 in 2026?', 'No. From 24 August 2026 HFE applications, the general family ceiling for subsidised HDB housing and HDB loans is $16,000. The $18,000 ceiling applies to qualifying new EC sites whose land sale tender closes on or after 24 August 2026.'],
    ['Must every existing HFE holder apply again?', 'No. Already-eligible holders of valid HFE letters need no action solely for this change. Previously income-ineligible holders who have not submitted a flat application may cancel and reapply. A fresh application uses a new income-assessment period.'],
    ['Did the EHG income ceiling rise to $16,000?', 'No. EHG is separate: the income ceiling remains $9,000 for a first-timer family and $4,500 for an eligible single buying alone.'],
    ['When do the extra ballot chances for children start?', 'From the February 2027 BTO and SBF sales exercise, not the November 2026 exercise. Eligibility conditions still apply.'],
  ],
};
