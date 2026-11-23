# joetay.com audit — Phase 1

Audited 13 November 2026 against `main` at `29b7cb3`, which is byte-identical to the live homepage. No site files were changed. This file is not published: the deploy copies an allowlist into `_site`.

## How to read this

- **Stack:** build-less static HTML (129 pages, 126 indexable) on Netlify, with Node generator scripts for the town, district, new-launch and guide pages, and Netlify Functions for lead capture. Checks run through `npm run check`; there is no separate build or lint step.
- **Impact** is High / Med / Low against the goal of WhatsApp messages and form submissions. **Effort** is S (under an hour), M (half a day), L (multi-day).
- Each issue has an ID so you can approve by ID or by the top-10 number at the end.
- The site is already in good technical shape. Most of what follows is compliance exposure, local search intent the site does not yet target, and conversion detail, not broken plumbing.

## What is already right

These were checked and need no work:

| Area | Result |
|---|---|
| Titles, descriptions, canonicals | Every indexable page has a unique title and description and one apex canonical. No duplicates. |
| Headings | Exactly one H1 on all 129 pages; no skipped heading levels. |
| Sitemap and robots | 126 indexable pages, 126 sitemap URLs, all matching. `robots.txt` allows all crawlers, including AI crawlers. |
| Internal links | 0 broken across 129 pages (`scripts/check-internal-links.mjs`). |
| Images | Every `<img>` has `alt`, `width` and `height`. Hero images are responsive WebP. |
| Structured data | All JSON-LD parses. `RealEstateAgent` on 96 pages, `FAQPage` on 113, `BreadcrumbList` on 125, `Article` on 27, `Person` with the CEA credential on 47. |
| `llms.txt` | Present, generated, and states the CEA number, agency and licence. |
| CEA number | `R009618D` appears on all 129 pages. |
| Phone | One number everywhere: +65 8188 1488, for both WhatsApp and calls. |

### Lighthouse, mobile, live site

One run per page with Lighthouse 12.6.1 on a fast laptop, default mobile throttling. Treat these as lab figures: there is no field data in this audit, so INP is not measured (lab Total Blocking Time was 0 ms on every page).

| Page | Perf | A11y | Best practice | SEO | LCP | CLS | Weight |
|---|---|---|---|---|---|---|---|
| `/` | 95 | 100 | 100 | 100 | 2.7 s | 0 | 302 KiB |
| `/hdb-prices/punggol/` | 99 | 100 | 100 | 100 | 1.9 s | 0 | 163 KiB |
| `/sell-hdb/singapore/` | 100 | 93 | 100 | 100 | 1.7 s | 0 | 181 KiB |
| `/valuation.html` | 99 | 100 | 100 | 100 | 2.0 s | 0 | 183 KiB |
| `/insights/how-to-sell-hdb-flat-singapore.html` | 99 | 96 | 100 | 100 | 1.6 s | 0 | 199 KiB |
| `/about-joe/` | 99 | 96 | 100 | 100 | 2.0 s | 0 | 214 KiB |

---

## 1. Local SEO

