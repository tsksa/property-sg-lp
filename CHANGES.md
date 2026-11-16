# joetay.com changes — November 2026 audit round

Phase 3 report for the audit in `AUDIT.md`. Covers 13–14 November 2026, commits `b80e03c` to `4edf0e3` on `main` (14 commits), all deployed. The starting point was `29b7cb3`. A follow-up batch on 15 November (`466d397` to `21dcc13`, seven commits, also deployed) is described under "15 November batch" below, and the 16 November work under "16 November": the buyer and tenant pages (`f87bafc`) and the condo district seller block (`39298c5`) and the guide contact prompts (`009db83`), all deployed, and the common questions in `llms.txt` (`30b55fd`) and reviewed dates on three guides (`a1a6027`), not yet deployed.

## Summary

Eight of the audit's top-10 items are live. Two wait on Joe: the unsourced track-record figures (item 4) and a Google Business Profile (item 9).

| # | Item | Status |
|---|---|---|
| 1 | Dead "verify my CEA registration" link | Live |
| 2 | Agency name and licence on price pages | Live |
| 3 | Mobile cookie banner covering the headline | Live |
| 4 | Unsourced figures and the "Sell above valuation." headline | Waiting on Joe |
| 5 | Review and reply-time wording | Live |
| 6 | Star-rating markup | Live |
| 7 | Homepage title and description | Live |
| 8 | Contrast, dead source links, lander logo | Live |
| 9 | Google Business Profile | Waiting on Joe |
| 10 | Seller block on town pages | Live |

## Lighthouse, before and after

Mobile, Lighthouse 12.6.1, one run per page against the live site from the same laptop. Before is 13 November at `29b7cb3`; after is 14 November at `4edf0e3`. Single lab runs vary by a point or two and by a few tenths of a second, so read performance and LCP as "no worse", not as gains. Best practices and SEO were 100 on every page both times, and CLS was 0. There is no field data, so INP is not measured.

| Page | Performance | Accessibility | LCP |
|---|---|---|---|
| `/` | 95 → 97 | 100 → 100 | 2.7 s → 2.3 s |
| `/hdb-prices/punggol/` | 99 → 100 | 100 → 100 | 1.9 s → 1.4 s |
| `/sell-hdb/singapore/` | 100 → 99 | 93 → 100 | 1.7 s → 1.8 s |
| `/valuation.html` | 99 → 99 | 100 → 100 | 2.0 s → 2.0 s |
| `/insights/how-to-sell-hdb-flat-singapore.html` | 99 → 99 | 96 → 100 | 1.6 s → 2.0 s |
| `/about-joe/` | 99 → 99 | 96 → 100 | 2.0 s → 2.1 s |

The measurable change is accessibility: the three pages that scored 93–96 now score 100. `/sell/` and `/rent-out/` were not in the before set; both scored 100 for accessibility on a local run after the fixes.

## What changed and why

### 1. CEA register link (`b80e03c`, `25250f0`)

- **Before:** six pages linked "verify my registration" to `https://www.cea.gov.sg/aceas/public-register/ea`, which CEA's own site answers with its 404 page.
- **After:** they link to `https://eservices.cea.gov.sg/aceas/public-register/`, the URL `llms.txt` already used.
- **Why:** this is the link that lets a seller confirm Joe is registered. A broken one undermines the claim it supports.
- **Pages:** `about-joe/`, `sell/`, `sell-hdb/singapore/`, `glossary/`, `zh/about-joe/`, `zh/sell-hdb/`. A test that pinned the old URL was updated.

### 2. Agency name and licence on price pages (`744764e`)

- **Before:** the 54 town and district price pages ended "PropertySG · Joe Tay, District Director, ERA · CEA R009618D".
- **After:** "PropertySG · Joe Tay, District Director · ERA Realty Network Pte Ltd · Agency Lic. No. L3002382K · CEA Reg. No. R009618D", the wording the rest of the site already carried.
- **Why:** these pages carry lead forms and WhatsApp buttons, so they are advertisements and should show the agency's full name and licence number.
- **Also changed:** both generators, so the next data refresh keeps the line.

### 3. Mobile cookie banner (`9255889`, `3d267c0`)

- **Before:** on phones the banner sat directly under the header and covered the page headline until dismissed.
- **After:** it sits at the bottom of the screen, as on desktop. On new-launch pages and the ad landers it sits above the bottom contact bar and the floating WhatsApp button.
- **Why:** first-time visitors from Google saw a cookie notice where the headline should be.
- **What went wrong:** the first version overlapped the bottom contact bar on new-launch pages and failed the Lighthouse tap-target check in CI. The second commit fixed it; CI has passed since.

