#!/usr/bin/env python3
#!/usr/bin/env python3
"""Write the five quarterly market articles in insights/ (JOE-389).

    python3 scripts/market-articles/fetch_data.py
    python3 scripts/market-articles/analyse.py
    python3 scripts/market-articles/build_articles.py [slug ...]
    npm run apply:article-toc && npm run check

Pass one or more slugs to rebuild only those articles; the others keep their
committed files (their prose quotes the quarter they were written for).

Tables are generated from the analysed data in $MARKET_DATA_DIR; the prose quotes
figures from summary.json and official releases by hand, so a refresh means
updating config.py, re-running the three steps and rewriting the prose numbers
that changed. The page shell (head assets, top bar, footer, consent banner) is
copied from insights/ec-vs-private-condo-2027.html so it stays in step with the
site's apply-* scripts. Publish dates are PUB below, unless an article sets its
own 'published'.
"""
import json, re, html, sys
from datetime import date
from pathlib import Path

from config import DATA_DIR, MIN_DEALS_YIELD, RENT_QUARTER, RENT_YEAR_AGO, ROOT

WT = ROOT
INS = WT / 'insights'
PUB = '2026-09-17'
PUB_H = 'Sep 17, 2026'

def human_date(iso):
    d = date.fromisoformat(iso)
    return f"{d:%b} {d.day}, {d.year}"

tpl = (INS / 'ec-vs-private-condo-2027.html').read_text()
HEAD_ASSETS = tpl[tpl.index('<link rel="preload" as="font"'):tpl.index('</head>')]
TOPBAR = re.search(r'<header class="jt-sh" data-jt-site-header>.*?</style>\s*</header>', tpl, re.S).group(0)
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

# ================================================================ 1. HDB resale prices 3Q 2026 by town
# The 2Q 2026 edition (hdb-resale-prices-2q-2026-by-town.html) is kept as a static page:
# its prose quotes 2Q figures, so it is no longer rebuilt from the current quarter's data.
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
<div class="callout"><strong>The short version</strong><p>HDB's Resale Price Index slipped <strong>0.1%</strong> in the third quarter of 2026, its third small fall in a row, while resale sales jumped <strong>19.5%</strong> to 7,645 flats. More flats changed hands at almost the same prices: a 4-room flat's median price was <strong>$628,000</strong>, level with a year earlier. A record number of flats sold for $1 million or more, and the gap between young and old leases kept widening.</p></div>

<h2 id="what-hdb-reported-for-3q-2026">What HDB reported for 3Q 2026</h2>
<p>HDB published its final third-quarter figures on 23 October 2026. Its flash estimate on 1 October had pointed to a 0.2% fall; the final figure was a little better.</p>
<table aria-label="HDB official resale market figures for 3Q 2026">
  <thead><tr><th scope="col">Measure</th><th scope="col">3Q 2026</th><th scope="col">Change</th></tr></thead>
  <tbody>
    <tr><th scope="row">Resale Price Index</th><td>202.5</td><td>−0.1% on 2Q 2026 (202.8)</td></tr>
    <tr><th scope="row">Resale transactions</th><td>7,645</td><td>+19.5% on 2Q (6,396); +5.9% on 3Q 2025 (7,221)</td></tr>
    <tr><th scope="row">Flash estimate, 1 October</th><td>202.4</td><td>−0.2%</td></tr>
    <tr><th scope="row">Index in 1Q and 2Q 2026</th><td>203.4, 202.8</td><td>−0.1% and −0.3%</td></tr>
  </tbody>
</table>
<p>The jump in sales came in the quarter HDB removed the 15-month wait-out for private property owners, on 28 July. HDB says it has not seen a significant increase in the prices or number of resale flats bought by private owners since then, so the extra sales came mostly from ordinary buyers and sellers. URA's private home price index rose 1.4% in the same quarter, so the gap between HDB and private prices widened again.</p>
<p>This is the 3Q 2026 edition. <a href="hdb-resale-prices-2q-2026-by-town.html">The 2Q 2026 edition</a> has the April to June figures.</p>

<div class="article-cta">
  <h3>What is your own flat worth?</h3>
  <p>A town median mixes old and young leases, high and low floors. A free valuation accounts for your remaining lease, floor and condition, not just the town median.</p>
  <div class="article-cta-actions">
    <a href="/valuation.html?propType=HDB" data-cta-location="insights_resale_prices_3q_mid" data-lead-type="valuation">Get a free valuation →</a>
    <a class="article-cta-secondary" href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20read%20your%20HDB%20resale%20prices%20by%20town%20guide%20and%20would%20like%20to%20ask%20about%20my%20flat%27s%20value." target="_blank" rel="noopener" data-cta-location="insights_resale_prices_3q_mid" data-lead-type="valuation">WhatsApp Joe</a>
  </div>
</div>

<h2 id="median-prices-by-flat-type">Median prices by flat type</h2>
<p>HDB's index is adjusted for flat age, size and location, so it doesn't give a dollar figure for any flat. For dollar figures I used HDB's own transaction records on data.gov.sg: 7,406 resale deals registered from July to September 2026. That total is slightly below HDB's 7,645 because the two sources count deals differently.</p>
<table aria-label="Median HDB resale price by flat type, 3Q 2026">
  <thead><tr><th scope="col">Flat type</th><th scope="col">Deals</th><th scope="col">Median 3Q 2026</th><th scope="col">2Q 2026</th><th scope="col">3Q 2025</th><th scope="col">Year on year</th></tr></thead>
  <tbody>
    <tr><th scope="row">2-room</th><td>207</td><td>$370,000</td><td>$378,000</td><td>$375,000</td><td>−1.3%</td></tr>
    <tr><th scope="row">3-room</th><td>1,579</td><td>$435,000</td><td>$440,000</td><td>$450,000</td><td>−3.3%</td></tr>
    <tr><th scope="row">4-room</th><td>3,266</td><td>$628,000</td><td>$630,000</td><td>$630,000</td><td>−0.3%</td></tr>
    <tr><th scope="row">5-room</th><td>1,818</td><td>$741,888</td><td>$738,000</td><td>$740,000</td><td>+0.3%</td></tr>
    <tr><th scope="row">Executive</th><td>531</td><td>$920,000</td><td>$920,000</td><td>$900,888</td><td>+2.1%</td></tr>
  </tbody>
</table>
<p>Larger flats held their value and 3-room flats slipped, the same split as last quarter but a little wider. The median price per square foot was $582 for a 3-room flat, $609 for a 4-room and $578 for a 5-room.</p>

<h2 id="3q-2026-resale-prices-by-town">3Q 2026 resale prices by town</h2>
<p>Each figure is the median price, with the number of deals in brackets. A dash means fewer than ten deals, too few for a median to mean much. Each town name links to its price page, which covers the last 12 months by flat type and street.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="Median HDB resale price by town and flat type, July to September 2026">
  <thead><tr><th scope="col">Town</th><th scope="col">3-room</th><th scope="col">4-room</th><th scope="col">5-room</th><th scope="col">$1m+ deals</th><th scope="col">All deals</th></tr></thead>
  <tbody>
{town_table}
  </tbody>
