#!/usr/bin/env python3
#!/usr/bin/env python3
"""Write the five quarterly market articles in insights/ (JOE-389).

    python3 scripts/market-articles/fetch_data.py
    python3 scripts/market-articles/analyse.py
    python3 scripts/market-articles/build_articles.py
    npm run apply:article-toc && npm run check

Tables are generated from the analysed data in $MARKET_DATA_DIR; the prose quotes
figures from summary.json and official releases by hand, so a refresh means
updating config.py, re-running the three steps and rewriting the prose numbers
that changed. The page shell (head assets, top bar, footer, consent banner) is
copied from insights/ec-vs-private-condo-2027.html so it stays in step with the
site's apply-* scripts. Publish dates are PUB below.
"""
import json, re, html
from pathlib import Path

from config import DATA_DIR, MIN_DEALS_YIELD, ROOT

WT = ROOT
INS = WT / 'insights'
PUB = '2026-09-17'
PUB_H = 'Sep 17, 2026'

tpl = (INS / 'ec-vs-private-condo-2027.html').read_text()
HEAD_ASSETS = tpl[tpl.index('<link rel="preload" as="font"'):tpl.index('</head>')]
TOPBAR = re.search(r'<header class="blog-topbar">.*?</header>', tpl, re.S).group(0)
TAIL = tpl[tpl.index('<footer class="blog-footer">'):]
BYLINE = re.search(r'<div class="article-byline">.*?</div></div>', tpl, re.S).group(0)
DISCLAIMER_TPL = '<div class="callout"><strong>Important</strong><p>{}</p></div>'

esc = lambda s: html.escape(s, quote=True)
money = lambda v: f"${v:,.0f}"

def town_label(t):
    return {'KALLANG/WHAMPOA': 'Kallang/Whampoa', 'CENTRAL AREA': 'Central Area'}.get(t, t.title())

def town_slug(t):
    return t.lower().replace('/', '-').replace(' ', '-')

def town_link(t):
    return f'<a href="/hdb-prices/{town_slug(t)}/">{town_label(t)}</a>'

# ---------------------------------------------------------------- data
t2 = json.loads((DATA_DIR / 'town-quarter.json').read_text())
cheap = json.loads((DATA_DIR / 'cheapest.json').read_text())
rent = json.loads((DATA_DIR / 'median-rent.json').read_text())
projects = json.loads((WT / 'new-launches' / 'projects.json').read_text())['projects']

def rent_of(q, town, code):
    town = 'CENTRAL' if town == 'CENTRAL AREA' else town
    for r in rent:
        if r['quarter'] == q and r['town'].strip() == town and r['flat_type'] == code:
            v = r['median_rent']
            return int(float(v)) if v.replace('.', '').isdigit() else None
    return None

ARTICLES = []

