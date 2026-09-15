# Audit — "Search - HDB Seller - Singapore"

Window: 8 Jun – 5 Sep 2026 (90 days). Source: Google Ads API, read-only. Raw dump: `audit-2026-09-06-hdb-seller-90d.txt`.

## Headline numbers

| | 90 days |
|---|---|
| Impressions / clicks | 14,418 / 714 (CTR 4.95%) |
| Cost | SGD 2,523.46 (CPC 3.53) |
| Conversions (as tracked) | 34 → CPA SGD 74.22 |
| Impression share | **12.1%** |
| Lost to **rank** | **66.9%** |
| Lost to budget | 21.1% |
| Top-of-page / abs-top share | 10% / 10% |

Settings: Maximize Conversions, **no target CPA**; SGD 20/day; Search network only; Singapore, presence-based. One ad group, 53 keywords (22 broad / 21 phrase / 10 exact), two RSAs, 170 campaign negatives, 0 ad-group negatives.

## Finding 1 — the conversion signal is poisoned (most important)

Conversions = lead-form submits + click-to-call, each valued at a flat SGD 50, with **no qualification step**. The 90-day search-term data shows who is actually "converting":

| Converting search term | Cost | Conv | Intent |
|---|---|---|---|
| hdb register check | 63.27 | 1 | HDB e-service |
| how to check hdb registration | 61.51 | 1 | HDB e-service |
| enquiry on authorised tenants | 36.32 | 1 | HDB e-service |
| hdb registration | 26.82 | 2 | HDB e-service |
| how to check my hdb registration | 18.57 | 1 | HDB e-service |
| how to check my registered hdb address | 12.49 | 1 | HDB e-service |
| write to hdb | 10.48 | 2 | HDB e-service |
| singapore housing and development board | 6.95 | 1 | HDB e-service |
| e services hdb | 5.59 | 1 | HDB e-service |
| hfe application | 3.16 | 1 | HDB e-service |
| hdb residential check | 2.55 | 1 | HDB e-service |
| house valuation singapore | 24.74 | 1 | **seller** |
| annual value of property (+ singapore) | 16.70 | 2 | IRAS / owner |
| 4 room resale flat singapore price | 1.81 | 1 | seller-ish |
| my property | 3.97 | 1 | ? |

**13 of 18 visible conversions came from people trying to reach the Housing & Development Board**, who submitted the form thinking it was HDB. Visible terms cover ~58% of spend, so extrapolated: roughly **60% of the 34 "conversions" are junk**, and the honest CPA on real seller leads is nearer **SGD 180** than SGD 74.

Why it matters beyond wasted money: the campaign runs **Maximize Conversions**. Smart Bidding is being trained on these junk submits, so it deliberately bids up HDB-admin queries because they "convert". That is why the keyword **`hdb enquiry` [PHRASE] is the #2 spender (SGD 480, "11 conversions", CPA 43)** — it is the algorithm's favourite, and it is almost pure junk. The HDB-admin cluster is ~SGD 460 of visible spend (~SGD 800 extrapolated), about a third of the budget.

The 170 negatives show real prior effort (`hdb login`, `hdb singpass`, `hdb portal`, `hdb hotline`, `hdb registration check`…) but variants keep leaking (`hdb registration`, `check authorised tenants`, `write to hdb`, `hdb feedback`, `e services hdb`). Negatives cannot win this — the keyword `hdb enquiry` *invites* the traffic.

## Finding 2 — the landing page is wrong for every keyword

Both ads display the path `joetay.com/sell-hdb/singapore`. The **final URL is the bare homepage** and `/sell-hdb/singapore` returns **404**. The homepage h1 is *"Sell above valuation. Rent in under 2 weeks."* and the page covers HDB, condo, landed and rentals.

Result: **Landing Page Experience is BELOW AVERAGE on every keyword that has a Quality Score.** No exceptions.

## Finding 3 — Quality Score 1–3, and rank is the real ceiling

| Keyword | Match | QS | Exp. CTR | Ad rel. | LP exp. | Cost | Conv |
|---|---|---|---|---|---|---|---|
| recommended property agent singapore | BROAD | **1** | below | below | below | **1,045** | 15 |
| hdb enquiry | PHRASE | 2 | below | avg | below | 480 | 11 |
| selling your hdb flat | BROAD | 2 | below | avg | below | 67 | 0 |
| best hdb agent | BROAD | 5 | avg | above | below | 101 | 1 |
| HDB agent Singapore | PHRASE | 3 | below | above | below | 54 | 1 |
| sell my HDB | EXACT | 3 | below | above | below | 29 | 0 |

`recommended property agent singapore` on **broad match at QS 1 consumes 41% of spend**. Its 15 conversions are agent-shoppers (comparison traffic) and QS 1 means Google charges a heavy premium per click. The broad match is what drags in `stclassifieds` (SGD 46, a classifieds site), `cea singapore`, `real estate agent singapore`, `d26`.