</table>
</div>
<p>The cheapest towns for a 4-room flat were {town_link('JURONG WEST')} ($538,000), {town_link('JURONG EAST')} ($540,944) and {town_link('WOODLANDS')} ($545,000). The most expensive were {town_link('QUEENSTOWN')} ($1,065,000) and {town_link('TOA PAYOH')} ($1,023,500), both above $1 million, then {town_link('BUKIT MERAH')} ($934,000). {town_link('TAMPINES')} had the most resale deals of any town, 651. <a href="cheapest-4-room-5-room-hdb-resale-flats.html">The cheapest 4-room and 5-room towns guide</a> ranks every town over six months and separates cheap flats from short leases.</p>

<h2 id="why-some-town-medians-moved">Why some town medians moved</h2>
<p>The Central Area's 4-room median fell 38% on a year earlier, to $830,000. That is not a crash. In 3Q 2025 the typical 4-room flat sold there had 84 years of lease left; in 3Q 2026 it had 58. With only 23 deals in each quarter, a few newer flats selling or not selling moves the median a long way.</p>
<p>Choa Chu Kang's 3-room median fell 13% for the same reason: the typical flat sold had 62 years left, against 90 a year earlier. Toa Payoh shows the reverse. Its 4-room median rose 3.8% to $1,023,500 because more newer flats sold: those with 90 years or more left rose from 40% of deals to 61%. Queenstown's 7.8% rise in 4-room prices came with little change in the leases sold (a median of 89 years left against 86), so it is closer to a real increase, though it rests on 95 deals.</p>
<p>To see the real direction, compare flats with similar leases across the island. For 4-room flats:</p>
<table aria-label="4-room median resale price by remaining lease, 3Q 2026 against 3Q 2025">
  <thead><tr><th scope="col">Remaining lease</th><th scope="col">Deals, 3Q 2026</th><th scope="col">Median 3Q 2026</th><th scope="col">Median 3Q 2025</th><th scope="col">Change</th></tr></thead>
  <tbody>
    <tr><th scope="row">Under 60 years</th><td>682</td><td>$545,000</td><td>$560,000</td><td>−2.7%</td></tr>
    <tr><th scope="row">60 to 80 years</th><td>1,178</td><td>$580,000</td><td>$582,828</td><td>−0.5%</td></tr>
    <tr><th scope="row">80 to 95 years</th><td>1,406</td><td>$708,888</td><td>$702,000</td><td>+1.0%</td></tr>
  </tbody>
</table>
<p>Newer flats gained a little, older flats slipped, and the shortest leases slipped most, by more than last quarter. That split matters more to a seller than any town median. If your flat has less than 60 years left, price it against recent sales in your own block and street, not the town median. <a href="hdb-valuation-explained.html">How HDB valuation works</a> explains why.</p>

<h2 id="million-dollar-flats">Million-dollar flats</h2>
<p>596 flats sold for $1 million or more between July and September, a record, up from 490 in the second quarter and 480 a year earlier. The count comes from the transaction records. Most were 4-room (241) and 5-room (202) flats, plus 146 executive flats, and 23 of the 26 towns had at least one. Toa Payoh (93), Queenstown (86) and Bukit Merah (56) led. The highest price was $1,720,000 for a 5-room flat on the 19th to 21st floors of Block 1C Cantonment Road, sold in September. A record number of million-dollar sales while the index slipped is consistent: more newer, central flats reached their MOP and sold, and they sold high.</p>

<h2 id="october-early-read">October: an early read</h2>
<p>Transaction records published by 31 October show 2,176 deals registered in October. The 4-room median was $628,844 and the 5-room median $760,000, and 238 flats sold for $1 million or more. That is one month, and not yet a complete one, so treat it as a direction, not a result. HDB's flash estimate for the fourth quarter is due at the start of January.</p>

<h2 id="what-it-means-if-you-are-selling-or-buying">What it means if you are selling or buying</h2>
<ul>
  <li><strong>More sales, steady prices.</strong> Sales rose by a fifth while prices barely moved, so buyers and sellers both turned up in numbers. HDB says 13,500 flats reach their MOP in 2026, then 15,000 in 2027 and 19,500 in 2028, against 8,000 in 2025. Buyers keep getting more choice. Sellers of ordinary flats in the same estates face more competition.</li>
  <li><strong>Private owners are back, quietly.</strong> Since 28 July, private property owners can buy a resale flat of any size without waiting 15 months, without grants or an HDB loan, and must sell their private property within six months. HDB has not seen them push prices up so far. <a href="15-month-wait-out-removed-private-owners-hdb.html">The wait-out guide</a> covers who qualifies.</li>
  <li><strong>New BTO flats in November.</strong> HDB's November 2026 exercise offers about 7,960 flats in Bedok, Geylang, Sembawang, Tengah, Toa Payoh and Yishun, plus Community Care Apartments in Toa Payoh. First-timers who can wait for a new flat may hold off on buying resale in those towns.</li>
  <li><strong>Lease matters more than town.</strong> The lease table above shows the gap between young and old leases widening for a second quarter. Older-lease sellers should price realistically from the start instead of cutting later. <a href="how-long-to-sell-hdb-singapore-2026.html">How long it takes to sell</a> sets out what an overpriced listing costs in time.</li>
</ul>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Look up your own block's recent sales on <a href="/neighbour-prices/">neighbour prices</a> and your town page on <a href="/hdb-prices/">HDB prices by town</a>.</li>
  <li>Get a <a href="/valuation.html">free valuation</a> that accounts for your remaining lease, floor and condition, not just the town median.</li>
  <li>If you are selling to upgrade, check the numbers on the next home with the <a href="/calculator/">affordability calculator</a> and read <a href="selling-hdb-after-mop-singapore.html">selling after MOP</a>.</li>
</ol>
<p><a href="/#book">Book a call with me</a> to go through your block's numbers. If you are comparing agents, <a href="property-agent-commission-singapore.html">the commission guide</a> sets out what the fee should cover.</p>

<div class="article-cta">
  <h3>Buying a resale flat in one of these towns?</h3>
  <p>Once you have a flat in mind, check how much cash you need on top of your loan and CPF, including any cash over valuation.</p>
  <div class="article-cta-actions">
    <a href="/calculator/#resaleCashPanel" data-calculator="resale_cash_readiness" data-entry-point="resale_prices_guide" data-cta-location="insights_resale_prices_3q_end" data-lead-type="hdb_buyer">Check resale cash needed →</a>
    <a class="article-cta-secondary" href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20read%20your%20HDB%20resale%20prices%20by%20town%20guide%20and%20would%20like%20help%20buying%20a%20resale%20flat." target="_blank" rel="noopener" data-cta-location="insights_resale_prices_3q_end" data-lead-type="hdb_buyer">Ask Joe about a town</a>
  </div>