# ================================================================ 1. HDB resale prices 2Q 2026 by town
def a1():
    rows = []
    for town, rec in t2.items():
        def cell(ft):
            d = rec[ft]
            if d['n'] < 10:
                return '<td>—</td>'
            return f"<td>{money(d['med'])} <small>({d['n']})</small></td>"
        rows.append(f"    <tr><th scope=\"row\">{town_link(town)}</th>{cell('3 ROOM')}{cell('4 ROOM')}{cell('5 ROOM')}<td>{rec['all']['m1']}</td><td>{rec['all']['n']}</td></tr>")
    town_table = '\n'.join(rows)
    body = f'''
<div class="callout"><strong>The short version</strong><p>HDB's Resale Price Index fell <strong>0.3%</strong> in the second quarter of 2026, after a 0.1% dip in the first, which was the index's first fall since 2019. HDB cited the two declines on 28 July when it scrapped the 15-month wait-out for private owners. Transaction data shows the same thing town by town: a 4-room flat's median price was <strong>$630,000</strong>, almost the same as a year earlier. Several towns look like they jumped or fell, but those moves mostly reflect which flats sold, not a change in value.</p></div>

<h2 id="what-hdb-reported-for-2q-2026">What HDB reported for 2Q 2026</h2>
<p>HDB published its final second-quarter figures on 24 July 2026, three weeks after a flash estimate that turned out almost exactly right.</p>
<table aria-label="HDB official resale market figures for 2Q 2026">
  <thead><tr><th scope="col">Measure</th><th scope="col">2Q 2026</th><th scope="col">Change</th></tr></thead>
  <tbody>
    <tr><th scope="row">Resale Price Index</th><td>202.8</td><td>−0.3% on 1Q 2026 (203.4)</td></tr>
    <tr><th scope="row">Resale Price Index, 1Q 2026</th><td>203.4</td><td>−0.1% on 4Q 2025</td></tr>
    <tr><th scope="row">Resale transactions</th><td>6,396</td><td>+1.8% on 1Q (6,285); −9.9% on 2Q 2025 (7,102)</td></tr>
    <tr><th scope="row">Flash estimate, 1 July</th><td>202.7</td><td>−0.3%</td></tr>
  </tbody>
</table>
<p>For context, URA's private home price index rose 0.5% in the same quarter, so the gap between HDB and private prices widened slightly. More transactions but slightly lower prices means buyers had more flats to pick from, not that demand dried up.</p>

<h2 id="median-prices-by-flat-type">Median prices by flat type</h2>
<p>HDB's index is adjusted for flat age, size and location, so it doesn't give a dollar figure for any flat. For dollar figures I used HDB's own transaction records on data.gov.sg: 6,185 resale deals registered from April to June 2026. That total is slightly below HDB's 6,396 because the two sources count deals differently.</p>
<table aria-label="Median HDB resale price by flat type, 2Q 2026">
  <thead><tr><th scope="col">Flat type</th><th scope="col">Deals</th><th scope="col">Median 2Q 2026</th><th scope="col">1Q 2026</th><th scope="col">2Q 2025</th><th scope="col">Year on year</th></tr></thead>
  <tbody>
    <tr><th scope="row">2-room</th><td>192</td><td>$378,000</td><td>$372,000</td><td>$365,000</td><td>+3.6%</td></tr>
    <tr><th scope="row">3-room</th><td>1,491</td><td>$440,000</td><td>$445,000</td><td>$448,000</td><td>−1.8%</td></tr>
    <tr><th scope="row">4-room</th><td>2,703</td><td>$630,000</td><td>$628,000</td><td>$632,800</td><td>−0.4%</td></tr>
    <tr><th scope="row">5-room</th><td>1,418</td><td>$738,000</td><td>$745,000</td><td>$738,444</td><td>−0.1%</td></tr>
    <tr><th scope="row">Executive</th><td>375</td><td>$920,000</td><td>$900,000</td><td>$908,500</td><td>+1.3%</td></tr>
  </tbody>
</table>
<p>A flat year for 4-room and 5-room flats and a small dip for 3-room flats is what the index describes. The median price per square foot was $594 for a 3-room flat, $619 for a 4-room and $580 for a 5-room.</p>

<h2 id="2q-2026-resale-prices-by-town">2Q 2026 resale prices by town</h2>
<p>Each figure is the median price, with the number of deals in brackets. A dash means fewer than ten deals, too few for a median to mean much. Each town name links to its price page, which covers the last 12 months by flat type and street.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="Median HDB resale price by town and flat type, April to June 2026">
  <thead><tr><th scope="col">Town</th><th scope="col">3-room</th><th scope="col">4-room</th><th scope="col">5-room</th><th scope="col">$1m+ deals</th><th scope="col">All deals</th></tr></thead>
  <tbody>
{town_table}
  </tbody>
</table>
</div>
<p>The cheapest towns for a 4-room flat were {town_link('JURONG WEST')} ($530,000), {town_link('YISHUN')} ($545,000) and {town_link('WOODLANDS')} ($550,000). The most expensive were {town_link('CENTRAL AREA')}, {town_link('QUEENSTOWN')} and {town_link('TOA PAYOH')}, all above $1 million. <a href="cheapest-4-room-5-room-hdb-resale-flats.html">The cheapest 4-room and 5-room towns guide</a> ranks every town over six months and separates cheap flats from short leases.</p>

<h2 id="why-some-town-medians-jumped">Why some town medians jumped</h2>
<p>Clementi's 4-room median rose 32% on a year earlier, to $882,000. Read quickly, that looks like a boom. It isn't. In 2Q 2025 the typical 4-room flat sold there had 55 years of lease left. In 2Q 2026 it had 76 years, and the share with 90 years or more doubled, from 10% to 21%, as newer blocks passed their minimum occupation period. The town didn't get more expensive. Newer flats made up more of the sales.</p>
<p>Sembawang shows the reverse. Its 4-room median fell 6.6% because fewer new flats sold: flats with 90 years or more left fell from 71% of deals to 47%. Ang Mo Kio's 19% jump in 5-room prices has the same cause as Clementi's.</p>
<p>To see the real direction, compare flats with similar leases across the island. For 4-room flats:</p>
<table aria-label="4-room median resale price by remaining lease, 2Q 2026 against 2Q 2025">
  <thead><tr><th scope="col">Remaining lease</th><th scope="col">Deals, 2Q 2026</th><th scope="col">Median 2Q 2026</th><th scope="col">Median 2Q 2025</th><th scope="col">Change</th></tr></thead>
  <tbody>
    <tr><th scope="row">Under 60 years</th><td>539</td><td>$550,000</td><td>$560,000</td><td>−1.8%</td></tr>
    <tr><th scope="row">60 to 80 years</th><td>979</td><td>$580,000</td><td>$585,000</td><td>−0.9%</td></tr>
    <tr><th scope="row">80 to 95 years</th><td>1,183</td><td>$710,000</td><td>$700,000</td><td>+1.4%</td></tr>
  </tbody>
</table>
<p>Newer flats still gained a little. Older flats slipped, and the shortest leases slipped most. That split matters more to a seller than any town median. If your flat has less than 60 years left, price it against recent sales in your own block and street, not the town median. <a href="hdb-valuation-explained.html">How HDB valuation works</a> explains why.</p>

<h2 id="million-dollar-flats">Million-dollar flats</h2>
<p>491 flats sold for $1 million or more between April and June, up from 411 in the first quarter and 415 a year earlier. The count comes from the transaction records. Most were 4-room (212) and 5-room (183) flats, plus 93 executive flats. Toa Payoh (66), Queenstown (65) and Bukit Merah (64) led. The highest price was $1,728,000 for a 5-room flat on the 46th to 48th floors of Block 96A Henderson Road, sold in April. More million-dollar sales while the index fell is consistent: more newer, central flats reached their MOP and sold, and they sold high.</p>

<h2 id="july-and-august-early-read">July and August: an early read</h2>
<p>Transaction records to the end of August show 5,170 deals in two months. The 4-room median was $625,000 and the 5-room median $735,000, a touch below the second quarter. 388 flats sold for $1 million or more. This covers only two-thirds of a quarter and doesn't yet show the full effect of the wait-out removal on 28 July. Treat it as a direction, not a result. HDB's flash estimate for the third quarter is due at the start of October.</p>

<h2 id="what-it-means-if-you-are-selling-or-buying">What it means if you are selling or buying</h2>
<ul>
  <li><strong>More flats to choose from.</strong> HDB says 13,500 flats reach their MOP in 2026, then 15,000 in 2027 and 19,500 in 2028, against 8,000 in 2025. Buyers get more choice every year. Sellers of ordinary flats in the same estates face more competition.</li>
  <li><strong>A new group of buyers.</strong> Since 28 July, private property owners can buy a resale flat of any size without waiting 15 months. They must buy without grants or an HDB loan, and sell their private property within six months. That mostly helps sellers of larger flats in mature and central towns. <a href="15-month-wait-out-removed-private-owners-hdb.html">The wait-out guide</a> covers who qualifies.</li>
  <li><strong>New BTO flats in October.</strong> HDB's October 2026 exercise offers about 7,960 flats in Bedok, Geylang, Sembawang, Tengah, Toa Payoh and Yishun. First-timers who can wait for a new flat may hold off on buying resale in those towns.</li>
  <li><strong>Lease matters more than town.</strong> The table above shows the gap between young and old leases widening. Older-lease sellers should price realistically from the start instead of cutting later. <a href="how-long-to-sell-hdb-singapore-2026.html">How long it takes to sell</a> sets out what an overpriced listing costs in time.</li>
</ul>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Look up your own block's recent sales on <a href="/neighbour-prices/">neighbour prices</a> and your town page on <a href="/hdb-prices/">HDB prices by town</a>.</li>
  <li>Get a <a href="/valuation.html">free valuation</a> that accounts for your remaining lease, floor and condition, not just the town median.</li>
  <li>If you are selling to upgrade, check the numbers on the next home with the <a href="/calculator/">affordability calculator</a> and read <a href="selling-hdb-after-mop-singapore.html">selling after MOP</a>.</li>
</ol>
<p><a href="/#book">Book a 15-minute call with me</a> to go through your block's numbers. If you are comparing agents, <a href="property-agent-commission-singapore.html">the commission guide</a> sets out what the fee should cover.</p>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 17 Sep 2026. Official figures come from HDB's <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/2nd-quarter-2026-public-housing-data-and-upcoming-flat-supply" rel="noopener">2nd Quarter 2026 public housing data</a> (24 July 2026), the <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/flash-estimate-of-2nd-quarter-2026-resale-price-index-and-upcoming-flat-supply" rel="noopener">flash estimate</a> (1 July 2026), HDB's <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners" rel="noopener">wait-out announcement</a> (28 July 2026) for MOP supply, and URA's <a href="https://www.ura.gov.sg/news/media/pr26-57/" rel="noopener">2nd Quarter 2026 real estate statistics</a>. Medians, lease splits, million-dollar counts and the July–August read are my own analysis of HDB's <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view" rel="noopener">resale flat prices dataset</a> on data.gov.sg (Singapore Open Data Licence), downloaded 17 September 2026, grouped by registration month.</p>
'''
    faqs = [
        ('Did HDB resale prices fall in 2Q 2026?', 'Yes, slightly. HDB’s Resale Price Index fell 0.3% in the second quarter of 2026 to 202.8, after a 0.1% fall in the first quarter. It was the second quarterly decline in a row, while resale transactions rose 1.8% on the quarter to 6,396.'),
        ('What is the median price of a 4-room HDB resale flat in 2026?', 'The median 4-room resale price was $630,000 in April to June 2026, based on 2,703 transactions in HDB’s data.gov.sg records. That is 0.4% below a year earlier. Town medians ranged from $530,000 in Jurong West to about $1.19 million in the Central Area.'),
        ('Which town has the cheapest 4-room resale flats?', 'Jurong West had the lowest 4-room median in 2Q 2026 at $530,000, followed by Yishun at $545,000 and Woodlands at $550,000. Some cheap medians reflect short remaining leases, so compare flats with similar lease left.'),
        ('How many HDB flats sold for over $1 million in 2Q 2026?', '491 flats sold for $1 million or more between April and June 2026 in HDB’s transaction records, up from 411 in the first quarter. Toa Payoh, Queenstown and Bukit Merah had the most. The count comes from the transaction records.'),
    ]
    return dict(slug='hdb-resale-prices-2q-2026-by-town', title='HDB Resale Prices 2Q 2026 by Town', cat='Market data', mins=8,
                headline='HDB resale prices in 2Q 2026 by town: the index dipped, and town medians hide where',
                crumb='HDB resale prices 2Q 2026',
                desc='HDB resale prices fell 0.3% in 2Q 2026. Median 3-, 4- and 5-room prices for all 26 towns, million-dollar flats and why some town medians mislead.',
                og_desc='The Resale Price Index fell 0.3% in 2Q 2026. Median prices by town and flat type from 6,185 transactions, and the lease effect behind the biggest moves.',
                lede='HDB resale prices dipped for a second quarter while more flats changed hands. Here are the official figures, median prices for every town and flat type, and why the biggest town moves came from newer flats selling, not from values changing.',
                card='The Resale Price Index fell 0.3%. Median 3-, 4- and 5-room prices for every town, million-dollar flats, and why some town medians mislead.',
                body=body, faqs=faqs,
                disclaimer='This guide is general market information, not a valuation or financial advice. Medians describe transactions that happened, not what a particular flat will fetch. Get a valuation for your own flat before setting a price.',
                related_top=[('/hdb-prices/', 'HDB resale prices by town'), ('/neighbour-prices/', 'Your block’s sold prices')])
ARTICLES.append(a1)