### 5. Review and reply-time wording (`0f0c71e`)

- **Before:** homepage reviews were introduced as "Real results from real homeowners across Singapore." Landers showed "5.0/5 · Verified reviews" and "Reply within 1 hour."
- **After:** the intro names the review sources and says each review is one client's account, not a promise of the same outcome. The three landers carry the same note under their quoted review. The badge reads "5.0/5 · from 8 client reviews". Reply time reads "Typical reply within 1 hour, 9am–9pm."
- **Why:** to stop individual results and a best-case reply time reading as promises.
- **Not changed:** no review text.

### 6. Star-rating markup (`060e577`)

- **Before:** the homepage's structured data declared a 5.0 aggregate rating and eight reviews.
- **After:** that markup is removed. The visible reviews, their text and their source links are unchanged.
- **Why:** the reviews were written on PropertyGuru and FindPropertyAgent, not collected on this site, and Google does not show stars for a business's markup about itself.
- **Also changed:** two tests used that markup as their source of truth. They now check the visible review cards: the stated count matches the cards, each headline star figure is their average, and the newest review leads.

### 7. Homepage title and description (`d6ba110`)

- **Before:** title "PropertySG | Singapore Property Agent — HDB, Condo & Landed"; description listed listing portals.
- **After:** title "PropertySG | Joe Tay, ERA Property Agent Singapore"; description "Singapore property agent for selling and renting out HDB, condo and landed homes. Free valuation from Joe Tay, ERA District Director (CEA R009618D)."
- **Why:** people who hear of Joe by name search the name, and it was missing from the title.

### 8. Tidy-up batch (`a260018`, `84cd8b7`, `b32f0aa`, `f942f4a`)

- **Contrast:** green text on white on the three ad landers measured 2.5:1 and footer greys 2.3–3.5:1. They now meet 4.5:1, and in-text lander links are underlined. The `/sell/` submit button uses the darker green already on the HDB lander. About-page labels and the article footer heading were darkened.
- **Dead source links:** three HDB links in the guides returned 404. Two were moved pages and now point to their new addresses. The third, a 2024 "OTP important notes" PDF, no longer exists, so that citation now points to HDB's Option to Purchase page and reads "HDB's Option to Purchase guidance".
- **Logo:** the HDB landers loaded a 21 KB logo for a 36-pixel slot; they now load a 7 KB copy.

### 10. Seller block on town pages (`4edf0e3`)

- **Before:** the 26 HDB town pages asked for contact only at the foot of a long page.
- **After:** directly under the price card each has "Selling your HDB flat in <town>?" with the postal-code sold-price lookup, a WhatsApp button that names the town, and a link to the valuation form. Meta descriptions end "Selling in <town>? Check your block." on the 21 towns where it fits the length limit.
- **Why:** these pages rank for price searches and are read by owners deciding whether to sell.
- **Page speed:** the lookup's script and styles load only when a visitor scrolls near the block or taps it. Loading them with the page cost about 0.3 s in testing; after the change, before and after measured the same.
- **Data:** the pages were edited in place and still show September figures. A regeneration would have pulled in October data, which the monthly refresh brings in as its own reviewed change. The generator produces the identical block.

## Corrections to the audit

Two findings in `AUDIT.md` were wrong and are marked withdrawn there.

- **A1:** the homepage structured data already linked to Joe's ERA, PropertyGuru and SRX profiles and named the agency and licence. Nothing needed adding.
- **S9:** the second `block-alert.css` link on the homepage is a correct no-JavaScript fallback, not a duplicate.

One item was narrowed: the About portrait was left alone, because phones with sharp screens need the larger file.

## How it was checked

- `npm run check` passed before each push.
- GitHub's Validate and Lighthouse workflows passed on `84cd8b7` and `4edf0e3`. Lighthouse failed once, on `bb346be`, for the banner overlap described under item 3.
- Each batch was viewed at phone and desktop widths in a local browser. The town-page lookup was run with a sample postal code.
- After each push, the changed text was confirmed on the live pages.
- No lead form was submitted at any point.

Not done: checks on a real phone, a screen-reader pass, and dark mode beyond the automated contrast tests.

## 15 November batch

Five further audit items, live at `21dcc13`.

### Bottom WhatsApp and Call bar on phones (U2, `466d397`)