</div>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 31 Oct 2026. Official figures come from HDB's <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/3rd-quarter-2026-public-housing-data-and-upcoming-flat-supply" rel="noopener">3rd Quarter 2026 public housing data</a> (23 October 2026), the <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/20261001-Flash-Estimate-of-3rd-Quarter-2026-Resale-Price-Index-and-Upcoming-Flat-Supply" rel="noopener">flash estimate</a> (1 October 2026), HDB's <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners" rel="noopener">wait-out announcement</a> (28 July 2026) for MOP supply, and URA's <a href="https://www.ura.gov.sg/news/media/pr26-73/" rel="noopener">3rd Quarter 2026 real estate statistics</a>. Medians, lease splits, million-dollar counts and the October read are my own analysis of HDB's <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view" rel="noopener">resale flat prices dataset</a> on data.gov.sg (Singapore Open Data Licence), downloaded 31 October 2026, grouped by registration month.</p>
'''
    faqs = [
        ('Did HDB resale prices fall in 3Q 2026?', 'Barely. HDB’s Resale Price Index fell 0.1% in the third quarter of 2026 to 202.5, its third small quarterly fall in a row. Resale transactions rose 19.5% on the quarter to 7,645, so more flats sold at almost the same prices.'),
        ('What is the median price of a 4-room HDB resale flat in 3Q 2026?', 'The median 4-room resale price was $628,000 in July to September 2026, based on 3,266 transactions in HDB’s data.gov.sg records. That is 0.3% below a year earlier. Town medians ranged from $538,000 in Jurong West to $1,065,000 in Queenstown.'),
        ('Which town has the cheapest 4-room resale flats?', 'Jurong West had the lowest 4-room median in 3Q 2026 at $538,000, followed by Jurong East at $540,944 and Woodlands at $545,000. Some cheap medians reflect short remaining leases, so compare flats with similar lease left.'),
        ('How many HDB flats sold for over $1 million in 3Q 2026?', '596 flats sold for $1 million or more between July and September 2026 in HDB’s transaction records, a record, up from 490 in the second quarter. Toa Payoh, Queenstown and Bukit Merah had the most.'),
    ]
    return dict(slug='hdb-resale-prices-3q-2026-by-town', title='HDB Resale Prices 3Q 2026 by Town', cat='Market data', mins=8,
                published='2026-10-31',
                headline='HDB resale prices in 3Q 2026 by town: more flats sold, prices barely moved',
                crumb='HDB resale prices 3Q 2026',
                desc='HDB resale prices dipped 0.1% in 3Q 2026 as sales rose 19.5%. Median 3-, 4- and 5-room prices for all 26 towns, record $1m flats and the lease effect.',
                og_desc='The Resale Price Index fell 0.1% in 3Q 2026 while sales rose 19.5%. Median prices by town and flat type from 7,406 transactions, and the lease effect behind the biggest moves.',
                lede='HDB resale sales jumped by a fifth in the third quarter while prices barely moved. Here are the official figures, median prices for every town and flat type, a record count of million-dollar flats, and why the biggest town moves came from which flats sold, not from values changing.',
                card='The Resale Price Index slipped 0.1% as sales rose 19.5%. Median 3-, 4- and 5-room prices for every town, record million-dollar flats, and why some town medians mislead.',
                body=body, faqs=faqs,
                disclaimer='This guide is general market information, not a valuation or financial advice. Medians describe transactions that happened, not what a particular flat will fetch. Get a valuation for your own flat before setting a price.',
                related_top=[('/hdb-prices/', 'HDB resale prices by town'), ('/neighbour-prices/', 'Your block’s sold prices')])
ARTICLES.append(('hdb-resale-prices-3q-2026-by-town', a1))

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

<h2 id="what-happened-after-the-change">What happened after the change</h2>
<p>HDB's figures for the third quarter, the first to include the change, came out on 23 October 2026. Resale sales rose 19.5% to 7,645 flats while the Resale Price Index slipped another 0.1%. HDB said it had not seen a significant increase in the prices or the number of resale flats bought by private owners and former private owners since the wait-out was removed. In other words, the extra sales came mostly from ordinary buyers and sellers, and private owners have not pushed prices up so far. <a href="hdb-resale-prices-3q-2026-by-town.html">HDB resale prices 3Q 2026 by town</a> has the full figures.</p>

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
<p><a href="/#book">Book a call with me</a> to work out the sell-first or buy-first order for your household. If you need two agents for two transactions, <a href="property-agent-commission-singapore.html">the commission guide</a> explains what each fee should cover.</p>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 31 Oct 2026 against HDB's release <a href="https://www.mnd.gov.sg/newsroom/press-releases/view/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners-purchasing-non-subsidised-hdb-resale-flats" rel="noopener">Removal of the 15-month wait-out period</a> (28 July 2026, published on MND's site and <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners" rel="noopener">HDB's</a>), the <a href="https://www.mnd.gov.sg/newsroom/press-releases/view/joint-mas-mnd-hdb-press-release-measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand" rel="noopener">joint MAS–MND–HDB release</a> of 29 September 2022 that introduced the wait, IRAS's <a href="https://ask.gov.sg/iras/questions/cln4esmvj003o5v0xawe9oj18" rel="noopener">answer on ABSD for downgraders</a>, and MAS's <a href="https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits" rel="noopener">loan tenure and loan-to-value limits</a>. The third-quarter figures and HDB's comment on private owners' purchases are from HDB's <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/3rd-quarter-2026-public-housing-data-and-upcoming-flat-supply" rel="noopener">3rd Quarter 2026 public housing data</a> (23 October 2026). The 45% figure assumes a loan tenure of up to 30 years that ends by age 65; longer loans have lower limits.</p>
'''
    faqs = [
        ('Has the 15-month wait-out period been removed?', 'Yes. From 28 July 2026, private property owners and former owners can buy a non-subsidised HDB resale flat of any size without waiting 15 months, provided they do not take an HDB housing loan and sell all private residential property within six months of completing the flat purchase.'),
        ('Does the 30-month wait-out still apply?', 'Yes. Private property owners who want a new HDB flat, a resale flat with housing grants, a new executive condominium from a developer, or an HDB housing loan must still wait 30 months after selling their private property.'),
        ('Do I pay ABSD if I buy an HDB resale flat before selling my condo?', 'IRAS’s published answer for a Singapore citizen downgrading from private property is that ABSD remission is given upfront, because HDB requires the private property to be sold within six months. Buyer’s stamp duty still applies. Permanent residents and unusual ownership structures should confirm with IRAS.'),
        ('Can a private property owner take a bank loan for an HDB flat?', 'Yes, and it is the only loan available under the new route. The bank limit is 75% of the price or valuation with no other outstanding housing loan, but falls to 45% if the private property still has a mortgage, so many owners sell or redeem the mortgage first.'),
    ]
    return dict(slug='15-month-wait-out-removed-private-owners-hdb', title='15-Month Wait-Out Removed: What Owners Do Now', cat='Housing policy', mins=7, modified='2026-10-31',
                headline='The 15-month wait-out is gone: what private owners and HDB sellers should do now',
                crumb='15-month wait-out removed',
                desc='Since 28 July 2026, private owners can buy a resale flat without grants or an HDB loan with no 15-month wait. Conditions, ABSD, loan limits and next steps.',
                og_desc='From 28 July 2026, private owners can buy a non-subsidised resale flat of any size straight away. The conditions that remain, stamp duty, loan limits and the order to sell in.',
                lede='HDB removed the 15-month wait-out for private property owners on 28 July 2026. The headline is simple, but the conditions, the 30-month rule that remains and the loan limits during the overlap decide whether the faster route works for you.',
                card='Private owners can now buy any resale flat straight away. The conditions that remain, ABSD, bank loan limits and whether to sell or buy first.',
                body=body, faqs=faqs,
                disclaimer='This guide is general education, not legal, tax or financial advice. HDB decides eligibility, IRAS decides stamp duty and banks decide loans on your own circumstances. Check the official sources linked above before you sign an option to purchase.',
                related_top=[('/calculator/', 'Affordability &amp; HDB loan calculator'), ('/stamp-duty-calculator/', 'Stamp duty calculator')])
