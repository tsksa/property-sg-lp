# joetay.com changes — November 2026 audit round

Phase 3 report for the audit in `AUDIT.md`. Covers 13–14 November 2026, commits `b80e03c` to `4edf0e3` on `main` (14 commits), all deployed. The starting point was `29b7cb3`.

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

## Left for next time

### Needs Joe

- **Item 4:** "$200M+ Transacted", "$8M+ Secured Above Valuation", "500+ properties sold and rented" and "buyer within 4–8 weeks" are stated without a basis. The HDB lander headline reads "Sell above valuation." Decide which can be evidenced and what wording to use.
- **Item 9:** create and verify a Google Business Profile. It then gets linked from the footer and structured data.
- **Towns:** name the four to six towns Joe transacts in most. Town seller pages and a track-record page depend on it.
- **ERA compliance:** confirm "PropertySG" is acceptable as a personal brand, and that +65 8188 1488 is the number registered with CEA.
- **Chinese seller page:** `zh/sell-hdb/` carries the same claims as the English lander and was not reworded.

### Open technical items

- **October data refresh:** the town pages will move to October figures through the monthly workflow. The largest page (Pasir Ris) is 66,237 bytes against a 66,560-byte test limit, so that refresh may need the limit or the block adjusted.
- **Condo district pages:** no seller block yet (audit G7).
- **`origin` remote:** it uses HTTPS with no stored login, so pushes from this machine were made over SSH to the same repository. Switching the remote to SSH would remove the workaround.
- **`AUDIT.md` and this file** are not committed.

### Remaining audit items, in suggested order

1. Seller's Checklist offered on the seller guides and town pages (C1).
2. Bottom WhatsApp and Call bar on phones for guides and price pages (U2).
3. Homepage forms: make the final form match the three-field hero form (U5).
4. FAQ hub (A3, G6).
5. Seller guide hub, plus guides on Seller Stamp Duty, selling a condo and renting out (G3, G4, A4).
6. Town seller pages and a track-record page, once Joe supplies the towns and records (G1, G2).
7. Buyer and tenant pages (G5).