**67% of eligible impressions are lost to rank, versus 21% to budget.** Rank = bid × Quality Score. Raising the budget with QS 1–3 buys more expensive junk; fixing QS recovers three times as much reach for free. This reverses the earlier "raise the cap" suggestion — not yet.

## Finding 4 — one ad group, one generic ad, three intents

All 53 keywords sit in "Ad group 1" spanning three intents: *sell my HDB*, *find an HDB agent*, *hdb enquiry*. One RSA cannot be relevant to all three, hence Expected CTR and Ad Relevance mostly below average.

Two RSAs, opposite results:

| | Ad A (generic agent) | Ad B (HDB-specific) |
|---|---|---|
| Strength | GOOD | AVERAGE |
| CTR | 6.45% | 3.70% |
| Cost | 1,450 | 1,073 |
| Conversions | 13 | **21** |
| CPA | **111.6** | **51.1** |

Google is serving A more (better CTR) while B converts at less than half the cost. Ad A's headlines barely mention HDB ("Singapore Real Estate Pro", "$200M+ Properties Sold", "Trusted Real Estate Agent").

Defects in Ad A:
- Description 4 is **truncated live**: *"Free 30-min consultation. CEA Licensed R009618D. Di"* — ends mid-word.
- Headline **"Honest Pricing · No Fees"** — an agent charges commission; this contradicts the callout "No Hidden Fees", invites fee-shoppers (whom the negatives `no commission`, `low commission`, `discount commission` try to exclude), and is a substantiation risk.

## Finding 5 — two disapproved assets

| Asset | Reason | Fix |
|---|---|---|
| CALL — 8188 1488 | `UNVERIFIED_PHONE_NUMBER` | Number must be visible on the landing page, or verify via Google Business Profile |
| CALLOUT | `SYMBOLS` | Remove the symbol (likely `·`, `&` or `$`) or delete the callout |

Approved and live: 8 sitelinks, 3 callouts, business name, logo.

## Finding 6 — segments (small samples, treat lightly)

- **Devices**: mobile is 90% of spend, CPA 73 vs desktop 84. Nothing to change.
- **Hours**: 00:00–06:00 = 67 clicks, SGD 277, 2 conv (CPA 138) vs ~74 daytime. Candidate for a −30% overnight bid adjustment once conversions are clean.
- **Days**: Friday/Saturday CPA ~50–55, Monday 116. Noise-level.
- **Geo**: Central Area top spend (369, 5 conv). Bukit Batok (100), Yishun (57), Serangoon (57) zero conversions — too few to act on.

## What to do, in order

### Now (Ads UI, no code)
1. **Pause `hdb enquiry` (phrase + exact).** Single highest-leverage change.
2. **Add negatives**: `[hdb]`, `[housing and development board]`, `[housing development board]`, `"registration"`, `"registered"`, `"authorised tenants"`, `"authorized tenants"`, `"e services"`, `"eservices"`, `"write to hdb"`, `"hfe"`, `"feedback"`, `"residential check"`, `"stclassifieds"`, `"cea"`, `[d26]`. (`registration` "converted" — those were junk; safe.)
3. **Ad A**: fix the truncated description; drop "No Fees"; make headlines HDB-specific — or pause it and let B run.
4. **Fix both disapproved assets** (call number verification; callout symbol).
5. **Change `recommended property agent singapore` and the other generic-agent broads to phrase** — or move them to their own ad group (step 6).

### Next 2 weeks (structure)
6. **Split into themed ad groups** with an RSA each whose headlines echo the keywords: *Sell my HDB* (sell my hdb, selling my hdb flat, hdb selling agent, sell hdb fast) · *HDB agent* (best hdb agent, hdb resale agent, hdb agent singapore) · *Property agent (generic)* on phrase only, or drop.
7. **Build the landing page the ads already advertise: `/sell-hdb/singapore`.** HDB-seller only. H1 for sellers, the $18k-above-valuation proof, the 8-week timeline, WhatsApp CTA, and a form with **one qualifying question** ("Are you the owner of an HDB flat you're considering selling?"). Point both ads' final URL at it. This attacks the one factor that is Below Average on every keyword.
8. **Make the conversion honest**: fire the primary conversion only on a qualified submit (or a lead-quality event), so Smart Bidding learns from sellers, not from people looking for HDB's hotline.

### After ~4 weeks of clean data
9. Add a **target CPA** (~SGD 60–70) to Maximize Conversions.
10. **Then** revisit the SGD 20/day cap — by that point rank loss should have fallen and budget will be the binding constraint.
11. Optional: overnight bid adjustment.

## Caveats
- Search-term data covers ~58% of spend (Google withholds low-volume terms); cluster sizes are extrapolated.
- The "cost/conv improved 190 → 64" figure from the 30-day report is partly junk-driven and should not be read as a real efficiency gain.
- All of the above is read-only analysis; no changes were made to the account, consistent with the Basic Access declaration.