ARTICLES.append(('15-month-wait-out-removed-private-owners-hdb', a2))

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
<div class="callout"><strong>The short version</strong><p>Over the six months to September 2026, the cheapest towns for a 4-room resale flat were <strong>Jurong West</strong> (median $530,000), <strong>Woodlands</strong> and <strong>Yishun</strong> (both $548,000). For a 5-room flat they were <strong>Jurong West</strong> ($630,000), <strong>Sembawang</strong> ($638,444) and <strong>Woodlands</strong> ($650,000). Some towns look cheap only because their flats are old. Count only flats with at least 70 years of lease left and the cheapest 4-room towns become Woodlands ($558,888), Jurong West ($570,000) and Choa Chu Kang ($575,000).</p></div>

<h2 id="how-this-ranking-works">How this ranking works</h2>
<p>This guide uses every 4-room and 5-room resale deal in HDB's records from April to September 2026: 5,969 4-room and 3,236 5-room flats. Six months gives each town enough deals to be meaningful, and the figures are recent enough to use now. Towns with fewer than ten deals of a flat type are left out. For each town you get the median price, the median lease left and the median floor area. The last column is the median for flats with at least 70 years of lease left, shown where there were at least ten such deals.</p>
<p>That last column matters because the cheapest flat in a town is almost always its oldest. Lease affects how much CPF you can use and how big a loan you can get. HDB and CPF allow full use when the remaining lease covers the youngest buyer to age 95; less than that and the amount shrinks. For a 35-year-old buyer, a flat with 55 years left gets pro-rated CPF use, so a cheaper old flat can still need more cash upfront than a dearer flat with 75 years left, depending on CPF balances and the loan. <a href="use-cpf-buy-hdb-flat-singapore.html">Using CPF to buy an HDB flat</a> sets out the rule.</p>

<div class="article-cta">
  <h3>Check the repayment before you pick a town</h3>
  <p>Put a price from the tables below into the HDB loan calculator to see the monthly instalment, then compare it with what your household can pay each month.</p>
  <div class="article-cta-actions">
    <a href="/calculator/" data-calculator="repayment" data-entry-point="cheapest_towns_guide" data-cta-location="insights_cheapest_towns_mid" data-lead-type="hdb_buyer">Estimate the monthly repayment →</a>
    <a class="article-cta-secondary" href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20read%20your%20guide%20to%20the%20cheapest%20HDB%20resale%20towns%20and%20would%20like%20help%20shortlisting%20flats." target="_blank" rel="noopener" data-cta-location="insights_cheapest_towns_mid" data-lead-type="hdb_buyer">Ask Joe about these towns</a>
  </div>
</div>

<h2 id="cheapest-4-room-resale-flats-by-town">Cheapest 4-room resale flats by town</h2>
{table('4 ROOM', 'Median 4-room HDB resale price by town, April to September 2026, cheapest first')}
<p>Three things stand out:</p>
<ul>
  <li><strong>Cheap and long leases:</strong> {town_link('WOODLANDS')}, {town_link('JURONG WEST')}, {town_link('CHOA CHU KANG')} and {town_link('BUKIT PANJANG')} have medians of $530,000 to $570,000 and typically about 70 years or more left. They are the best value for buyers who need full CPF use and a full loan.</li>
  <li><strong>Cheap because old:</strong> {town_link('YISHUN')} (61 years left), {town_link('BEDOK')} (60) and {town_link('ANG MO KIO')} (54) rank low on the median alone. Count only flats with 70+ years left and Bedok's median jumps to $898,000 and Ang Mo Kio's to $985,528. Those are newer flats in mature towns, a different product.</li>
  <li><strong>New-flat towns that aren't cheap:</strong> {town_link('SEMBAWANG')} ($602,500), {town_link('SENGKANG')} ($638,888) and {town_link('PUNGGOL')} ($680,000) have no old flats. Every deal there in the six months had 70+ years left, so their median is what a young-lease flat costs.</li>
</ul>

<h2 id="cheapest-5-room-resale-flats-by-town">Cheapest 5-room resale flats by town</h2>
{table('5 ROOM', 'Median 5-room HDB resale price by town, April to September 2026, cheapest first')}
<p>For 5-room flats the lease effect is smaller. {town_link('JURONG WEST')}, {town_link('SEMBAWANG')}, {town_link('WOODLANDS')} and {town_link('CHOA CHU KANG')} all have medians between $630,000 and $660,000 with typical leases above 70 years. The step up from a 4-room flat in the same town is small: about $100,000 in Jurong West, $102,000 in Woodlands and $105,000 in Choa Chu Kang, for 13 to 22 extra square metres. In mature estates it is much bigger. That is why many families upgrade to a 5-room flat in the north and west rather than a 4-room in the centre.</p>

<h2 id="what-the-cheapest-flats-actually-sold-for">What the cheapest flats actually sold for</h2>
<p>The lowest single price in the six months was $385,000 for a 4-room flat in Woodlands with 47 years of lease left. Every 4-room flat that sold below $420,000 had under 60 years left, and so did 56 of the 58 that sold for $440,000 or less. If your budget is near those prices, expect a short lease, possible upgrading works and a smaller CPF limit. Check the lease and the block's upgrading history, not just the price. The quarter-by-quarter picture is in <a href="hdb-resale-prices-3q-2026-by-town.html">HDB resale prices 3Q 2026 by town</a>.</p>

<h2 id="stretching-the-budget-grants-and-loans">Stretching the budget: grants and loans</h2>
<p>First-timers buying a resale flat may be able to take a CPF housing grant, the Enhanced CPF Housing Grant and the Proximity Housing Grant. Together they can reduce a Jurong West 4-room flat's effective price by a large share. The <a href="hdb-resale-grants-singapore.html">resale grants guide</a> and <a href="enhanced-cpf-housing-grant-singapore.html">EHG guide</a> set out the current amounts and the 2026 income ceilings from <a href="hdb-income-ceiling-2026-ndr-changes.html">the August changes</a>. For the loan, <a href="hdb-loan-eligibility-singapore.html">HDB loan eligibility</a> and <a href="hdb-loan-vs-bank-loan-singapore.html">HDB loan vs bank loan</a> cover the options, and <a href="hdb-downpayment-cash-cpf-grants.html">the downpayment guide</a> shows how much cash you need upfront. Private property owners, who can now buy without the wait-out, should read <a href="15-month-wait-out-removed-private-owners-hdb.html">the wait-out guide</a> first.</p>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Set a price ceiling with the <a href="/calculator/">affordability calculator</a>, including grants and your CPF balance.</li>
  <li>Shortlist two or three towns from the tables and open each town page for street-level prices.</li>
  <li>Get your <a href="hfe-letter-singapore-guide.html">HFE letter</a> before you view seriously, so you know your grants and loan.</li>
  <li>If you are also selling, get a <a href="/valuation.html">valuation</a> and check the <a href="how-long-to-sell-hdb-singapore-2026.html">selling timeline</a>.</li>
</ol>
<p><a href="/#book">Book a call with me</a> to compare specific blocks in the towns you are considering. For newer homes, <a href="new-condo-launches-2026-2027-calendar.html">the new launch calendar</a> lists every condo and EC coming up.</p>