Guides, price pages, calculators, the glossary, the FAQ and the About page had no contact route once the header scrolled away. `assets/mobile-header.js` now adds a two-button bar at widths up to 768px, shown after the first 80px of scroll and hidden while a text field has focus or the menu is open. The WhatsApp link is copied from the page's header button and the Call button dials +65 8188 1488, the number already on the site. Pages that have their own bottom bar are skipped.

### Homepage final form (U5, `6b23fc6`, `3fd73b2`)

The final form asked for more than the hero form. It now takes the same three fields: name, mobile number and property type. The country-code selector is gone; the number field accepts a Singapore mobile or a full international number. The second commit lifts the cookie banner clear of the homepage's bottom contact bar on phones.

### Seller's Checklist offer (C1, `fdef5ca`, `5e760f8`)

The checklist was offered only in the homepage exit popup, which phones rarely trigger. `assets/checklist-offer.js` now shows it on six seller guides and, through `js/estate-lead.js`, in the seller block of all 26 town pages. A visitor can enter an email to open the checklist, or ask for it on WhatsApp without giving one. The email route sends the same `newsletter_signup` payload as the popup, tagged `source_widget: inline_checklist`. The consent wording is the popup's own, unchanged.

### FAQ hub (A3, G6, `063f464`)

`/faq/` gathers 46 questions under 10 topics. `scripts/generate-faq-hub.mjs` reads them from the answers already published on the guides, so no answer was written fresh and the hub cannot drift from its sources. The hub carries no FAQ markup of its own, to avoid duplicating the guides'. It is linked from every footer.

### Seller guide hub and three guides (G3, G4, A4, `21dcc13`)

`/sell/guide/` is a hub for the seller guides. Three guides are new: Seller's Stamp Duty, selling a condo, and renting out an HDB flat or condo. All four pages come from `scripts/generate-seller-cluster.mjs`. Rates and rules were read from IRAS, URA, HDB, CPF and CEA pages on 15 November 2026 and each guide links its sources. In the condo guide, the 1% option fee, 14-day option period, 4% exercise fee and 8–12 week completion are labelled as market conventions, not rules. Joe has not yet reviewed the three guides.

### How this batch was checked

- `npm run check` passed before the push, and GitHub's Validate and Lighthouse workflows passed on `21dcc13`.
- The bar, the form and the checklist box were viewed at phone and desktop widths in a local browser. A local Lighthouse run scored the new pages 100 for accessibility after two fixes (breadcrumb link styling and an empty table header).
- After the push, the new pages, scripts, footer link and sitemap entries were confirmed on the live site by read-only requests.
- No lead form was submitted. The live form endpoint was not exercised for the checklist payload, so a real signup is untested.

Not done: a real phone, and confirming that a checklist signup reaches Joe's sheet and triggers his follow-up email.

## 16 November

### Buyer and tenant pages (G5, `f87bafc`)

`/buy/` and `/rent/` are short service pages for the two audiences that had none. Each says who represents whom, what Joe does for that client and the rules in order. The HDB buying figures (option fees, the 21-day option, the Request for Value, the HFE letter and the 8-week completion) were read from HDB's own pages on 16 November, and the commission position from CEA's. The rental rules are the ones the landlord guide checked on 15 November. Neither page states a fee rate, a track record or a testimonial. Each ends in a WhatsApp and call button tagged `buy_page` / `buyer` or `rent_page` / `tenant`. The shared footer group is now "Buy, sell or rent with Joe" and links both pages. Checked with `npm run check` (all passing), the publish build, and the pages at 375px and 1280px.

### Seller block on condo district pages (G7, `39298c5`)

The 26 condo district pages now carry the same seller block as the HDB town pages, directly under the price card: "Selling your condo in District N?", a line on why the district median is a starting point rather than a price, a link to the page's own project table, a WhatsApp button with the district in the message, and a link to the valuation form. Condos have no block lookup, so none is embedded. The pages were edited in place, since regenerating them needs the URA key. On a synthetic URA dataset the in-place edit and the updated generator produce identical pages, so the monthly refresh keeps the block. Checked with `npm run check` (1,304 tests passing) and the District 9 page at 375px and 1280px. The meta descriptions were not changed: most are already 148 to 153 characters.

### Contact prompts tied to each guide (C3, `009db83`)