# ================================================================ 2. wait-out removal
def a2():
    body = '''
<div class="callout"><strong>The short version</strong><p>Since <strong>28 July 2026</strong>, private property owners and former owners can buy an HDB resale flat of any size straight away, with no 15-month wait. Three conditions apply: the flat is bought without grants, it is bought without an HDB loan, and every private property is sold within six months of the flat purchase completing. Anyone who wants a subsidised flat, a new EC or an HDB loan still waits <strong>30 months</strong> after selling their private home.</p></div>

<h2 id="what-changed-on-28-july-2026">What changed on 28 July 2026</h2>
<p>HDB announced the change on 28 July 2026, effective immediately, as the Minister for National Development spoke at the Singapore Economic Review Conference. The rule it removed dated from the 30 September 2022 cooling measures. Private owners who sold their home had to wait 15 months before buying a resale flat. The only exemption was for citizens aged 55 and above moving to a 4-room or smaller flat.</p>
<table aria-label="Private property owners buying an HDB flat: rules before and after 28 July 2026">
  <thead><tr><th scope="col">Situation</th><th scope="col">Before 28 July 2026</th><th scope="col">From 28 July 2026</th></tr></thead>
  <tbody>
    <tr><th scope="row">Non-subsidised resale flat, no HDB loan, any age, any flat size</th><td>15-month wait after selling (except 55+ buying 4-room or smaller)</td><td>No wait. Sell all private property within six months of completing the flat purchase</td></tr>
    <tr><th scope="row">Resale flat with housing grants</th><td>30-month wait</td><td>30-month wait (unchanged)</td></tr>
    <tr><th scope="row">New flat from HDB, with or without grants</th><td>30-month wait</td><td>30-month wait (unchanged)</td></tr>
    <tr><th scope="row">New EC from a developer</th><td>30-month wait</td><td>30-month wait (unchanged)</td></tr>
    <tr><th scope="row">Any HDB flat bought with an HDB housing loan</th><td>30-month wait</td><td>30-month wait (unchanged)</td></tr>
  </tbody>
</table>
<p>HDB gave two reasons. First, resale prices have eased: the Resale Price Index fell 0.1% in the first quarter and 0.3% in the second, after five quarters of slow or no growth. Second, many more flats are reaching the end of their minimum occupation period (MOP): 8,000 in 2025, 13,500 in 2026, 15,000 in 2027 and 19,500 in 2028. The quarter's figures are in <a href="hdb-resale-prices-2q-2026-by-town.html">HDB resale prices 2Q 2026 by town</a>.</p>

<h2 id="the-conditions-that-still-apply">The conditions that still apply</h2>
<ul>
  <li><strong>An HFE letter first.</strong> Private owners must get an HDB Flat Eligibility (HFE) letter before buying a resale flat, as every buyer does. The <a href="hfe-letter-singapore-guide.html">HFE letter guide</a> explains the timing.</li>
  <li><strong>No HDB loan.</strong> The flat must be paid for with a bank loan, CPF savings and cash. With an HDB loan, the 30-month wait still applies.</li>
  <li><strong>No grants.</strong> This covers only non-subsidised resale flats. With the <a href="enhanced-cpf-housing-grant-singapore.html">Enhanced CPF Housing Grant</a> or any other <a href="hdb-resale-grants-singapore.html">resale grant</a>, the 30-month wait applies.</li>
  <li><strong>Sell within six months.</strong> HDB requires all private residential property, in Singapore or overseas, to be sold within six months of completing the resale flat purchase.</li>
  <li><strong>Normal resale rules.</strong> Every other resale rule still applies, including the five-year MOP on the flat you buy.</li>
</ul>

<h2 id="stamp-duty-and-bank-loans-during-the-overlap">Stamp duty and bank loans during the overlap</h2>
<p>The new sequence means owning two homes for a while: the flat you have just bought and the private home you still have to sell. Two costs follow from that.</p>
<p><strong>Additional buyer's stamp duty (ABSD).</strong> IRAS's published answer for a Singapore citizen who owns a private home and buys an HDB resale flat is that ABSD remission is given upfront, because HDB requires the private home to be sold within six months. That citizen doesn't pay ABSD on the flat. Buyer's stamp duty still applies as usual; the <a href="/stamp-duty-calculator/">stamp duty calculator</a> works it out. If you are a permanent resident, or your ownership is unusual, confirm with IRAS before signing.</p>
<p><strong>Bank loan limits.</strong> A bank loan for a flat is capped at 75% of its price or valuation, whichever is lower, if you have no other housing loan. If your private home still has a mortgage when you take the new loan, MAS limits drop to 45%. On a $700,000 flat, that is the difference between borrowing $525,000 and $315,000. Most downgraders should therefore sell first, or pay off the private mortgage, before taking the flat's loan. <a href="hdb-loan-vs-bank-loan-singapore.html">HDB loan vs bank loan</a> and <a href="msr-vs-tdsr-singapore.html">MSR vs TDSR</a> explain the tests the bank will apply. Your CPF usage also depends on the flat's remaining lease; see <a href="use-cpf-buy-hdb-flat-singapore.html">using CPF to buy an HDB flat</a>.</p>

<h2 id="if-you-already-applied-or-appealed">If you already applied or appealed</h2>
<ul>
  <li><strong>You hold a valid HFE letter and your plans haven't changed:</strong> you are not affected.</li>
  <li><strong>Your HFE application was still being processed on 28 July:</strong> HDB updates your eligibility automatically. You don't need to do anything.</li>
  <li><strong>You had appealed for a waiver of the 15-month wait:</strong> you don't need to wait for HDB's reply. You can apply for an HFE letter directly, and HDB said it would contact appellants.</li>
  <li><strong>You are 55 or older and were exempted to buy a 4-room or smaller flat:</strong> if you now want a 5-room or larger flat, you can cancel your HFE letter and apply for a new one. HDB said it would tell affected buyers by email.</li>
</ul>

<h2 id="what-private-owners-should-do-now">What private owners should do now</h2>
<ol>
  <li><strong>Decide how you will pay first.</strong> If you need an HDB loan or a grant, nothing has changed for you: sell, wait 30 months, then buy. The shorter route only works with a bank loan, CPF and cash.</li>
  <li><strong>Work out your cash position.</strong> Add up what your private home will realistically sell for, the mortgage payoff, and the flat's downpayment and fees. The <a href="hdb-downpayment-cash-cpf-grants.html">downpayment guide</a> covers the cash-and-CPF split.</li>
  <li><strong>Choose an order.</strong> Selling first gives you the 75% loan limit and no deadline. Buying first gets you the flat you want but starts a six-month clock and may cut your loan to 45%. For most households with a mortgage, selling first, or at least agreeing the sale first, is the safer order.</li>
  <li><strong>Plan the six months.</strong> The clock starts when the flat purchase completes, not when you sign the option. Price the private home to sell within that window.</li>
</ol>

<h2 id="what-hdb-sellers-should-expect">What HDB sellers should expect</h2>
<p>For people selling a flat, the change adds buyers. The biggest effect is on flats that private owners want and that were previously off limits to most of them: 5-room and executive flats, flats in mature towns near family, and newer flats with long leases. Before 28 July, a 60-year-old downsizing from a condo could buy only a 4-room or smaller flat without waiting; now any private owner can buy any size.</p>
<p>These buyers bring more cash and less need for grants or HDB loans. They are more likely to accept a valuation gap and to compare your flat with a small condo. Overpricing still backfires: MOP supply keeps rising, and the index is still slipping. <a href="how-long-to-sell-hdb-singapore-2026.html">How long it takes to sell an HDB flat</a> and <a href="selling-hdb-after-mop-singapore.html">selling an HDB flat after MOP</a> cover the sale itself.</p>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Check what your target flats actually sold for on <a href="/neighbour-prices/">neighbour prices</a> or the <a href="/hdb-prices/">town price pages</a>.</li>
  <li>Get a <a href="/valuation.html">valuation</a> for the home you are selling, whether it is private or HDB.</li>
  <li>Run the bank loan limit that will apply to you through the <a href="/calculator/">affordability calculator</a> before you commit to an order of sale.</li>
</ol>
<p><a href="/#book">Book a 15-minute call with me</a> to work out the sell-first or buy-first order for your household. If you need two agents for two transactions, <a href="property-agent-commission-singapore.html">the commission guide</a> explains what each fee should cover.</p>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 17 Sep 2026 against HDB's release <a href="https://www.mnd.gov.sg/newsroom/press-releases/view/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners-purchasing-non-subsidised-hdb-resale-flats" rel="noopener">Removal of the 15-month wait-out period</a> (28 July 2026, published on MND's site and <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners" rel="noopener">HDB's</a>), the <a href="https://www.mnd.gov.sg/newsroom/press-releases/view/joint-mas-mnd-hdb-press-release-measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand" rel="noopener">joint MAS–MND–HDB release</a> of 29 September 2022 that introduced the wait, IRAS's <a href="https://ask.gov.sg/iras/questions/cln4esmvj003o5v0xawe9oj18" rel="noopener">answer on ABSD for downgraders</a>, and MAS's <a href="https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits" rel="noopener">loan tenure and loan-to-value limits</a>. The 45% figure assumes a loan tenure of up to 30 years that ends by age 65; longer loans have lower limits.</p>
'''
    faqs = [
        ('Has the 15-month wait-out period been removed?', 'Yes. From 28 July 2026, private property owners and former owners can buy a non-subsidised HDB resale flat of any size without waiting 15 months, provided they do not take an HDB housing loan and sell all private residential property within six months of completing the flat purchase.'),
        ('Does the 30-month wait-out still apply?', 'Yes. Private property owners who want a new HDB flat, a resale flat with housing grants, a new executive condominium from a developer, or an HDB housing loan must still wait 30 months after selling their private property.'),
        ('Do I pay ABSD if I buy an HDB resale flat before selling my condo?', 'IRAS’s published answer for a Singapore citizen downgrading from private property is that ABSD remission is given upfront, because HDB requires the private property to be sold within six months. Buyer’s stamp duty still applies. Permanent residents and unusual ownership structures should confirm with IRAS.'),
        ('Can a private property owner take a bank loan for an HDB flat?', 'Yes, and it is the only loan available under the new route. The bank limit is 75% of the price or valuation with no other outstanding housing loan, but falls to 45% if the private property still has a mortgage, so many owners sell or redeem the mortgage first.'),
    ]
    return dict(slug='15-month-wait-out-removed-private-owners-hdb', title='15-Month Wait-Out Removed: What Owners Do Now', cat='Housing policy', mins=7,
                headline='The 15-month wait-out is gone: what private owners and HDB sellers should do now',
                crumb='15-month wait-out removed',
                desc='Since 28 July 2026, private owners can buy a resale flat without grants or an HDB loan with no 15-month wait. Conditions, ABSD, loan limits and next steps.',
                og_desc='From 28 July 2026, private owners can buy a non-subsidised resale flat of any size straight away. The conditions that remain, stamp duty, loan limits and the order to sell in.',
                lede='HDB removed the 15-month wait-out for private property owners on 28 July 2026. The headline is simple, but the conditions, the 30-month rule that remains and the loan limits during the overlap decide whether the faster route works for you.',
                card='Private owners can now buy any resale flat straight away. The conditions that remain, ABSD, bank loan limits and whether to sell or buy first.',
                body=body, faqs=faqs,
                disclaimer='This guide is general education, not legal, tax or financial advice. HDB decides eligibility, IRAS decides stamp duty and banks decide loans on your own circumstances. Check the official sources linked above before you sign an option to purchase.',
                related_top=[('/calculator/', 'Affordability &amp; HDB loan calculator'), ('/stamp-duty-calculator/', 'Stamp duty calculator')])