<div class="article-cta">
  <h3>Comparing blocks in these towns?</h3>
  <p>Send Joe the towns and flat type you are looking at. He can go through recent sales, remaining lease and upgrading history block by block before you view.</p>
  <a href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20read%20your%20guide%20to%20the%20cheapest%20HDB%20resale%20towns%20and%20would%20like%20to%20compare%20some%20blocks." target="_blank" rel="noopener" data-cta-location="insights_cheapest_towns_end" data-lead-type="hdb_buyer">WhatsApp Joe about a block →</a>
</div>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 31 Oct 2026. All prices are my own analysis of HDB's <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view" rel="noopener">resale flat prices dataset</a> on data.gov.sg (Singapore Open Data Licence), downloaded 31 October 2026, for deals registered April to September 2026. Remaining lease is as recorded at the time of sale. CPF and loan lease rules are from HDB and CPF Board; confirm your own limits with CPF's home-purchase tools before committing.</p>
'''
    faqs = [
        ('Which town has the cheapest 4-room HDB resale flats in 2026?', 'Jurong West had the lowest 4-room median over April to September 2026 at $530,000, followed by Woodlands and Yishun at $548,000. Counting only flats with at least 70 years of lease left, Woodlands was cheapest at a median of $558,888.'),
        ('Which town has the cheapest 5-room HDB resale flats?', 'Jurong West, with a 5-room median of $630,000 over April to September 2026, followed by Sembawang at $638,444 and Woodlands at $650,000. All three typically sell 5-room flats with more than 70 years of lease left.'),
        ('Why are some mature-town 4-room flats so cheap?', 'Because they are old. Ang Mo Kio’s median 4-room resale flat had 54 years of lease left and Bedok’s 60, which pulls their medians down. Among flats with 70 or more years left, the medians were $985,528 in Ang Mo Kio and $898,000 in Bedok.'),
        ('What is the cheapest 4-room HDB flat sold recently?', 'The lowest 4-room price between April and September 2026 was $385,000 in Woodlands. Flats at that level are nearly always in the oldest blocks, so check the remaining lease, CPF usage limits and loan eligibility before treating a low price as a bargain.'),
    ]
    return dict(slug='cheapest-4-room-5-room-hdb-resale-flats', title='Cheapest 4-Room and 5-Room HDB Resale Towns', cat='Buying', mins=7, modified='2026-10-31',
                headline='The cheapest towns for 4-room and 5-room HDB resale flats in 2026, and when cheap means an old lease',
                crumb='Cheapest 4-room and 5-room resale flats',
                desc='Every town ranked by median 4-room and 5-room resale price, April to September 2026, with remaining lease and prices for flats with 70+ years left.',
                og_desc='Jurong West, Woodlands and Yishun lead for 4-room flats; Jurong West, Sembawang and Woodlands for 5-room. The full town ranking with lease left and like-for-like prices.',
                lede='A cheap median can mean a good-value town or an old lease. This ranks every town by 4-room and 5-room resale price over the six months to September 2026, then ranks them again counting only flats with at least 70 years left.',
                card='Every town ranked by median 4-room and 5-room price over six months, with lease left and like-for-like prices for flats with 70+ years.',
                body=body, faqs=faqs,
                disclaimer='This guide is general market information, not financial advice. Medians describe past transactions; grants, CPF usage and loans are decided by HDB, CPF Board and banks on your own application. Verify your eligibility before you commit.',
                related_top=[('/hdb-prices/', 'HDB resale prices by town'), ('/calculator/', 'Affordability &amp; HDB loan calculator')])
ARTICLES.append(('cheapest-4-room-5-room-hdb-resale-flats', a3))

# ================================================================ 4. rental market 3Q 2026
# The 2Q 2026 edition (singapore-rental-market-2q-2026.html) is kept as a static page:
# its prose quotes 2Q figures, so it is no longer rebuilt from the current quarter's data.
def a4():
    rows = []
    towns = sorted(t2.keys())
    for town in towns:
        r3, r4, r5 = rent_of(RENT_QUARTER, town, '3-RM'), rent_of(RENT_QUARTER, town, '4-RM'), rent_of(RENT_QUARTER, town, '5-RM')
        r4y = rent_of(RENT_YEAR_AGO, town, '4-RM')
        if not any([r3, r4, r5]):
            continue
        ch = f"{(r4 / r4y - 1) * 100:+.1f}%" if r4 and r4y else '—'
        ch = ch.replace('+0.0%', '0.0%').replace('-', '−')
        f = lambda v: money(v) if v else '—'
        rows.append(f"    <tr><th scope=\"row\">{town_link(town)}</th><td>{f(r3)}</td><td>{f(r4)}</td><td>{ch}</td><td>{f(r5)}</td></tr>")
    rent_table = '\n'.join(rows)
    y4 = sorted([('4 ROOM', t, rent_of(RENT_QUARTER, t, '4-RM'), int(rec['4 ROOM']['med']), rec['4 ROOM']['n'], rent_of(RENT_QUARTER, t, '4-RM') * 12 / rec['4 ROOM']['med'] * 100)
                 for t, rec in t2.items() if rec['4 ROOM']['n'] >= MIN_DEALS_YIELD and rent_of(RENT_QUARTER, t, '4-RM')], key=lambda y: -y[5])
    yrows = '\n'.join(f"    <tr><th scope=\"row\">{town_link(y[1])}</th><td>{money(y[2])}</td><td>{money(y[3])}</td><td>{y[5]:.1f}%</td></tr>" for y in y4)
    body = f'''
<div class="callout"><strong>The short version</strong><p>HDB rents held steady in the third quarter of 2026. The typical 4-room rent was <strong>$3,400</strong> a month, the same as in the second quarter and up from $3,300 a year earlier. HDB approved <strong>9,381</strong> applications to rent out flats, 6.2% fewer than in the second quarter, while the number of flats rented out still rose to 59,378. URA's private rental index rose <strong>1.3%</strong>, led by suburban condos, but private vacancy jumped to <strong>7.2%</strong> as a wave of new homes was completed. Landlords should expect steady rents, not rises, and price by their block and unit, not headlines.</p></div>

<h2 id="the-official-3q-2026-figures">The official 3Q 2026 figures</h2>
<table aria-label="HDB and URA official rental market figures for 3Q 2026">
  <thead><tr><th scope="col">Measure</th><th scope="col">3Q 2026</th><th scope="col">Change</th></tr></thead>
  <tbody>
    <tr><th scope="row">HDB applications approved to rent out a flat</th><td>9,381</td><td>−6.2% on 2Q (10,002); −7.3% on 3Q 2025 (10,123)</td></tr>
    <tr><th scope="row">HDB flats rented out, end of quarter</th><td>59,378</td><td>+0.9% on 2Q (58,855)</td></tr>
    <tr><th scope="row">URA private rental index</th><td>—</td><td>+1.3% (2Q: +0.7%)</td></tr>
    <tr><th scope="row">Private non-landed rents: city centre (CCR)</th><td>—</td><td>−0.3%</td></tr>
    <tr><th scope="row">Private non-landed rents: city fringe (RCR)</th><td>—</td><td>+1.5%</td></tr>
    <tr><th scope="row">Private non-landed rents: suburbs (OCR)</th><td>—</td><td>+3.1%</td></tr>
    <tr><th scope="row">Vacancy, completed private homes</th><td>7.2%</td><td>up from 6.4%; CCR 8.4%, RCR 7.4%, OCR 6.5%</td></tr>
  </tbody>