Fifteen guides ended on a generic "Thinking about selling?" box or on nothing. Each now ends on a prompt that asks for the one thing Joe needs to answer that guide's question, with a matching pre-filled WhatsApp message and a related tool or guide. The timeline guide asks for the reader's target move date, the Seller's Stamp Duty guide for the purchase and sale dates, MSR vs TDSR for income and existing debts, and the grants guides for household income and the flat in mind. Both buttons are tagged `insights_<guide>_end` with a lead type, so clicks can be compared by guide. The prompts are kept in one list (`scripts/lib/guide-cta.mjs`); the three guide generators render them and `scripts/apply-guide-ctas.mjs` keeps the five hand-written guides in step. Ten guides already ended on their own topic prompt and are unchanged. A test fails if a new guide is published without a decision on its prompt. The new copy has no fee rates, track record, testimonials or reply-time promises. Checked with `npm run check` (1,308 tests passing) and two guides at 375px.

### Common questions in llms.txt (A7, `30b55fd`)

`llms.txt` now has a "Common questions" section: twelve one-line answers on timing, sale proceeds, valuation, the MOP, Seller's Stamp Duty, selling a condo, renting out, the wait-out period, the income ceiling, the HFE letter, MSR and resale grants. Each answer is copied word for word from the linked guide's FAQ markup, which matches the visible answer on the page. The generator reads the answer from the guide, so the two cannot drift: `npm run check` fails when a guide's answer changes until `llms.txt` is regenerated, and generation fails if a question disappears. Answers are rules and process only. None covers market figures or Joe's own fees.

### Reviewed dates on the HDB selling guides (A5, `a1a6027`)

Four guides had no visible reviewed date. Three were rechecked against HDB, IRAS, CPF Board and CEA on 16 November and now end on a "Reviewed 16 Nov 2026" line naming the official pages. Their modified dates, feeds and sitemap entries moved to match:

- **How long to sell an HDB flat:** the line on missing the matching-submission window now says what HDB says. The application lapses, and both parties must apply and pay the fees again. The fix also covers the FAQ answer and the FAQ hub.
- **How to sell an HDB flat:** adds HDB's $38.30 fee to register a mortgage discharge, which applies only where the lease has been issued.
- **Sell HDB first or buy condo first:** no content change. The MOP, ABSD remission, CPF and extension-of-stay points were still current.

The fourth, the commission guide, was left without a date; see "Needs Joe". The audit's suggested key-facts box at the top of each guide was not added. Checked with `npm run check` (1,308 tests passing).

## Left for next time

### Needs Joe

- **Item 4:** "$200M+ Transacted", "$8M+ Secured Above Valuation", "500+ properties sold and rented" and "buyer within 4–8 weeks" are stated without a basis. The HDB lander headline reads "Sell above valuation." Decide which can be evidenced and what wording to use.
- **Guide end boxes:** three guides were left out of the new contact prompts because their end boxes need your say. The commission guide's box reads "what the 2% actually funds", which states a fee rate. The HDB valuation and after-MOP guides end on a box signed "16+ yrs · 500+ properties sold and rented" (see item 4). Once you decide on those, they can get topic prompts like the other guides.
- **Commission guide review:** it was not given a reviewed date, because its fee and service figures are part of item 4. It also says HDB endorsement happens online within 6 days of the SMS notification. HDB's current page instead says documents are ready about 3 weeks after acceptance, with fees due within its notice period. CEA's rules quoted in the guide are still current. Decide on the figures, and the guide can be corrected and dated.
- **Item 9:** create and verify a Google Business Profile. It then gets linked from the footer and structured data.
- **Towns:** name the four to six towns Joe transacts in most. Town seller pages and a track-record page depend on it.
- **ERA compliance:** confirm "PropertySG" is acceptable as a personal brand, and that +65 8188 1488 is the number registered with CEA.
- **Checklist signup:** enter an email in a checklist box on a guide and confirm it reaches the sheet tagged `inline_checklist`, and whether the follow-up email goes out.
- **New guides:** read the Seller's Stamp Duty, condo and renting-out guides, which are published under Joe's name.
- **Buyer and tenant pages:** read `/buy/` and `/rent/`, also under Joe's name, and confirm he takes on buyer and tenant clients as described.
- **Chinese seller page:** `zh/sell-hdb/` carries the same claims as the English lander and was not reworded.

### Open technical items

- **Refresh workflow:** the monthly town refresh has failed on its last step since September, because the repository setting that lets GitHub Actions open pull requests is off. It still pushes an `auto/estate-refresh-YYYY-MM` branch, but nothing points at it. The October figures were regenerated by hand on 15 November. Turning the setting on (Settings → Actions → General → Workflow permissions) restores the monthly pull request.
- **`origin` remote:** it uses HTTPS with no stored login, so pushes from this machine were made over SSH to the same repository. Switching the remote to SSH would remove the workaround.

### Remaining audit items, in suggested order

1. Town seller pages and a track-record page, once Joe supplies the towns and records (G1, G2).