ARTICLES.append(a2)

# ================================================================ 3. cheapest 4-room / 5-room
def a3():
    def table(ft, label):
        rows = []
        for i, x in enumerate(cheap[ft], 1):
            m70 = money(x['med70']) + f" <small>({x['n70']})</small>" if x['med70'] and x['n70'] >= 10 else '—'
            rows.append(f"    <tr><td>{i}</td><th scope=\"row\">{town_link(x['town'])}</th><td>{money(x['med'])}</td><td>{x['n']}</td><td>{x['lease']:.0f} yrs</td><td>{x['sqm']:.0f} sqm</td><td>{m70}</td></tr>")
        return f'''<div class="table-scroll" style="overflow-x:auto">
<table aria-label="{label}">
  <thead><tr><th scope="col">#</th><th scope="col">Town</th><th scope="col">Median price</th><th scope="col">Deals</th><th scope="col">Median lease left</th><th scope="col">Median size</th><th scope="col">Median, 70+ years left</th></tr></thead>
  <tbody>
{chr(10).join(rows)}
  </tbody>
</table>
</div>'''
    body = f'''
<div class="callout"><strong>The short version</strong><p>Over the six months to August 2026, the cheapest towns for a 4-room resale flat were <strong>Jurong West</strong> (median $535,000), <strong>Woodlands</strong> and <strong>Yishun</strong> (both $550,000). For a 5-room flat they were <strong>Jurong West</strong> ($630,500), <strong>Sembawang</strong> ($644,444) and <strong>Woodlands</strong> ($655,000). Some towns look cheap only because their flats are old. Count only flats with at least 70 years of lease left and the cheapest 4-room towns become Woodlands ($560,444), Jurong West and Choa Chu Kang, both about $571,000.</p></div>

<h2 id="how-this-ranking-works">How this ranking works</h2>
<p>This guide uses every 4-room and 5-room resale deal in HDB's records from March to August 2026: 5,903 4-room and 3,156 5-room flats. Six months gives each town enough deals to be meaningful, and the figures are recent enough to use now. Towns with fewer than ten deals of a flat type are left out. For each town you get the median price, the median lease left and the median floor area. The last column is the median for flats with at least 70 years of lease left, shown where there were at least ten such deals.</p>
<p>That last column matters because the cheapest flat in a town is almost always its oldest. Lease affects how much CPF you can use and how big a loan you can get. HDB and CPF allow full use when the remaining lease covers the youngest buyer to age 95; less than that and the amount shrinks. For a 35-year-old buyer, a flat with 55 years left gets pro-rated CPF use, so a cheaper old flat can still need more cash upfront than a dearer flat with 75 years left, depending on CPF balances and the loan. <a href="use-cpf-buy-hdb-flat-singapore.html">Using CPF to buy an HDB flat</a> sets out the rule.</p>

<h2 id="cheapest-4-room-resale-flats-by-town">Cheapest 4-room resale flats by town</h2>
{table('4 ROOM', 'Median 4-room HDB resale price by town, March to August 2026, cheapest first')}
<p>Three things stand out:</p>
<ul>
  <li><strong>Cheap and long leases:</strong> {town_link('WOODLANDS')}, {town_link('JURONG WEST')}, {town_link('CHOA CHU KANG')} and {town_link('BUKIT PANJANG')} have medians of $535,000 to $570,500 and typically more than 70 years left. They are the best value for buyers who need full CPF use and a full loan.</li>
  <li><strong>Cheap because old:</strong> {town_link('YISHUN')} (61 years left), {town_link('BEDOK')} (60) and {town_link('ANG MO KIO')} (55) rank low on the median alone. Count only flats with 70+ years left and Bedok's median jumps to $860,000 and Ang Mo Kio's to $984,084. Those are newer flats in mature towns, a different product.</li>
  <li><strong>New-flat towns that aren't cheap:</strong> {town_link('SEMBAWANG')} ($605,000), {town_link('SENGKANG')} ($640,000) and {town_link('PUNGGOL')} ($680,000) have almost no old flats. Nearly every deal there has 70+ years left, so their median is what a young-lease flat costs.</li>
</ul>

<h2 id="cheapest-5-room-resale-flats-by-town">Cheapest 5-room resale flats by town</h2>
{table('5 ROOM', 'Median 5-room HDB resale price by town, March to August 2026, cheapest first')}
<p>For 5-room flats the lease effect is smaller. {town_link('JURONG WEST')}, {town_link('SEMBAWANG')}, {town_link('WOODLANDS')} and {town_link('CHOA CHU KANG')} all have medians between $630,500 and $663,500 with typical leases above 70 years. The step up from a 4-room flat in the same town is small: about $95,000 in Jurong West, $105,000 in Woodlands and $113,000 in Choa Chu Kang, for roughly 20 extra square metres. In mature estates it is much bigger. That is why many families upgrade to a 5-room flat in the north and west rather than a 4-room in the centre.</p>

<h2 id="what-the-cheapest-flats-actually-sold-for">What the cheapest flats actually sold for</h2>
<p>The lowest single price in the six months was $385,000 for a 4-room flat in Woodlands. Every 4-room flat that sold below $420,000 had about 50 years of lease or less left, and almost all of those up to $440,000 had under 60 years. If your budget is near those prices, expect a short lease, possible upgrading works and a smaller CPF limit. Check the lease and the block's upgrading history, not just the price. The quarter-by-quarter picture is in <a href="hdb-resale-prices-2q-2026-by-town.html">HDB resale prices 2Q 2026 by town</a>.</p>

<h2 id="stretching-the-budget-grants-and-loans">Stretching the budget: grants and loans</h2>
<p>First-timers buying a resale flat may be able to take a CPF housing grant, the Enhanced CPF Housing Grant and the Proximity Housing Grant. Together they can reduce a Jurong West 4-room flat's effective price by a large share. The <a href="hdb-resale-grants-singapore.html">resale grants guide</a> and <a href="enhanced-cpf-housing-grant-singapore.html">EHG guide</a> set out the current amounts and the 2026 income ceilings from <a href="hdb-income-ceiling-2026-ndr-changes.html">the August changes</a>. For the loan, <a href="hdb-loan-eligibility-singapore.html">HDB loan eligibility</a> and <a href="hdb-loan-vs-bank-loan-singapore.html">HDB loan vs bank loan</a> cover the options, and <a href="hdb-downpayment-cash-cpf-grants.html">the downpayment guide</a> shows how much cash you need upfront. Private property owners, who can now buy without the wait-out, should read <a href="15-month-wait-out-removed-private-owners-hdb.html">the wait-out guide</a> first.</p>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Set a price ceiling with the <a href="/calculator/">affordability calculator</a>, including grants and your CPF balance.</li>
  <li>Shortlist two or three towns from the tables and open each town page for street-level prices.</li>
  <li>Get your <a href="hfe-letter-singapore-guide.html">HFE letter</a> before you view seriously, so you know your grants and loan.</li>
  <li>If you are also selling, get a <a href="/valuation.html">valuation</a> and check the <a href="how-long-to-sell-hdb-singapore-2026.html">selling timeline</a>.</li>
</ol>
<p><a href="/#book">Book a 15-minute call with me</a> to compare specific blocks in the towns you are considering. For newer homes, <a href="new-condo-launches-2026-2027-calendar.html">the new launch calendar</a> lists every condo and EC coming up.</p>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 17 Sep 2026. All prices are my own analysis of HDB's <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view" rel="noopener">resale flat prices dataset</a> on data.gov.sg (Singapore Open Data Licence), downloaded 17 September 2026, for deals registered March to August 2026. Remaining lease is as recorded at the time of sale. CPF and loan lease rules are from HDB and CPF Board; confirm your own limits with CPF's home-purchase tools before committing.</p>
'''
    faqs = [
        ('Which town has the cheapest 4-room HDB resale flats in 2026?', 'Jurong West had the lowest 4-room median over March to August 2026 at $535,000, followed by Woodlands and Yishun at $550,000. Counting only flats with at least 70 years of lease left, Woodlands was cheapest at a median of $560,444.'),
        ('Which town has the cheapest 5-room HDB resale flats?', 'Jurong West, with a 5-room median of $630,500 over March to August 2026, followed by Sembawang at $644,444 and Woodlands at $655,000. All three typically sell 5-room flats with more than 70 years of lease left.'),
        ('Why are some mature-town 4-room flats so cheap?', 'Because they are old. Ang Mo Kio’s median 4-room resale flat had 55 years of lease left and Bedok’s 60, which pulls their medians down. Among flats with 70 or more years left, the medians were $984,084 in Ang Mo Kio and $860,000 in Bedok.'),
        ('What is the cheapest 4-room HDB flat sold recently?', 'The lowest 4-room price between March and August 2026 was $385,000 in Woodlands. Flats at that level are nearly always in the oldest blocks, so check the remaining lease, CPF usage limits and loan eligibility before treating a low price as a bargain.'),
    ]
    return dict(slug='cheapest-4-room-5-room-hdb-resale-flats', title='Cheapest 4-Room and 5-Room HDB Resale Towns', cat='Buying', mins=7,
                headline='The cheapest towns for 4-room and 5-room HDB resale flats in 2026, and when cheap means an old lease',
                crumb='Cheapest 4-room and 5-room resale flats',
                desc='Every town ranked by median 4-room and 5-room resale price, March to August 2026, with remaining lease and prices for flats with 70+ years left.',
                og_desc='Jurong West, Woodlands and Yishun lead for 4-room flats; Jurong West, Sembawang and Woodlands for 5-room. The full town ranking with lease left and like-for-like prices.',
                lede='A cheap median can mean a good-value town or an old lease. This ranks every town by 4-room and 5-room resale price over the six months to August 2026, then ranks them again counting only flats with at least 70 years left.',
                card='Every town ranked by median 4-room and 5-room price over six months, with lease left and like-for-like prices for flats with 70+ years.',
                body=body, faqs=faqs,
                disclaimer='This guide is general market information, not financial advice. Medians describe past transactions; grants, CPF usage and loans are decided by HDB, CPF Board and banks on your own application. Verify your eligibility before you commit.',
                related_top=[('/hdb-prices/', 'HDB resale prices by town'), ('/calculator/', 'Affordability &amp; HDB loan calculator')])