</table>
<p>Approvals fell, yet the number of HDB flats rented out still edged up 0.9%. On the private side, landed rents rose 2.1% and condos and apartments 1.2%. The more telling private figure is vacancy: 3,559 private homes and ECs were completed in the quarter, the most since 3Q 2024, and vacancy rose in every region, most in the city fringe.</p>
<p>This is the 3Q 2026 edition. <a href="singapore-rental-market-2q-2026.html">The 2Q 2026 edition</a> has the April to June figures.</p>

<div class="article-cta">
  <h3>Renting out or selling?</h3>
  <p>A free valuation tells you what your flat would sell for, so you can weigh it against a year's rent before you sign a lease.</p>
  <div class="article-cta-actions">
    <a href="/valuation.html?propType=HDB" data-cta-location="insights_rental_3q_mid" data-lead-type="valuation">Get a free valuation →</a>
    <a class="article-cta-secondary" href="/rent-out/" data-cta-location="insights_rental_3q_mid" data-lead-type="landlord">Rent out with Joe</a>
  </div>
</div>

<h2 id="hdb-median-rents-by-town">HDB median rents by town</h2>
<p>HDB publishes a median monthly rent for each town and flat type every quarter, based on the rentals it approves. The 4-room change compares 3Q 2026 with 3Q 2025. A dash means HDB did not publish a figure because there were too few rentals.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="HDB median monthly rent by town and flat type, 3Q 2026">
  <thead><tr><th scope="col">Town</th><th scope="col">3-room</th><th scope="col">4-room</th><th scope="col">4-room, year on year</th><th scope="col">5-room</th></tr></thead>
  <tbody>
{rent_table}
  </tbody>
</table>
</div>
<p>Of the 25 towns with a 4-room figure, 19 were higher than a year earlier and only Ang Mo Kio was lower, and the typical town was up 2.8%. The top 4-room rents were in the Central Area ($4,800), Queenstown ($4,300) and Clementi ($4,100). The lowest was in Bukit Panjang ($3,000), followed by Choa Chu Kang, Woodlands and Yishun ($3,100). Across all approved rentals from July to September, the median was $2,900 for a 3-room flat, $3,400 for a 4-room, $3,500 for a 5-room and $3,890 for an executive flat.</p>

<h2 id="gross-rental-yield-by-town">Gross rental yield by town</h2>
<p>Yield is the question most landlords are really asking. Divide a year's median rent by the median resale price for the same town and flat type, and you get a rough gross yield. It is before property tax, maintenance, agent fees and empty months, and it assumes an average flat. The table covers towns with at least 20 4-room resale deals in the quarter.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="Indicative gross rental yield for 4-room HDB flats by town, 3Q 2026">
  <thead><tr><th scope="col">Town (4-room)</th><th scope="col">Median rent</th><th scope="col">Median resale price</th><th scope="col">Gross yield</th></tr></thead>
  <tbody>
{yrows}
  </tbody>
</table>
</div>
<p>The pattern is consistent: rents vary far less between towns than prices do. A 4-room flat in Jurong West rents for $3,600 on a $538,000 median price, about 8.0% gross. In Toa Payoh it rents for $3,850 on a median above $1 million, about 4.5%. The Central Area's 6.9% is flattered this quarter: the 4-room flats that sold there had much shorter leases than a year ago, which pulled its price median down. 3-room flats yield most in older central towns like Toa Payoh and Geylang. Treat these as a guide, not a forecast. The flats rented out are often older and cheaper than the flats sold in the same town, which flatters the high-yield towns somewhat. <a href="hdb-resale-prices-3q-2026-by-town.html">The 3Q 2026 resale price guide</a> has the price side.</p>

<h2 id="what-private-landlords-are-seeing">What private landlords are seeing</h2>
<p>The quarter split private landlords in two. In the suburbs, non-landed rents rose 3.1%, after slipping 0.3% in the second quarter. In the city centre they fell 0.3%. At the same time vacancy rose everywhere: from 5.6% to 6.5% in the suburbs, from 6.1% to 7.4% in the city fringe and from 8.3% to 8.4% in the centre. That combination suggests newly completed units are taking time to fill while well-located existing units still let. A new project nearby competes directly with your unit for the same tenants.</p>

<h2 id="what-landlords-can-expect-into-2027">What landlords can expect into 2027</h2>
<ul>
  <li><strong>More flats competing for tenants.</strong> 13,500 flats reach their MOP in 2026 and 15,000 in 2027, according to HDB. Many owners of those flats will rent them out. Expect HDB rents to hold rather than rise quickly.</li>
  <li><strong>Private vacancy is the risk.</strong> About 22,300 private homes and ECs in URA's pipeline are due by 2028, after the busiest quarter for completions in two years. Condo landlords in areas with new completions should price to fill the unit, not to hold out.</li>
  <li><strong>Renewals beat new leases.</strong> With rents flat to slightly up, keeping a good tenant at a modest increase usually earns more than a better rent with an empty month or two.</li>
  <li><strong>Selling may beat renting.</strong> Since 28 July, private owners can buy resale flats without the 15-month wait, and resale sales rose 19.5% in the third quarter. Some landlords of mature-town 5-room flats may do better selling than renting. <a href="15-month-wait-out-removed-private-owners-hdb.html">The wait-out guide</a> explains the change.</li>
</ul>

<h2 id="rules-before-you-rent-out-an-hdb-flat">Rules before you rent out an HDB flat</h2>
<p>You can rent out the whole flat only after its five-year minimum occupation period and with HDB's approval. The minimum lease is six months. Non-Malaysian non-citizen tenants renting a whole flat count toward a non-citizen quota of 8% of flats in the neighbourhood and 11% in the block. If the quota is full, only Singaporean and Malaysian tenants are allowed. Check your block's quota before you advertise. Rental income is taxable, and an HDB flat that isn't owner-occupied pays property tax at non-owner-occupier rates.</p>

<h2 id="your-next-steps">Your next steps</h2>
<ol>
  <li>Check your town's median on the table above, then look at <a href="/neighbour-prices/">your block's recent resale prices</a> to work out your own yield.</li>
  <li>Check HDB's <a href="https://services2.hdb.gov.sg/webapp/BR12AWNCQuota/" rel="noopener">non-citizen quota for your block</a> before choosing tenants.</li>
  <li>If you are weighing renting against selling, get a <a href="/valuation.html">valuation</a> and read <a href="selling-hdb-after-mop-singapore.html">selling after MOP</a>.</li>
