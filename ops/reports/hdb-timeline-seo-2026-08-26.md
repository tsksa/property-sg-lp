# HDB selling-timeline SEO refresh

## Evidence and selection

- Source: [authenticated search-growth workflow report](https://github.com/tsksa/property-sg-lp/actions/runs/32983000663), generated 26 August 2026.
- Current window: 27 July–23 August 2026; comparison: 29 June–26 July 2026.
- GA4 Organic Search, joetay.com: the selling-timeline guide received 6 of the 8 reported landing-page sessions, including 2 engaged sessions. Recorded lead/contact events were zero; this pre-repair window does not establish that no real enquiries happened.
- Search Console, Singapore web: `hdb option fee` returned the glossary at average position 48.3, with 4 impressions and 0 clicks.
- These are small, exploratory signals. No query met the report's 50-impression ranked-opportunity threshold. GA4 organic sessions are not restricted to Singapore and must not be equated with Search Console clicks.
- The window predates PR #355's commission/calculator changes. Keep those pages stable until post-release observations become available; refresh the existing selling guide and its glossary connection now.

## Changes and boundaries

- Preserve the article's canonical URL, title and original publication date.
- Separate buyer-search time from HDB completion after application acceptance.
- Clarify OTP fees, the option deadline, Request for Value responsibility, matching application submissions and conditional extension of stay.
- Add section navigation, native FAQ disclosures with matching structured data, and relevant internal links.
- Keep descriptions and update dates consistent across article metadata, the insights card and both feeds.
- Retain existing enquiry destinations and tracking. No new forms, tracking changes, HomeLah changes, external publishing or ranking promises.

## Primary sources checked

- [HDB resale completion](https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-completion)
- [HDB application process](https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-application/application-process)
- [HDB approval process](https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-application/approval-of-application)
- [HDB resale purchase terms](https://www.hdb.gov.sg/e-resale/resale-purchase-of-an-hdb-resale-flat)
- [HDB Request for Value terms](https://www.hdb.gov.sg/e-resale/valuation-request)
- [HDB extension-of-stay conditions](https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-application/request-for-temporary-extension-of-stay)

## Validation and later evaluation

- `npm run check` passed, including six new timeline/glossary regression tests.
- `git diff --check` passed.
- Local browser: article renders at 1280px without horizontal overflow or an error overlay; clicking the option-fee FAQ reveals its answer. This is not a full mobile or keyboard audit.
- After approved publication, evaluate post-release Search Console query/page impressions, clicks and average positions, plus GA4 engaged organic sessions and separately recorded contact/lead events. Keep country/channel definitions separate and avoid drawing conclusions from a handful of visits.