ARTICLES.append(a3)

# ================================================================ 4. rental market 2Q 2026
def a4():
    rows = []
    towns = sorted(t2.keys())
    for town in towns:
        r3, r4, r5 = rent_of('2026-Q2', town, '3-RM'), rent_of('2026-Q2', town, '4-RM'), rent_of('2026-Q2', town, '5-RM')
        r4y = rent_of('2025-Q2', town, '4-RM')
        if not any([r3, r4, r5]):
            continue
        ch = f"{(r4 / r4y - 1) * 100:+.1f}%" if r4 and r4y else '—'
        ch = ch.replace('+0.0%', '0.0%').replace('-', '−')
        f = lambda v: money(v) if v else '—'
        rows.append(f"    <tr><th scope=\"row\">{town_link(town)}</th><td>{f(r3)}</td><td>{f(r4)}</td><td>{ch}</td><td>{f(r5)}</td></tr>")
    rent_table = '\n'.join(rows)
    y4 = sorted([('4 ROOM', t, rent_of('2026-Q2', t, '4-RM'), int(rec['4 ROOM']['med']), rec['4 ROOM']['n'], rent_of('2026-Q2', t, '4-RM') * 12 / rec['4 ROOM']['med'] * 100)
                 for t, rec in t2.items() if rec['4 ROOM']['n'] >= MIN_DEALS_YIELD and rent_of('2026-Q2', t, '4-RM')], key=lambda y: -y[5])
    yrows = '\n'.join(f"    <tr><th scope=\"row\">{town_link(y[1])}</th><td>{money(y[2])}</td><td>{money(y[3])}</td><td>{y[5]:.1f}%</td></tr>" for y in y4)
    body = f'''
<div class="callout"><strong>The short version</strong><p>Rents in the second quarter of 2026 held steady and rose slightly. HDB approved <strong>10,002</strong> applications to rent out flats, up 4.9% on the quarter. The typical 4-room HDB rent was <strong>$3,400</strong> a month, up from $3,300 a year earlier. URA's private rental index rose <strong>0.7%</strong>. But private vacancy rose to 6.4% and suburban condo rents slipped, and more new flats reach their MOP every year. Landlords should expect steady rents, not rises, and price by their block and unit, not headlines.</p></div>

<h2 id="the-official-2q-2026-figures">The official 2Q 2026 figures</h2>
<table aria-label="HDB and URA official rental market figures for 2Q 2026">
  <thead><tr><th scope="col">Measure</th><th scope="col">2Q 2026</th><th scope="col">Change</th></tr></thead>
  <tbody>
    <tr><th scope="row">HDB applications approved to rent out a flat</th><td>10,002</td><td>+4.9% on 1Q (9,535); −0.6% on 2Q 2025</td></tr>
    <tr><th scope="row">HDB flats rented out, end of quarter</th><td>58,855</td><td>+0.3% on 1Q</td></tr>
    <tr><th scope="row">URA private rental index</th><td>—</td><td>+0.7% (1Q: +0.3%)</td></tr>
    <tr><th scope="row">Private non-landed rents: city centre (CCR)</th><td>—</td><td>+1.2%</td></tr>
    <tr><th scope="row">Private non-landed rents: city fringe (RCR)</th><td>—</td><td>0.0%</td></tr>
    <tr><th scope="row">Private non-landed rents: suburbs (OCR)</th><td>—</td><td>−0.3%</td></tr>
    <tr><th scope="row">Vacancy, completed private homes</th><td>6.4%</td><td>up from 6.2%; CCR 8.3%, RCR 6.1%, OCR 5.6%</td></tr>
  </tbody>
</table>
<p>Landed homes drove most of the private rise, at +2.7% against +0.4% for condos and apartments. The table shows URA's quarterly changes. The more telling private figure is vacancy: it rose in the city centre and the suburbs. New supply kept coming, with 1,611 private homes and 872 executive condos completed in the first half of 2026.</p>

<h2 id="hdb-median-rents-by-town">HDB median rents by town</h2>
<p>HDB publishes a median monthly rent for each town and flat type every quarter, based on the rentals it approves. The 4-room change compares 2Q 2026 with 2Q 2025. A dash means HDB did not publish a figure because there were too few rentals.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="HDB median monthly rent by town and flat type, 2Q 2026">
  <thead><tr><th scope="col">Town</th><th scope="col">3-room</th><th scope="col">4-room</th><th scope="col">4-room, year on year</th><th scope="col">5-room</th></tr></thead>
  <tbody>
{rent_table}
  </tbody>
</table>
</div>
<p>Of the 25 towns with a 4-room figure, 17 were higher than a year earlier and 3 were lower, and the typical town was up 2.6%. The top 4-room rents were in the Central Area ($4,600), Queenstown ($4,130) and Bukit Merah ($4,000). The lowest were in Bukit Panjang and Choa Chu Kang ($3,000). Across all approved rentals from April to June, the median was $2,850 for a 3-room flat, $3,400 for a 4-room, $3,500 for a 5-room and $3,800 for an executive flat. In July and August, the 3-room median rose to $2,900 and the 4-room median stayed at $3,400.</p>

<h2 id="gross-rental-yield-by-town">Gross rental yield by town</h2>
<p>Yield is the question most landlords are really asking. Divide a year's median rent by the median resale price for the same town and flat type, and you get a rough gross yield. It is before property tax, maintenance, agent fees and empty months, and it assumes an average flat. The table covers towns with at least 20 4-room resale deals in the quarter.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="Indicative gross rental yield for 4-room HDB flats by town, 2Q 2026">
  <thead><tr><th scope="col">Town (4-room)</th><th scope="col">Median rent</th><th scope="col">Median resale price</th><th scope="col">Gross yield</th></tr></thead>
  <tbody>
{yrows}
  </tbody>
</table>
</div>
<p>The pattern is consistent: rents vary far less between towns than prices do. A 4-room flat in Jurong West rents for $3,500 on a $530,000 median price, about 7.9% gross. In Toa Payoh it rents for $3,800 on a median above $1 million, about 4.5%. The same holds for 3-room flats, which yield most in older central towns like Geylang and Toa Payoh. Treat these as a guide, not a forecast. The flats rented out are often older and cheaper than the flats sold in the same town, which flatters the high-yield towns somewhat.</p>

<h2 id="what-private-landlords-are-seeing">What private landlords are seeing</h2>
<p>Monthly flash estimates from SRX and 99.co, which are not official statistics, show condo rents about 2% to 2.5% higher year on year in each month from April to July 2026. July was busy: a record 9,627 condo rentals, up 38% on June, with rents up 1.6% on the month. Part of that jump is seasonal. The official quarter tells a more cautious story for suburban condos: rents in the outer suburbs slipped 0.3% while vacancy rose to 5.6%. Newly completed projects compete directly with older condos for the same tenants.</p>

<h2 id="what-landlords-can-expect-for-the-rest-of-2026">What landlords can expect for the rest of 2026</h2>
<ul>
  <li><strong>More flats competing for tenants.</strong> 13,500 flats reach their MOP in 2026 and 15,000 in 2027, according to HDB. Many owners of those flats will rent them out. Expect HDB rents to hold rather than rise quickly.</li>
  <li><strong>Private vacancy is the risk.</strong> About 25,900 private homes in URA's pipeline are due by 2028. Suburban vacancy rose from 5.2% to 5.6% in one quarter, so condo landlords there should price to fill the unit, not to hold out.</li>
  <li><strong>Renewals beat new leases.</strong> With rents flat to slightly up, keeping a good tenant at a modest increase usually earns more than a better rent with an empty month or two.</li>
  <li><strong>Selling may beat renting.</strong> Since 28 July, private owners can buy resale flats without the 15-month wait. That brings more cash buyers for larger flats. Some landlords of mature-town 5-room flats may do better selling than renting. <a href="15-month-wait-out-removed-private-owners-hdb.html">The wait-out guide</a> explains the change, and <a href="hdb-resale-prices-2q-2026-by-town.html">the 2Q 2026 resale price guide</a> shows the prices.</li>
</ul>

<h2 id="rules-before-you-rent-out-an-hdb-flat">Rules before you rent out an HDB flat</h2>
<p>You can rent out the whole flat only after its five-year minimum occupation period and with HDB's approval. The minimum lease is six months. Non-Malaysian non-citizen tenants renting a whole flat count toward a non-citizen quota of 8% of flats in the neighbourhood and 11% in the block. If the quota is full, only Singaporean and Malaysian tenants are allowed. Check your block's quota before you advertise. Rental income is taxable, and an HDB flat that isn't owner-occupied pays property tax at non-owner-occupier rates.</p>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Check your town's median on the table above, then look at <a href="/neighbour-prices/">your block's recent resale prices</a> to work out your own yield.</li>
  <li>Check HDB's <a href="https://services2.hdb.gov.sg/webapp/BR12AWNCQuota/" rel="noopener">non-citizen quota for your block</a> before choosing tenants.</li>
  <li>If you are weighing renting against selling, get a <a href="/valuation.html">valuation</a> and read <a href="selling-hdb-after-mop-singapore.html">selling after MOP</a>.</li>
</ol>
<p><a href="/rent-out/">List your flat for rent with me</a> or <a href="/#book">book a 15-minute call</a> to compare renting with selling on your own flat. <a href="property-agent-commission-singapore.html">The commission guide</a> covers what a rental agent's fee should include.</p>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 17 Sep 2026. Official figures are from HDB's <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/2nd-quarter-2026-public-housing-data-and-upcoming-flat-supply" rel="noopener">2nd Quarter 2026 public housing data</a> (24 July 2026) and URA's <a href="https://www.ura.gov.sg/news/media/pr26-57/" rel="noopener">2nd Quarter 2026 real estate statistics</a> (24 July 2026). Town medians are from HDB's <a href="https://data.gov.sg/datasets/d_23000a00c52996c55106084ed0339566/view" rel="noopener">median rent by town and flat type</a>. Islandwide medians are my own analysis of HDB's <a href="https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view" rel="noopener">renting out of flats</a> records, which count 9,424 approvals in the quarter against HDB's headline 10,002. Yields combine those rents with HDB's <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view" rel="noopener">resale prices</a>; all data.gov.sg data is under the Singapore Open Data Licence and was downloaded 17 September 2026. Private flash estimates are from SRX and 99.co's monthly reports for <a href="https://www.99.co/singapore/insider/condo-hdb-rental-market-rebound-june-2026/" rel="noopener">June</a> and <a href="https://www.99.co/singapore/insider/condo-rental-prices-volumes-record-high-july-2026/" rel="noopener">July 2026</a>. MOP supply is from HDB's 28 July 2026 release, and rental rules are from <a href="https://www.hdb.gov.sg/managing-my-home/home-ownership/renting-out-a-flat-or-bedrooms/renting-out-a-flat/eligibility" rel="noopener">HDB's eligibility page</a>.</p>
'''
    faqs = [
        ('Are HDB rents going up in 2026?', 'Slowly. The median 4-room HDB rent was $3,400 a month in 2Q 2026, up from $3,300 a year earlier, and 17 of 25 towns with a 4-room figure were higher than a year before. HDB approved 10,002 applications to rent out flats in the quarter, 4.9% more than in 1Q.'),
        ('What is the average rent for a 4-room HDB flat?', 'The median across all 4-room rentals HDB approved in April to June 2026 was $3,400 a month. Town medians ranged from $3,000 in Bukit Panjang and Choa Chu Kang to $4,600 in the Central Area.'),
        ('Which HDB towns have the highest rental yield?', 'Dividing 2Q 2026 median rent by median resale price, 4-room flats yielded most in Jurong West (about 7.9% gross), Jurong East (7.3%) and Bedok (7.0%), and least in Toa Payoh (4.5%) and the Central Area (4.6%). These are gross figures before costs and vacancy.'),
        ('Did private condo rents rise in 2Q 2026?', 'URA’s private rental index rose 0.7% in 2Q 2026. Non-landed rents rose 1.2% in the city centre, were flat in the city fringe and fell 0.3% in the suburbs, while vacancy of completed private homes rose to 6.4%.'),
    ]
    return dict(slug='singapore-rental-market-2q-2026', title='Singapore Rental Market 2Q 2026: Landlord Guide', cat='Renting out', mins=8,
                headline='Singapore’s rental market in 2Q 2026: HDB rents by town, yields, and what landlords can expect',
                crumb='Rental market 2Q 2026',
                desc='HDB and condo rents in 2Q 2026: official figures, median HDB rents for every town, gross rental yields and what landlords should expect for the rest of 2026.',
                og_desc='HDB rental approvals rose 4.9% and the 4-room median reached $3,400 while private vacancy climbed to 6.4%. Town-by-town rents, gross yields and the outlook for landlords.',
                lede='Rents held up in the second quarter, but supply is building on both sides of the market. Here are the official HDB and URA figures, median HDB rents and gross yields for every town, and what that means for pricing a lease this year.',
                card='Official HDB and URA figures, median HDB rents and gross yields for every town, and what landlords should expect for the rest of 2026.',
                body=body, faqs=faqs,
                disclaimer='This guide is general market information, not tax, legal or investment advice. Rental approval, quotas and tax are decided by HDB and IRAS on your own case. Check the official pages linked above before signing a tenancy.',
                related_top=[('/rent-out/', 'Rent out your flat with Joe'), ('/hdb-prices/', 'HDB resale prices by town')])