</ol>
<p><a href="/rent-out/">List your flat for rent with me</a> or <a href="/#book">book a call</a> to compare renting with selling on your own flat. <a href="property-agent-commission-singapore.html">The commission guide</a> covers what a rental agent's fee should include.</p>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 31 Oct 2026. Official figures are from HDB's <a href="https://www.hdb.gov.sg/hdb-pulse/news/2026/3rd-quarter-2026-public-housing-data-and-upcoming-flat-supply" rel="noopener">3rd Quarter 2026 public housing data</a> (23 October 2026) and URA's <a href="https://www.ura.gov.sg/news/media/pr26-73/" rel="noopener">3rd Quarter 2026 real estate statistics</a> (23 October 2026). Town medians are from HDB's <a href="https://data.gov.sg/datasets/d_23000a00c52996c55106084ed0339566/view" rel="noopener">median rent by town and flat type</a>. Islandwide medians are my own analysis of HDB's <a href="https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view" rel="noopener">renting out of flats</a> records, which count 8,808 approvals in the quarter against HDB's headline 9,381. Yields combine those rents with HDB's <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view" rel="noopener">resale prices</a>; all data.gov.sg data is under the Singapore Open Data Licence and was downloaded 31 October 2026. MOP supply is from HDB's 28 July 2026 release, and rental rules are from <a href="https://www.hdb.gov.sg/managing-my-home/home-ownership/renting-out-a-flat-or-bedrooms/renting-out-a-flat/eligibility" rel="noopener">HDB's eligibility page</a>.</p>
'''
    faqs = [
        ('Are HDB rents going up in 2026?', 'Slowly. The median 4-room HDB rent was $3,400 a month in 3Q 2026, the same as in 2Q and up from $3,300 a year earlier, and 19 of 25 towns with a 4-room figure were higher than a year before. HDB approved 9,381 applications to rent out flats in the quarter, 6.2% fewer than in 2Q.'),
        ('What is the average rent for a 4-room HDB flat?', 'The median across all 4-room rentals HDB approved in July to September 2026 was $3,400 a month. Town medians ranged from $3,000 in Bukit Panjang to $4,800 in the Central Area.'),
        ('Which HDB towns have the highest rental yield?', 'Dividing 3Q 2026 median rent by median resale price, 4-room flats yielded most in Jurong West (about 8.0% gross) and Jurong East (7.8%), and least in Toa Payoh (4.5%) and Queenstown (4.8%). These are gross figures before costs and vacancy.'),
        ('Did private condo rents rise in 3Q 2026?', 'URA’s private rental index rose 1.3% in 3Q 2026. Non-landed rents rose 3.1% in the suburbs and 1.5% in the city fringe and fell 0.3% in the city centre, while vacancy of completed private homes rose to 7.2%.'),
    ]
    return dict(slug='singapore-rental-market-3q-2026', title='Singapore Rental Market 3Q 2026: Landlord Guide', cat='Renting out', mins=8,
                published='2026-10-31',
                headline='Singapore’s rental market in 3Q 2026: HDB rents by town, yields, and what landlords can expect',
                crumb='Rental market 3Q 2026',
                desc='HDB and condo rents in 3Q 2026: official figures, median HDB rents for every town, gross rental yields and what landlords should expect into 2027.',
                og_desc='The 4-room HDB median held at $3,400 while URA’s private rental index rose 1.3% and private vacancy climbed to 7.2%. Town-by-town rents, gross yields and the outlook for landlords.',
                lede='HDB rents held steady in the third quarter while private rents rose and private vacancy climbed. Here are the official HDB and URA figures, median HDB rents and gross yields for every town, and what that means for pricing a lease.',
                card='Official HDB and URA figures, median HDB rents and gross yields for every town, and what landlords should expect into 2027.',
                body=body, faqs=faqs,
                disclaimer='This guide is general market information, not tax, legal or investment advice. Rental approval, quotas and tax are decided by HDB and IRAS on your own case. Check the official pages linked above before signing a tenancy.',
                related_top=[('/rent-out/', 'Rent out your flat with Joe'), ('/hdb-prices/', 'HDB resale prices by town')])
ARTICLES.append(('singapore-rental-market-3q-2026', a4))

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
        ('4Q 2026', 'thomson-reserve', ''),
        ('4Q 2026', 'chencharu-close', ''),
        ('4Q 2026', 'upper-thomson-road', ''),
        ('4Q 2026', 'keppel-bay-plot-6', ''),
        ('1Q 2027', 'chuan-grove', ''),
        ('1Q 2027', 'senja-close-ec', 'Formerly the Senja Close EC site'),
        ('1Q 2027', 'woodlands-drive-17-ec', 'Formerly the Woodlands Drive 17 EC site'),
        ('1Q 2027', 'sembawang-road-ec', ''),
        ('1H 2027', 'dorset-road', 'Formerly the Dorset Road site'),
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
        ('Booking 26 Sep 2026', 'amberwood-at-holland', ''),
        ('Launched 3 Oct 2026', 'lucerne-grand', '61.4% sold on the 3\u20134 Oct launch weekend'),
        ('Launched 16 Oct 2026', 'the-serra-residences', 'Preview opened 2 Oct'),
        ('Launched Oct 2025', 'w-residences-marina-view', ''),
        ('On sale', 'faber-residence', ''),
        ('On sale', 'zyon-grand', ''),
    ]
    up_units = sum(P[s]['unitCount'] for _, s, _ in upcoming)
    q4_units = sum(P[s]['unitCount'] for w, s, _ in upcoming if w == '4Q 2026')
    q1_units = sum(P[s]['unitCount'] for w, s, _ in upcoming if w == '1Q 2027')
    ec_units = sum(P[s]['unitCount'] for w, s, _ in upcoming if P[s]['propertyType'] == 'executive-condominium')
    up_rows = '\n'.join(row(*u) for u in upcoming)
    la_rows = '\n'.join(row(*u) for u in launched)
    body = f'''
<div class="callout"><strong>The short version</strong><p>{len(upcoming)} condo and EC projects with about <strong>{up_units:,} homes</strong> are expected to launch between October 2026 and the end of 2027. Four projects are expected in the rest of the fourth quarter of 2026, from Thomson Reserve's 1,268 homes to Keppel Bay Plot 6's 84. The first quarter of 2027 brings Chuan Grove and three ECs, Dorset Gardens follows in the first half of 2027, and Hougang Central Residences in late 2027. Amberwood at Holland, Lucerne Grand and The Serra Residences have now launched. Launch windows are the developers' own guidance, and they move. Each project page updates when a date is confirmed.</p></div>

<h2 id="upcoming-launches-september-2026-to-2027">Upcoming launches: October 2026 to 2027</h2>
<p>Ordered by expected launch. "Homes" is the developer's or planning figure; ECs are marked so eligible buyers can find them quickly.</p>
<div class="table-scroll" style="overflow-x:auto">
<table aria-label="Upcoming new condo and EC launches in Singapore, October 2026 to 2027">
  {head}
  <tbody>
{up_rows}
  </tbody>
</table>
</div>

<div class="article-cta">
  <h3>Want the price list before the preview?</h3>
  <p>Each project in the table links to its own page, where you can send Joe an enquiry for floor plans and prices once the developer releases them. Not sure which project fits yet? Ask on WhatsApp.</p>
  <div class="article-cta-actions">
    <a href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20read%20your%20new%20launch%20calendar%20and%20would%20like%20the%20price%20list%20and%20floor%20plans%20for%20a%20project." target="_blank" rel="noopener" data-cta-location="insights_launch_calendar_mid" data-lead-type="new_launch">Ask Joe about a launch →</a>
    <a class="article-cta-secondary" href="/new-launches/" data-cta-location="insights_launch_calendar_mid" data-lead-type="new_launch">Browse all new launches</a>
  </div>
</div>

<h2 id="the-fourth-quarter-of-2026">The fourth quarter of 2026</h2>
<p>From October to December, about {q4_units:,} homes are expected across four projects:</p>
<ul>
  <li><strong>City fringe (RCR):</strong> {link('thomson-reserve')} at Bright Hill, the largest launch of the year, and {link('keppel-bay-plot-6')} on Keppel Island.</li>
  <li><strong>Suburbs (OCR):</strong> {link('chencharu-close')} in District 27 and {link('upper-thomson-road')}. These are the main options for HDB upgraders buying new outside the city.</li>