| ID | File or page | Problem | Fix | Impact | Effort |
|---|---|---|---|---|---|
| S1 | `hdb-prices/<town>/` (26 pages), via `scripts/generate-estate-pages.mjs` | Town pages target "Punggol HDB resale prices" only. Nothing on the site targets seller-intent local searches such as "sell HDB Punggol" or "property agent Sengkang". The seller form sits 15 sections down, under the heading "What would…". | Add a seller block near the top of each town page (H2 "Selling your HDB flat in Punggol?", two lines on how Joe prices from that town's sold data, WhatsApp button with the town pre-filled). Add the phrase to the meta description. Keep the price title, which is what the page ranks for. | High | M |
| S2 | No page exists | No dedicated local seller pages. `/sell-hdb/singapore/` is the only one, and it is an ad lander. | Build `/sell-hdb/<town>/` only for the towns Joe actually works most (needs Joe's list, see G1). Each needs real local substance: Joe's own completed sales there, town sold data, local buyer demand. Without that they are thin doorway pages and should not be built. | High | L |
| S3 | `index.html` title and description | Title is `PropertySG \| Singapore Property Agent — HDB, Condo & Landed`. "Joe Tay" and "ERA" are absent, yet people arriving from WhatsApp shares and referrals search the name. The description lists listing portals instead of a reason to contact. | Title: `Joe Tay, ERA Property Agent Singapore — HDB, Condo, Landed \| PropertySG` trimmed to the 60-character budget the tests enforce. Description: who, CEA number, what he does, free valuation. | Med | S |
| S4 | Google Business Profile | None exists (also noted in `ARCHITECTURE.md`). No Maps link or `sameAs` to one anywhere. This is the largest local-search lever left and the only way to appear in the map pack for "property agent near me" searches. | Joe creates and verifies the profile as a service-area business, with the same name, number and CEA details as the site. Then add the link to the footer and to schema `sameAs`. | High | S (Joe) |
| S5 | `rent-out/index.html` | The only landlord page is an ad lander. Nothing targets "condo rental agent Singapore", "HDB rental agent" or tenant searches. Tenants and buyers have no page at all. | Add organic `/rent-out/` supporting guides (see G4) and a short buyer and tenant page each (G5). | Med | M |
| S6 | `about-joe/`, `sell/`, `sell-hdb/singapore/`, `glossary/`, `zh/about-joe/`, `zh/sell-hdb/` | The "verify my registration" link points to `https://www.cea.gov.sg/aceas/public-register/ea`, which returned 404 on two checks. `llms.txt` uses `https://eservices.cea.gov.sg/aceas/public-register/`, which returns 200. | Point all six to the working URL. Worth one manual click by Joe to confirm, since CEA blocks some automated requests. | High | S |
| S7 | `insights/how-long-to-sell-hdb-singapore-2026.html`, `insights/hfe-letter-singapore-guide.html`, `insights/hdb-resale-grants-singapore.html` | Three HDB source links now return 404 (an OTP notes PDF, an estate-agent letter, the CPF housing grant page). Dead citations weaken exactly the pages that rely on being sourced. | Replace each with the current HDB URL. | Low | S |
| S8 | `zh/` (5 pages) | Chinese descriptions are 63–91 characters, well under what the English pages use. | Rewrite to roughly 70–80 Chinese characters each with the main query and a call to action. **23 Nov (`3206f5d`):** the two `zh/insights/` articles rewritten; seller and About descriptions wait on item 4. | Low | S |
| S9 | `index.html` head | **Withdrawn 13 Nov:** the second `/assets/block-alert.css` link is inside `<noscript>`, which is the correct fallback for the deferred one, not a duplicate. The homepage LCP of 2.7 s (lab) still comes from render-blocking CSS and fonts, not images. | Optional: inline or defer `home-motion.css` and `block-estimate.css`. **Done 23 Nov (`108cb5f`):** `home-motion.css` deferred; `block-estimate.css` kept blocking because it styles the hero form. **23 Nov (`dc4656a`):** homepage font preloads removed, with size-matched fallbacks so the swap does not shift the hero. Local lab LCP 2.44 s → 1.70 s, CLS unchanged at 0.005. Live from the same laptop: median 1.53 s. Lighthouse CI (Linux, US): unchanged at 2.4 s, CLS 0.009. | Low | M |
| S10 | `sell-hdb/singapore/` and `zh/sell-hdb/` → `joe-tay-logo.png` | A 21 KB, 320 px PNG is served for a 36-pixel logo. (Corrected 13 Nov: only these two pages use it. The About portrait is left alone: phones with 2x–3x screens need the 800 px file, so a smaller source saves nothing in practice.) | Serve a 108 px copy. | Low | S |

Image weight overall is fine. Nothing over 300 KB is loaded eagerly; the four 800–950 KB MP4s are `preload="none"` behind a poster.

---

## 2. AEO (ChatGPT, Perplexity, Google AI Overviews)

| ID | File or page | Problem | Fix | Impact | Effort |
|---|---|---|---|---|---|
| A1 | `index.html` `RealEstateAgent` schema | **Withdrawn 13 Nov:** this finding was wrong. The entity already has `sameAs` (ERA, PropertyGuru, SRX), `memberOf` ERA Realty Network Pte Ltd with the licence, and a `founder` linked to the About page `Person`. Only the Business Profile link is missing, which depends on S4. | None until S4. | — | — |
| A2 | `index.html` `aggregateRating` and `review` | The site marks up a 5.0 rating from 8 reviews that were written on PropertyGuru and FindPropertyAgent. Google does not show stars for a business's reviews of itself, and its guidelines say ratings must be collected on the site, not copied from elsewhere. There is no upside and some manual-action risk. | Keep the visible reviews and their source links. Remove `aggregateRating` and `review` from the JSON-LD. Needs your approval because it touches testimonials. | Med | S |
| A3 | No page exists | Answers are spread across 26 guides and 113 FAQ blocks, with no single hub. Answer engines favour one page that answers the question directly at the top. | Build an FAQ hub (`/faq/`) grouping the existing questions by topic (selling, MOP, stamp duty, commission, timeline, renting out), each a two-sentence answer linking to the full guide. Reuse existing answers; write nothing new that isn't sourced. | Med | M |
| A4 | `insights/` | Seller Stamp Duty has no page of its own; it lives inside the stamp duty calculator and one guide. Also missing: how to sell a condo, how to rent out an HDB flat or condo (rules, steps, costs), HDB resale buying steps. | One guide each, in the existing sourced format (see G3, G4). | Med | M each |
| A5 | Guides generally | Guides open with a good direct summary, but most do not have a dated "last reviewed" line next to the byline that matches `dateModified`, and no short "key facts" list at the top. | Add a visible reviewed date and a 3–5 bullet facts box to the guide template. **Key facts boxes added 23 Nov (`8cf81cd`)** on the three HDB selling guides; other guides can reuse `.key-facts`. **23 Nov (`42201e6`):** added to the HFE letter and CPF guides, the two buyer and seller guides with no opening summary; the rest already open with a short-answer box or summary table. The commission guide waits on item 4. | Low | M |
| A6 | `about-joe/` | Strong on credential and photo. Missing: the team of 15 (not mentioned anywhere on the site), the year Joe was first registered, areas he works most, and any transaction history. The `ProfilePage` `dateModified` is still 21 August 2026. | Add these as plain facts once Joe supplies them. Do not estimate them. | Med | S |
| A7 | `llms.txt` | Good. It lists pages but gives no one-line answers to the common questions. | Optional: add a short "Common questions" section with links to the answering guides. | Low | S |

`FAQPage` markup no longer produces rich results in Google for sites like this, but it is still read by answer engines, so keep it.

---

## 3. Trust and compliance

I am not your compliance officer, and ERA's compliance team has the final say. These are the points I would raise with them. CEA's advertising guidance requires that claims be accurate and capable of substantiation, and that advertisements show the salesperson's name, registration number, registered contact number, and the agency's name and licence number.

| ID | File or page | Problem | Fix | Impact | Effort |
|---|---|---|---|---|---|
| T1 | `hdb-prices/*` (27 pages) and `condo-prices/*` (27 pages), via `generate-estate-pages.mjs` and `generate-condo-pages.mjs` | The agency licence number `L3002382K` is missing from 53 pages. Their footer reads "PropertySG · Joe Tay, District Director, ERA · CEA R009618D", with the agency abbreviated and no licence. These pages carry lead forms and WhatsApp buttons, so they are advertisements. | Use the same line as the rest of the site: "Joe Tay · CEA Reg. No. R009618D · ERA Realty Network Pte Ltd · Agency Lic. No. L3002382K". | High | S |
| T2 | `index.html` trust strip | "$200M+ Transacted" and "$8M+ Secured Above Valuation" are stated as fact with no source, date or basis. "Secured above valuation" also implies a repeatable outcome. | Either substantiate each with a basis line and date Joe can evidence on request, or remove. I have no way to verify these, so this is your call. | High | S |
| T3 | `index.html`, `about-joe/`, `sell/`, `sell-hdb/singapore/`, `zh/about-joe/`, `zh/sell-hdb/`, homepage schema | "500+ properties sold and rented" appears on six pages and in structured data. | Same as T2: confirm the figure and the period it covers, and add "since 2010" or similar, or soften to what the CEA public register shows. | High | S |
| T4 | `sell-hdb/singapore/index.html` hero | Headline "Price it right. Sell above valuation." reads as a promised result. Below it: "Recent client: a 4-room HDB sold at $18k above valuation in 3 weeks". One client's result is presented as the pitch, with no "individual result" qualifier near it. | Reword the headline to the method, not the outcome (for example "Price it right from day one."). Keep the case but label it as one client's result. The title is matched to ad copy, so the ad needs the same change. | High | S |
| T5 | `index.html` FAQ and its `FAQPage` schema | "On average, my clients secure a buyer within 4–8 weeks and a tenant within 15 days." An average needs data behind it. | Replace with a sourced market range (the HDB timeline guide already has one) or state the basis. | Med | S |
| T6 | `index.html` testimonials | Section intro says "Real results from real homeowners". One review says "record price, above market valuation". The About page has a clear disclaimer that reviews are individual accounts; the homepage and landers do not. One reviewer is shown as "Verified Client" with no name. | Add the About page's disclaimer line under the homepage and lander reviews. Confirm with ERA whether an anonymous "verified" review is acceptable. No review text would be changed. | Med | S |
| T7 | `sell-hdb/singapore/`, `sell/` | "★★★★★ 5.0/5 · Verified reviews" does not say how many reviews or where they are from. | "5.0 from 8 PropertyGuru and FindPropertyAgent reviews", linked. | Med | S |
| T8 | Site-wide | "PropertySG" is the lead brand in titles, the header and schema. CEA guidance is wary of salesperson brand names that could be read as a separate estate agency. The full agency name and licence are present in most footers, which helps. | Ask ERA compliance to confirm "PropertySG" is acceptable as a personal brand. No code change unless they say otherwise. | Med | S (Joe) |
| T9 | `sell-hdb/singapore/`, `index.html` | "Reply within 1 hour" stated flatly; elsewhere "typically within 1 hour during 9am–9pm". | Use the qualified wording everywhere. | Low | S |
| T10 | Site-wide | Confirm +65 8188 1488 is the contact number registered with CEA, since that is the number that must appear in advertising. | Joe to confirm. No change proposed. | Low | S (Joe) |

Nothing found that looks like a fabricated testimonial, a "guaranteed" sale claim, or a fixed-commission claim. The commission FAQ correctly says rates are negotiable.

---

## 4. UI and UX

| ID | File or page | Problem | Fix | Impact | Effort |
|---|---|---|---|---|---|
| U1 | All pages, `scripts/lib/consent-banner.mjs` | On phones the cookie banner is pinned to the top, directly under the header, and covers the H1 on every page until dismissed. First-time visitors from Google see a cookie notice where the headline should be. On desktop it sits at the bottom. | Anchor it to the bottom on mobile too, as a compact two-button bar. | High | S |
| U2 | Shared-header pages (price pages, guides, calculators, About) | The sticky header has a "WhatsApp Joe" pill, which is good. There is no call option without opening the menu or scrolling to the footer, and the pill is at the top of the screen, the hardest place to reach one-handed. The homepage's floating WhatsApp button is hidden below 720 px. | Add a slim bottom bar on mobile with WhatsApp and Call, shown after the first scroll, hidden while a form field is focused. Keep the header pill. | Med | M |
| U3 | `sell-hdb/singapore/index.html` | Accessibility score 93: low contrast on the eyebrow label and the "Verified" tag, and privacy links distinguishable only by colour. | Darken the two colours; underline in-text links. | Med | S |
| U4 | `about-joe/` section labels; one H3 on the how-to-sell guide | Contrast below 4.5:1 (accessibility 96). | Adjust the colours. | Low | S |
| U5 | `index.html` | Six forms on one page (postal lookup, hero consult, final consult, newsletter, valuation popup, exit popup) with three different field sets. The final form asks for first name, last name, country code, phone and intent; the hero form asks for name, phone and property type. | Make the final form match the hero form (three fields). Review whether both the valuation popup and the exit popup should fire in one visit. | Med | M |
| U6 | `hdb-prices/<town>/` | Pages are long (about 12,000 px on a phone). The lead form is at the very bottom, and its H2 starts "What would…", which gives no cue when scanning. | Covered by S1: move a short contact prompt up under the price summary. | Med | — |
| U7 | `valuation.html` | Three-step form with a required consent tick on step 3. Reasonable. The only friction is that there is no visible "or just WhatsApp me your postal code" alternative beside step 1. | Add that one line with a pre-filled WhatsApp link. | Low | S |
| U8 | `index.html` hero | The three chips ("Sell a property", "Buy a new launch", "Rent out a property") are the first tappable things, ahead of any contact action. Buyers of resale homes and tenants have no chip. | Consider adding "WhatsApp Joe" as a fourth, primary-styled action. | Low | S |

Not verified in this audit: real-device behaviour, keyboard and screen-reader passes, and dark mode. Lighthouse covers only the automated share of WCAG 2.2 AA.

---

## 5. Conversion

| ID | File or page | Problem | Fix | Impact | Effort |
|---|---|---|---|---|---|
| C1 | `downloads/seller-checklist-2026.html` | The Seller's Checklist is offered only in the homepage exit popup, which phones rarely trigger. It is not offered on the seller guides, the town pages or the landers, where sellers actually are. | Add an inline "Get the 2026 Seller's Checklist" box to the eight seller guides and the town pages, delivering by WhatsApp or email. | High | M |
| C2 | Town and district pages | The strongest hook the site has is "what did flats in my block sell for". Town pages link to it only as a small text link. | Embed the postal-code lookup on each town page, pre-scoped to the town. | High | M |
| C3 | Guides (`insights/*.html`) | Guides end with links to more reading. The contact prompt is generic. | End each guide with a prompt tied to its topic (the timeline guide offers "send me your target move date", the commission guide offers "ask for my written fee scope"), with a matching pre-filled WhatsApp message. | Med | M |
| C4 | Site-wide | No proof of recent work a seller can inspect: no past transactions, no current listings. The only evidence is eight reviews and three short case notes. | See G2. | High | L |
| C5 | Landers | "Free 30-minute consultation" is the offer. A seller's real first question is the price. | Test leading with "Free written valuation for your block in 24 hours" on `/sell-hdb/singapore/`. Ad copy must change with it. | Med | S |
| C6 | Lead forms | Leads go to a sheet and WhatsApp. Whether WhatsApp clicks from organic pages are counted by page type was not checked here. | Confirm the GA4 `whatsapp_cta_click` event carries the page template, so the changes above can be measured. | Low | S |

Suggested lead magnets, in order of likely return: (1) the block sold-price lookup with an optional "send me the full report" step, which already exists and is under-used; (2) the Seller's Checklist, already written; (3) a "what's my flat worth" WhatsApp shortcut that asks only for a postal code.

---

## 6. Content gaps

Estates below are placeholders. Joe needs to name the towns he actually transacts in most before any location page is written.

| ID | Page to add | What it is | Impact | Effort |
|---|---|---|---|---|
| G1 | `/sell-hdb/<town>/` for 4–6 core towns | Seller pages built on Joe's own completed sales in that town, the town's sold data, typical days on market from the dataset, and a town-specific WhatsApp prompt. Depends on Joe's list and real cases. | High | L |
| G2 | `/track-record/` (past transactions) and, if wanted, `/listings/` | Completed sales and rentals: town, flat type, month, and only what each client agreed to publish. A listings page needs a routine to keep it current, or it should not be built. Nothing here can be invented; it needs Joe's records. | High | L |
| G3 | Seller's guide hub at `/sell/guide/` or expand `/sell/` | One evergreen page linking the eight existing seller guides in order (price, timeline, MOP, costs, commission, sell-or-buy-first), plus new guides: Seller Stamp Duty explained, how to sell a condo, selling a flat with an outstanding loan or in a divorce or estate. | Med | M |
| G4 | Landlord guides | How to rent out an HDB flat (eligibility, approval, non-citizen quota, occupancy cap), how to rent out a condo, tenancy agreement and stamp duty for leases, landlord tax basics. | Med | M each |
| G5 | `/buy/` and `/rent/` | Short service pages for resale buyers and tenants, the two audiences in the brief with no page today. | Med | M |
| G6 | `/faq/` | The FAQ hub in A3. | Med | M |
| G7 | `condo-prices/<district>/` | Same seller block as S1, for condo sellers. | Med | M |
| G8 | Chinese pages | Only five `zh/` pages exist. The highest-value additions are the valuation page and the how-to-sell guide. | Low | M |

The blog itself is healthy: 26 guides, quarterly market pieces, feeds, covers and schema. It needs the gaps above more than it needs volume.

---

## Prioritised top 10

Quick wins first. Items marked **Joe** need a decision or information from you before I can do them.

| # | IDs | What | Impact | Effort |
|---|---|---|---|---|
| 1 | S6 | Fix the dead "verify my CEA registration" link on six pages. | High | S |
| 2 | T1 | Add the full agency name and licence `L3002382K` to the 53 town and district price pages. | High | S |
| 3 | U1 | Move the mobile cookie banner to the bottom so it stops covering the headline. | High | S |
| 4 | T2, T3, T4, T5 | **Joe:** decide what to do with the unsourced figures ("$200M+", "$8M+ above valuation", "500+", "4–8 weeks") and the "Sell above valuation" headline. I will apply whichever wording you approve. | High | S |
| 5 | T6, T7, T9 | Add the review disclaimer to the homepage and landers, state the review count and source, and use the qualified reply-time wording. | Med | S |
| 6 | A1, A2 | Homepage schema: add `sameAs` and the ERA link; remove the self-reported star rating markup. | Med | S |
| 7 | S3 | Put "Joe Tay" and "ERA" in the homepage title and rewrite its description. | Med | S |
| 8 | U3, U4, S7, S9, S10 | Tidy-up batch: contrast fixes, three dead HDB links, duplicate stylesheet, oversized logo and portrait. | Low–Med | S |
| 9 | S4 | **Joe:** create the Google Business Profile; I then link it from the footer and schema. | High | S (Joe) |
| 10 | S1, U6, C2 | Town pages: seller block and block-price lookup near the top, "selling in <town>" in the description. | High | M |

After those, in order: C1 (checklist on seller pages), U2 (mobile contact bar), U5 (homepage forms), A3/G6 (FAQ hub), G3 and A4 (seller hub and missing guides), G1 and G2 (town seller pages and track record, both waiting on Joe's data).

## Questions for Joe before Phase 2

1. Which four to six towns or districts do you transact in most?
2. For item 4, can you evidence the figures, and for what period? If not, which would you rather drop?
3. Are you content to remove the star-rating markup (item 6)? The visible reviews stay.
4. Has ERA compliance cleared "PropertySG" as a brand name (T8)?
5. Do you want Phase 2 on `main` directly, or on a branch with a pull request per batch? Pushing to `main` deploys to the live site.

**Phase 1 ends here. Nothing has been changed on the site. Reply "go" or "go 1–5" to start Phase 2.**