ARTICLES.append(a4)

# ================================================================ 5. new launch calendar
def a5():
    P = {p['slug']: p for p in projects}
    def link(slug):
        p = P[slug]
        name = p['name'].replace(' - Singapore', '')
        return f'<a href="/new-launches/{slug}.html">{esc(name)}</a>'
    def facts(slug):
        p = P[slug]
        tenure = 'Freehold' if p['tenure'] == 'freehold' else '99-year'
        kind = 'EC' if p['propertyType'] == 'executive-condominium' else 'Condo'
        return f"<td>{p['district']} · {p['region']}</td><td>{kind}</td><td>{tenure}</td><td>{p['unitCount']:,}</td>"
    def row(when, slug, note=''):
        p = P[slug]
        extra = f"<br><small>{note}</small>" if note else ''
        return f"    <tr><td>{when}</td><th scope=\"row\">{link(slug)}{extra}</th><td>{esc(p['location'])}</td>{facts(slug)}<td>{esc(p['developer'])}</td></tr>"
    head = '<thead><tr><th scope="col">When</th><th scope="col">Project</th><th scope="col">Location</th><th scope="col">District</th><th scope="col">Type</th><th scope="col">Tenure</th><th scope="col">Homes</th><th scope="col">Developer</th></tr></thead>'
    upcoming = [
        ('Booking 26 Sep 2026', 'amberwood-at-holland', 'Preview opened 11 Sep'),
        ('Oct 2026', 'lucerne-grand', ''),
        ('4Q 2026', 'thomson-reserve', ''),
        ('4Q 2026', 'the-serra-residences', ''),
        ('4Q 2026', 'dorset-road', ''),
        ('4Q 2026', 'chencharu-close', ''),
        ('4Q 2026', 'upper-thomson-road', ''),
        ('4Q 2026', 'keppel-bay-plot-6', ''),
        ('1Q 2027', 'chuan-grove', ''),
        ('1Q 2027', 'senja-close-ec', 'Formerly the Senja Close EC site'),
        ('1Q 2027', 'woodlands-drive-17-ec', 'Formerly the Woodlands Drive 17 EC site'),
        ('1Q 2027', 'sembawang-road-ec', ''),
        ('4Q 2027', 'hougang-central-residences', ''),
    ]
    launched = [
        ('Booking 17 Jan 2026', 'coastal-cabana', ''),
        ('Booking 31 Jan 2026', 'newport-residences', ''),
        ('Booking 31 Jan 2026', 'narra-residences', ''),
        ('Booking 7 Mar 2026', 'river-modern', ''),
        ('Booking 21 Mar 2026', 'rivelle-tampines', 'Sold out'),
        ('Booking 28 Mar 2026', 'pinery-residences', ''),
        ('Booking 25 Apr 2026', 'tengah-garden-residences', 'Sold out'),
        ('Booking 25 Apr 2026', 'vela-bay', ''),
        ('Booking 16 May 2026', 'hudson-place-residences', ''),
        ('Booking 18 Jul 2026', 'lentor-gardens-residences', ''),
        ('Booking 25 Jul 2026', 'dunearn-house', ''),
        ('Launched Oct 2025', 'w-residences-marina-view', ''),
        ('On sale', 'faber-residence', ''),
        ('On sale', 'zyon-grand', ''),
    ]
    up_units = sum(P[s]['unitCount'] for _, s, _ in upcoming)
    q4_units = sum(P[s]['unitCount'] for w, s, _ in upcoming if w in ('Oct 2026', '4Q 2026') or w.startswith('Booking 26 Sep'))
    q1_units = sum(P[s]['unitCount'] for w, s, _ in upcoming if w == '1Q 2027')
    ec_units = sum(P[s]['unitCount'] for w, s, _ in upcoming if P[s]['propertyType'] == 'executive-condominium')
    up_rows = '\n'.join(row(*u) for u in upcoming)
    la_rows = '\n'.join(row(*u) for u in launched)
    body = f'''
<div class="callout"><strong>The short version</strong><p>{len(upcoming)} condo and EC projects with about <strong>{up_units:,} homes</strong> are expected to launch between September 2026 and the end of 2027. Amberwood at Holland's booking day was set for 26 September 2026, and Lucerne Grand at Lakeside is expected in October. Six more projects are expected in the fourth quarter of 2026, from Thomson Reserve's 1,268 homes to Keppel Bay Plot 6's 84. The first quarter of 2027 brings Chuan Grove and three ECs, and Hougang Central Residences follows in late 2027. Launch windows are the developers' own guidance, and they move. Each project page updates when a date is confirmed.</p></div>

<h2 id="upcoming-launches-september-2026-to-2027">Upcoming launches: September 2026 to 2027</h2>
<p>Ordered by expected launch. "Homes" is the developer's or planning figure; ECs are marked so eligible buyers can find them quickly.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="Upcoming new condo and EC launches in Singapore, September 2026 to 2027">
  {head}
  <tbody>
{up_rows}
  </tbody>
</table>
</div>

<h2 id="the-fourth-quarter-of-2026">The fourth quarter of 2026</h2>
<p>From late September to December, about {q4_units:,} homes are expected across eight projects, spread across every region:</p>
<ul>
  <li><strong>City centre (CCR):</strong> {link('amberwood-at-holland')} in Holland and {link('the-serra-residences')}, a 133-home freehold project on Bassein Road. These are small projects for owner-occupiers and investors who want a central address.</li>
  <li><strong>City fringe (RCR):</strong> {link('thomson-reserve')} at Bright Hill, the largest launch of the year, {link('dorset-road')} in District 8, and {link('keppel-bay-plot-6')} on Keppel Island.</li>
  <li><strong>Suburbs (OCR):</strong> {link('lucerne-grand')} near Lakeside MRT, {link('chencharu-close')} in District 27 and {link('upper-thomson-road')}. These are the main options for HDB upgraders buying new outside the city.</li>
</ul>

<h2 id="2027-chuan-grove-three-ecs-and-hougang-central">2027: Chuan Grove, three ECs and Hougang Central</h2>
<p>The first quarter of 2027 is expected to bring about {q1_units:,} homes. {link('chuan-grove')} has 1,055 of them, at Chuan Grove off Lorong Chuan. The other three are ECs with {ec_units:,} homes between them: {link('senja-close-ec')} in Bukit Panjang, {link('woodlands-drive-17-ec')} in Woodlands and {link('sembawang-road-ec')}. All three keep the $16,000 household income ceiling, because their sites were tendered before the 24 August 2026 cut-off. <a href="ec-vs-private-condo-2027.html">EC vs private condo in 2027</a> explains the ceiling and compares prices.</p>
<p>{link('hougang-central-residences')}, 830 homes above Hougang MRT, is guided for late 2027. <a href="singapore-mega-launches-2027.html">Singapore's 2027 mega launches</a> covers the wider 2027 pipeline and how upgraders should time a sale around it.</p>

<h2 id="already-launched-selling-and-sold-out">Already launched: selling and sold out</h2>
<p>These projects have launched, most of them in 2026. Two are sold out. Project pages show live units left and prices where the public listing data adds up.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="New condo and EC projects already launched, selling or sold out">
  {head}
  <tbody>
{la_rows}
  </tbody>
</table>
</div>
<p>For HDB upgraders, launched projects have one advantage: you can see which unit types and stacks are left and what they cost now, rather than guessing a launch price. The <a href="/new-launches/">new launches page</a> lists every project and filters by region.</p>

<h2 id="how-to-time-a-purchase-around-the-calendar">How to time a purchase around the calendar</h2>
<ul>
  <li><strong>Sort out your HDB sale first.</strong> Most buyers of these projects are selling an HDB flat. A married couple who are Singapore citizens can buy first, pay ABSD and get it refunded if they sell the flat within six months of the new condo's TOP or CSC, whichever is earlier. The deadline is strict. <a href="how-long-to-sell-hdb-singapore-2026.html">How long it takes to sell</a> and <a href="selling-hdb-after-mop-singapore.html">selling after MOP</a> set out the sale timeline.</li>
  <li><strong>Get your loan limit before the preview.</strong> Booking a unit takes a 5% booking fee on the day, so have a bank's in-principle loan approval ready. Run the <a href="/calculator/">affordability calculator</a> and read <a href="msr-vs-tdsr-singapore.html">MSR vs TDSR</a> before you visit a show flat. <a href="hdb-loan-vs-bank-loan-singapore.html">HDB loan vs bank loan</a> explains why new condos need a bank loan.</li>
  <li><strong>Compare with resale.</strong> Several suburban launches sit near older condos and large HDB estates. Check the <a href="/condo-prices/">condo prices by district</a> and <a href="hdb-resale-prices-2q-2026-by-town.html">HDB resale prices by town</a> before accepting a launch price per square foot.</li>
  <li><strong>Price the stamp duty.</strong> The <a href="/stamp-duty-calculator/">stamp duty calculator</a> works out buyer's stamp duty and any ABSD, which depends on what you already own when you buy.</li>
</ul>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Shortlist two or three projects from the tables and open their pages for maps, photos and unit mix.</li>
  <li>Get a <a href="/valuation.html">valuation</a> for the flat you are selling, so your budget uses a real number.</li>
  <li>Ask for a project's price list and floor plans on its page or by WhatsApp before the preview weekend.</li>
</ol>
<p><a href="/#book">Book a 15-minute call with me</a> to match launches to your budget and sale timeline. <a href="property-agent-commission-singapore.html">The commission guide</a> explains who pays the agent on a new launch.</p>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 17 Sep 2026 against this site's project tracker, which records a source for every fact. Those sources include developer announcements and results filings (City Developments, UOL, CapitaLand, GuocoLand, Sing Holdings, Keppel, Far East Organization, Sim Lian), HDB's list of upcoming EC sites, URA's list of uncompleted private projects and published launch coverage. Expected windows are guidance, not commitments; a project's page shows a preview or booking date only once it is confirmed. The <a href="https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits" rel="noopener">loan limits</a> are MAS's and the ABSD refund rule is <a href="https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)" rel="noopener">IRAS's</a>.</p>
'''
    faqs = [
        ('What new condo launches are coming in late 2026?', f'Amberwood at Holland\u2019s booking day was set for 26 September 2026, and Lucerne Grand is expected in October 2026. Thomson Reserve, The Serra Residences, Dorset Road, Chencharu Close, Upper Thomson Road and Keppel Bay Plot 6 are expected in the fourth quarter of 2026, about {q4_units:,} homes in all.'),
        ('Which ECs are launching in 2027?', 'Three ECs are expected in the first quarter of 2027: Solano Grand (the Senja Close site) in Bukit Panjang, Wynwood Grand (Woodlands Drive 17) and Sembawang Road EC. All three keep the $16,000 income ceiling because their land tenders closed before 24 August 2026.'),
        ('What is the biggest new launch in 2026?', 'Thomson Reserve at Bright Hill Drive, with 1,268 homes, is the largest project expected in 2026. In 2027, Chuan Grove (1,055 homes) and Hougang Central Residences (830 homes) are the largest.'),
        ('Are new launch dates confirmed?', 'Only Amberwood at Holland has confirmed preview and booking dates. The other windows are developers’ guidance from announcements and results filings and can move. Each project page on this site updates when a preview or booking date is confirmed.'),
    ]
    return dict(slug='new-condo-launches-2026-2027-calendar', title='New Condo Launches 2026–2027: Launch Calendar', cat='New launches', mins=7,
                headline='New condo and EC launches in Singapore, September 2026 to 2027: the launch calendar',
                crumb='New launch calendar 2026–2027',
                desc=f'Every upcoming Singapore condo and EC launch to 2027, about {up_units:,} homes: expected dates, location, tenure, size and developer, plus what is still selling.',
                og_desc=f'{len(upcoming)} projects and about {up_units:,} homes from Amberwood at Holland (booking 26 September 2026) to Hougang Central Residences in late 2027, plus every project already launched.',
                lede='A single calendar of every condo and EC launch expected between now and the end of 2027, with the facts that matter for a shortlist, and every project from 2026 that is still selling. Each name links to a project page with photos, a location map and live availability.',
                card=f'Every condo and EC launch expected to 2027, about {up_units:,} homes, with dates, districts, tenure and developers, plus what is still selling.',
                body=body, faqs=faqs,
                disclaimer='This calendar is general information, not investment advice. Launch timing, prices and unit mix are set by developers and change; confirm dates and terms with the developer’s sales team before committing to a purchase.',
                related_top=[('/new-launches/', 'All new launches'), ('/calculator/', 'Affordability &amp; HDB loan calculator')])