</ul>

<h2 id="2027-chuan-grove-three-ecs-and-hougang-central">2027: Chuan Grove, three ECs and Hougang Central</h2>
<p>The first quarter of 2027 is expected to bring about {q1_units:,} homes. {link('chuan-grove')} has 1,055 of them, at Chuan Grove off Lorong Chuan. The other three are ECs with {ec_units:,} homes between them: {link('senja-close-ec')} in Bukit Panjang, {link('woodlands-drive-17-ec')} in Woodlands and {link('sembawang-road-ec')}. All three keep the $16,000 household income ceiling, because their sites were tendered before the 24 August 2026 cut-off. <a href="ec-vs-private-condo-2027.html">EC vs private condo in 2027</a> explains the ceiling and compares prices.</p>
<p>{link('dorset-road')}, about 428 homes in two towers in District 8, is now targeted for the first half of 2027.</p>
<p>{link('hougang-central-residences')}, 830 homes above Hougang MRT, is guided for late 2027. <a href="singapore-mega-launches-2027.html">Singapore's 2027 mega launches</a> covers the wider 2027 pipeline and how upgraders should time a sale around it.</p>
<div class="callout"><strong>Hougang Central Residences launch date</strong><p>UOL guides the launch for the second half of 2027, so it is expected by the fourth quarter of 2027. No preview or booking date has been announced. The <a href="/new-launches/hougang-central-residences.html">Hougang Central Residences page</a> tracks every verified step towards launch, and you can register there for the first official release.</p></div>

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

<div class="article-cta">
  <h3>Selling an HDB flat to buy a launch?</h3>
  <p>Price the flat before the preview weekend. The sale sets your budget, and the booking fee is due on the day you book.</p>
  <div class="article-cta-actions">
    <a href="/valuation.html?propType=HDB" data-cta-location="insights_launch_calendar_end" data-lead-type="valuation">Get a free valuation →</a>
    <a class="article-cta-secondary" href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20read%20your%20new%20launch%20calendar%20and%20would%20like%20help%20timing%20my%20HDB%20sale%20with%20a%20new%20launch." target="_blank" rel="noopener" data-cta-location="insights_launch_calendar_end" data-lead-type="upgrader">Plan my timeline with Joe</a>
  </div>
</div>

<h2 id="sources-and-review-date">Sources and review date</h2>
<p>Reviewed 17 Sep 2026 and updated 16 Oct 2026 against this site's project tracker, which records a source for every fact. Those sources include developer announcements and results filings (City Developments, UOL, CapitaLand, GuocoLand, Sing Holdings, Keppel, Far East Organization, Sim Lian), HDB's list of upcoming EC sites, URA's list of uncompleted private projects and published launch coverage. Expected windows are guidance, not commitments; a project's page shows a preview or booking date only once it is confirmed. The <a href="https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits" rel="noopener">loan limits</a> are MAS's and the ABSD refund rule is <a href="https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)" rel="noopener">IRAS's</a>.</p>
'''
    faqs = [
        ('What new condo launches are coming in late 2026?', f'Thomson Reserve, Chencharu Close, Upper Thomson Road and Keppel Bay Plot 6 are expected in the rest of the fourth quarter of 2026, about {q4_units:,} homes in all. Amberwood at Holland, Lucerne Grand and The Serra Residences (16 October) have already launched.'),
        ('Which ECs are launching in 2027?', 'Three ECs are expected in the first quarter of 2027: Solano Grand (the Senja Close site) in Bukit Panjang, Wynwood Grand (Woodlands Drive 17) and Sembawang Road EC. All three keep the $16,000 income ceiling because their land tenders closed before 24 August 2026.'),
        ('What is the biggest new launch in 2026?', 'Thomson Reserve at Bright Hill Drive, with 1,268 homes, is the largest project expected in 2026. In 2027, Chuan Grove (1,055 homes) and Hougang Central Residences (830 homes) are the largest.'),
        ('Are new launch dates confirmed?', 'None of the upcoming projects has a confirmed preview or booking date yet. The windows are developers’ guidance from announcements and results filings and can move. Each project page on this site updates when a preview or booking date is confirmed.'),
    ]
    return dict(slug='new-condo-launches-2026-2027-calendar', modified='2026-10-16', title='New Condo Launches 2026–2027: Launch Calendar', cat='New launches', mins=7,
                headline='New condo and EC launches in Singapore, October 2026 to 2027: the launch calendar',
                crumb='New launch calendar 2026–2027',
                desc=f'Every upcoming Singapore condo and EC launch to 2027, about {up_units:,} homes: expected dates, location, tenure, size and developer, plus what is still selling.',
                og_desc=f'{len(upcoming)} projects and about {up_units:,} homes from Thomson Reserve in late 2026 to Hougang Central Residences in late 2027, plus every project already launched.',
                lede='A single calendar of every condo and EC launch expected between now and the end of 2027, with the facts that matter for a shortlist, and every project from 2026 that is still selling. Each name links to a project page with photos, a location map and live availability.',
                card=f'Every condo and EC launch expected to 2027, about {up_units:,} homes, with dates, districts, tenure and developers, plus what is still selling.',
                body=body, faqs=faqs,
                disclaimer='This calendar is general information, not investment advice. Launch timing, prices and unit mix are set by developers and change; confirm dates and terms with the developer’s sales team before committing to a purchase.',
                related_top=[('/new-launches/', 'All new launches'), ('/calculator/', 'Affordability &amp; HDB loan calculator')])
ARTICLES.append(('new-condo-launches-2026-2027-calendar', a5))

# ---------------------------------------------------------------- assemble
ONLY = set(sys.argv[1:])
unknown = ONLY - {slug for slug, _ in ARTICLES}
if unknown:
    raise SystemExit(f'unknown article slug(s): {", ".join(sorted(unknown))}')
built = [f() for slug, f in ARTICLES if not ONLY or slug in ONLY]
for a, (slug, _) in zip(built, [x for x in ARTICLES if not ONLY or x[0] in ONLY]):
    assert a['slug'] == slug, (a['slug'], slug)

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
    pub = a.get('published', PUB)
    faq_ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': ans}} for q, ans in a['faqs']]}
    art_ld = {'@context': 'https://schema.org', '@type': 'Article', 'headline': a['headline'], 'description': a['desc'],
              'image': 'https://joetay.com/joetay-social-preview.jpg', 'datePublished': pub, 'dateModified': a.get('modified', pub), 'inLanguage': 'en-SG',
              'author': {'@type': 'Person', '@id': 'https://joetay.com/about-joe/#joe-tay', 'name': 'Joe Tay', 'url': 'https://joetay.com/about-joe/', 'identifier': 'CEA R009618D'},
              'publisher': {'@type': 'RealEstateAgent', '@id': 'https://joetay.com/#agent', 'name': 'PropertySG', 'url': 'https://joetay.com/', 'alternateName': 'Joe Tay'},
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
<meta property="article:published_time" content="{pub}">
<meta property="article:modified_time" content="{a.get('modified', pub)}">
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
<header class="article-header"><div class="article-meta-top"><span class="cat">{esc(a['cat'])}</span><span class="dot" aria-hidden="true">·</span><span>{a['mins']} min read</span><span class="dot" aria-hidden="true">·</span><time datetime="{pub}">{PUB_H if pub == PUB else human_date(pub)}</time></div>
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