ARTICLES.append(a5)

# ---------------------------------------------------------------- assemble
built = [f() for f in ARTICLES]

def existing_titles():
    out = []
    for f in sorted(INS.glob('*.html')):
        if f.name == 'index.html':
            continue
        if f.stem in {b['slug'] for b in built}:
            continue
        t = re.search(r'<title>([^<]+)</title>', f.read_text()).group(1)
        out.append((f.stem, html.unescape(t).replace(' | PropertySG', '')))
    return out

EXISTING = existing_titles()

def page(a):
    url = f"https://joetay.com/insights/{a['slug']}.html"
    faq_ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': ans}} for q, ans in a['faqs']]}
    art_ld = {'@context': 'https://schema.org', '@type': 'Article', 'headline': a['headline'], 'description': a['desc'],
              'image': 'https://joetay.com/joetay-social-preview.jpg', 'datePublished': PUB, 'dateModified': PUB, 'inLanguage': 'en-SG',
              'author': {'@type': 'Person', 'name': 'Joe Tay', 'url': 'https://joetay.com/about-joe/', 'jobTitle': 'District Director, ERA Realty Network', 'identifier': 'CEA R009618D'},
              'publisher': {'@type': 'RealEstateAgent', 'name': 'PropertySG', 'url': 'https://joetay.com/', 'alternateName': 'Joe Tay'},
              'mainEntityOfPage': url}
    bc_ld = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://joetay.com/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'Insights', 'item': 'https://joetay.com/insights/'},
        {'@type': 'ListItem', 'position': 3, 'name': a['headline'], 'item': url}]}
    j = lambda o: json.dumps(o, indent=2, ensure_ascii=False)
    siblings = [(b['slug'], b['title']) for b in built if b['slug'] != a['slug']] + EXISTING
    related = '\n'.join([f'    <li><a href="{h}">{t}</a></li>' for h, t in a['related_top']] +
                        [f'    <li><a href="{s}.html">{esc(t)}</a></li>' for s, t in siblings])
    faq_html = '\n'.join(f'<h3>{esc(q)}</h3>\n<p>{esc(ans)}</p>' for q, ans in a['faqs'])
    return f'''<!DOCTYPE html>
<html lang="en-SG">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{esc(a['title'])} | PropertySG</title>
<meta name="description" content="{esc(a['desc'])}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0b1e3f">
<link rel="manifest" href="/site.webmanifest">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="en-SG" href="{url}">
<link rel="alternate" hreflang="x-default" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="PropertySG">
<meta property="og:title" content="{esc(a['headline'])}">
<meta property="og:description" content="{esc(a['og_desc'])}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="en_SG">
<meta property="og:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(a['headline'])}">
<meta name="twitter:description" content="{esc(a['og_desc'])}">
<meta name="twitter:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta property="article:author" content="Joe Tay">
<meta property="article:published_time" content="{PUB}">
<meta property="article:modified_time" content="{PUB}">
<meta property="article:section" content="{esc(a['cat'])}">
<script type="application/ld+json">
{j(art_ld)}
</script>
<script type="application/ld+json">
{j(bc_ld)}
</script>
<script type="application/ld+json">
{j(faq_ld)}
</script>
{HEAD_ASSETS}</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
{TOPBAR}
<main id="main" tabindex="-1" class="blog-main"><article class="article">
<div class="article-breadcrumb" role="navigation" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><a href="/insights/">Insights</a><span class="sep">›</span><span aria-current="page">{esc(a['crumb'])}</span></div>
<header class="article-header"><div class="article-meta-top"><span class="cat">{esc(a['cat'])}</span><span class="dot" aria-hidden="true">·</span><span>{a['mins']} min read</span><span class="dot" aria-hidden="true">·</span><time datetime="{PUB}">{PUB_H}</time></div>
<h1 id="article-title">{esc(a['headline'])}</h1><p class="article-lede">{esc(a['lede'])}</p>
{BYLINE}</header>
<section class="article-body" aria-labelledby="article-title">
{a['body'].strip()}
<aside class="callout" aria-labelledby="related-guides-title"><strong id="related-guides-title">Related guides and tools</strong><ul style="margin-bottom:0">
{related}
  </ul></aside>
<h2 id="frequently-asked-questions">Frequently asked questions</h2>
{faq_html}
{DISCLAIMER_TPL.format(esc(a['disclaimer']))}
</section></article></main>
{TAIL}'''

def wrap_tables(doc):
    doc = re.sub(r'<div class="table-scroll" style="overflow-x:auto">\n(<table.*?</table>)\n</div>', r'\1', doc, flags=re.S)
    # Focusable, labelled region so keyboard users can scroll a table that is wider than a phone screen.
    def wrap(m):
        label = re.search(r'aria-label="([^"]*)"', m.group(1))
        name = f' aria-label="{label.group(1)}"' if label else ''
        return f'<div class="table-scroll" role="region"{name} tabindex="0" style="overflow-x:auto">\n{m.group(1)}\n</div>'
    return re.sub(r'(<table.*?</table>)', wrap, doc, flags=re.S)

for a in built:
    (INS / f"{a['slug']}.html").write_text(wrap_tables(page(a)))
    words = len(re.sub(r'<[^>]+>', ' ', a['body']).split())
    print(f"{a['slug']:48} title={len(a['title']) + 13:>2} desc={len(a['desc']):>3} words~{words}")
