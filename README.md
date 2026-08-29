# joetay.com

The marketing site and lead-capture pipeline for Joe Tay — District
Director at ERA Realty Network, CEA-registered Singapore property
advisor (R009618D).

Production URL: **<https://joetay.com>**

---

## What's in this repo

```
.
├── index.html              # Homepage (hero + reviews + booking + FAQ)
├── valuation.html          # Standalone valuation form
├── privacy-policy.html     # PDPA disclosure (see PR #22 for accuracy fixes)
├── 404.html                # Custom 404 with GA4 broken-link tracking
├── humans.txt              # Credits / attribution
├── sitemap.xml             # 23 indexable URLs
├── robots.txt              # Crawl rules
├── site.webmanifest        # PWA install manifest
├── sw.js                   # Service worker (offline support)
├── _redirects              # Netlify URL rewrites (legacy paths → canonical)
├── netlify.toml            # Headers, cache, function config
├── .well-known/
│   └── security.txt        # RFC 9116 disclosure contact
├── assets/
│   └── conversion-tracking.js  # GA4 + Meta Pixel + gtag wrap
├── js/
│   └── recaptcha-helper.js     # Client-side reCAPTCHA + honeypot
├── insights/               # Long-form articles (Atom + JSON Feed)
│   ├── feed.xml
│   ├── feed.json
│   └── *.html              # 4 published articles
├── glossary/               # Singapore property term reference
├── calculator/             # HDB affordability calculator
├── sell/, rent-out/        # Google Ads landing pages
├── new-launches/           # 10 project detail pages
├── downloads/              # Lead-magnet PDFs (noindex)
└── netlify/functions/
    └── submit-lead.js      # Form intake + Twilio WhatsApp + Sheets webhook
```

---

## Deployment

- **Hosting**: Netlify (site id in `.netlify/state.json`)
- **Build**: none — pure static HTML/CSS/JS served as-is
- **Functions**: `netlify/functions/submit-lead.js` runs on Node 18+ (see `package.json` engines)
- **CI**: pushes to `main` auto-deploy via Netlify's GitHub integration

---

## Lead-capture pipeline

```
Browser form
   └─→ POST /.netlify/functions/submit-lead
         ├─ Gate 1: Honeypot (silent 200 if filled)
         ├─ Gate 1b: Time-on-form < 3s (silent 200)
         ├─ Gate 2: Required fields (400)
         ├─ Gate 2b: Singapore phone format (400)
         ├─ Gate 3: Disposable / suspicious email (silent 200)
         ├─ Gate 4: Rate limit 3/IP/hr, 1/email/day (silent 200)
         ├─ Gate 5: reCAPTCHA v3 score (silent 200 if <0.5)
         └─ Forward:
              ├─ POST → LEAD_WEBHOOK_URL (Google Apps Script → Sheets)
              └─ POST → Twilio WhatsApp template (Joe's phone)
```

Spam-blocked submissions get logged to `LEAD_SPAM_WEBHOOK_URL` (separate sheet)
or fall through to the main lead sheet with `is_spam: true`.

---

## Environment variables

Set in Netlify → Site settings → Build & deploy → Environment.

| Variable | Required | Purpose |
|---|---|---|
| `LEAD_WEBHOOK_URL` | optional | Google Apps Script endpoint for Sheets sync |
| `LEAD_SPAM_WEBHOOK_URL` | optional | Separate spam-log endpoint |
| `RECAPTCHA_SECRET` | optional | Enables reCAPTCHA v3 enforcement (site key is in `js/recaptcha-helper.js`) |
| `TWILIO_ACCOUNT_SID` | recommended | WhatsApp delivery |
| `TWILIO_AUTH_TOKEN` | recommended | WhatsApp delivery |
| `TWILIO_WHATSAPP_FROM` | recommended | Twilio sender number |
| `TWILIO_WHATSAPP_TO` | recommended | Joe's WhatsApp |
| `TWILIO_NEW_LAUNCH_CONTENT_SID` | optional | Approved template for new-launch leads |
| `TWILIO_SELLER_LANDLORD_CONTENT_SID` | optional | Approved template for sell/rent leads |
| `TWILIO_VALUATION_CONTENT_SID` | optional | Approved template for valuation requests |

Without any env vars set, the function still validates and returns 200/400
correctly — it just doesn't forward anywhere.

---

## Local development

```bash
git clone https://github.com/tsksa/property-sg-lp.git
cd property-sg-lp

# Serve static files (any static server works)
npx serve .

# Run the Netlify function locally
npx netlify dev
```

Function endpoint is `http://localhost:8888/.netlify/functions/submit-lead`.

---

## Tracking

- **Google tag**: `GT-KVFDZD5V` (the numeric GA4 property ID is configured
  separately for reporting)
- **Google Ads** conversion ID: `AW-18046717591`
- **Meta Pixel**: `3279494272146114`
- **PDPA**: disclosure in `privacy-policy.html` covers reCAPTCHA, Twilio,
  Netlify Functions, GA4, and Google Ads conversion tracking.

---

## Search Console growth report

The `Weekly Search Console growth report` GitHub Actions workflow runs every
Monday at **10:15 Asia/Singapore** and can also be started manually. It reads
finalized Google web-search data for two adjacent 28-day windows, ending three
days before the run date.

The report ranks up to ten non-branded Singapore query/page opportunities:

1. clicks down at least 20% from a prior baseline of 5 clicks and 50 impressions;
2. positions 1–10 with at least 50 impressions and CTR below 2%; and
3. positions 4–20 with at least 50 impressions.

That order is also the deterministic priority when one row matches multiple
groups. Recommendations are fixed rules; the workflow does not call an AI API
or change the website. The job summary and the 90-day Markdown and JSON
artifacts contain the same windows, summaries, and ranked rows. Branded
Singapore traffic and global property totals remain separate from the primary
ranking. A valid run with no matches succeeds with an explicit empty state.

Each ranked row is enriched with aggregate GA4 **Organic Search** sessions,
engaged sessions, completed lead-event categories, and contact-intent events
for the same two windows. Search Console still determines the ranking order.
GA4 landing pages are joined by normalized path, and unmatched or unavailable
paths remain visible in report diagnostics. Contact clicks stay separate from
completed leads. Because the GA4 property is shared with another site, every
GA4 request also filters `hostName` to `joetay.com`.

### One-time Google setup

1. In the dedicated Google Cloud project, enable both the **Google Search
   Console API** and **Google Analytics Data API**.
2. Create a dedicated service account and JSON key. Never commit that key or
   create a second key for GA4.
3. In Search Console, open the exact joetay.com property, then add the service
   account's `client_email` under **Settings → Users and permissions** with
   read access.
4. In GA4, open **Admin → Property access management**, add the same service
   account email, and grant it the **Viewer** role.
5. In **GA4 Admin → Data display → Custom definitions**, create:
   - **Lead type** — scope **Event**, event parameter `lead_type`;
   - **Contact method** — scope **Event**, event parameter `contact_method`;
   - **Form ID** — scope **Event**, event parameter `form_id` (used to compare
     homepage form funnels in GA4 Explorations).

   New definitions can take **24–48 hours** to become reportable and do not
   backfill data from before GA4 made them available.
6. Find the numeric GA4 property ID in GA4 Admin. Then in GitHub **Settings →
   Secrets and variables → Actions**, add:
   - secret `GSC_SERVICE_ACCOUNT_JSON`: the complete service-account JSON;
   - repository variable `GSC_SITE_URL`: the exact Search Console property
     identifier, such as `sc-domain:joetay.com` or the exact URL-prefix value;
   - the workflow pins `GA4_PROPERTY_ID` to `535131896`, the joetay.com property
     verified on 26 August 2026 (stream `14658508834`, measurement ID
     `G-1YQE8JN66P`, Google tag `GT-KVFDZD5V`). It intentionally does not read
     the old repository variable, which pointed to a different property.
     Local runs still need `GA4_PROPERTY_ID=535131896` in their environment.

Each configured property must be granted to the service account. Before
querying report data, the workflow checks that the two report-required
dimensions (`lead_type` and `contact_method`) are available. `form_id` supports
manual funnel Explorations and is not part of that workflow gate. A missing
required definition, key, Viewer role, API, or mismatched property fails without
writing a partial report or printing credentials.

Before releasing the reporting repair, verify Viewer access and the two custom
dimensions on **535131896**, not the old property. Do not fall back to the old
property if access fails. After merge, run the workflow and reconcile its organic
sessions and lead categories with GA4 using identical dates and hostname filters.

### Enquiry tracking boundaries

`generate_lead` is a recorded successful form/booking event, not proof of a unique
delivered or qualified enquiry. `contact_click` is contact intent; do not add it
to `whatsapp_click` or form events and call the sum enquiries. Keep newsletter
sign-ups separate using `lead_type`. Changing GA4 key-event settings and verifying
real inbox/CRM delivery are separate release checks; local tests do not do either.

Homepage forms emit one privacy-safe event per observed funnel stage:
`lead_form_start`, `lead_form_validation_error`, `lead_form_submit_attempt`,
`lead_form_recovery`, and `lead_form_submit_success`. Compare their event counts
by `form_id` and `lead_type`; never treat starts or attempts as completed leads.
These events contain only fixed labels and counts, never names, contact details,
field values, validation messages, or provider responses.

The shared conversion helper keeps allowlisted campaign tags and the entry path
in session storage only after cookie acceptance, for up to 30 minutes. Homepage
forms use that context across internal navigation. Declining clears it and stops
helper events. The helper does not read contact fields or persist full URLs or
click IDs; campaign labels must never contain personal information. This focused
change does not redesign the site's pre-choice consent
policy or retrofit campaign persistence into every other lead form.

### Run and interpret it

Open **Actions → Weekly Search Console growth report → Run workflow** for a
manual check after configuration and the custom-dimension availability delay.
Confirm that the GA4 metadata check passes, both sources show the same date
windows, and the job summary matches the downloadable JSON and Markdown
artifacts. Compare organic sessions and at least one lead category with GA4
for the same landing page and dates.

The workflow uses finalized Search Console data only, filters the opportunity
set to Singapore, and excludes queries containing `Joe Tay`, `joetay`,
`PropertySG`, or `Property SG` case-insensitively. GA4 figures remain
aggregate-only: seller/owner, general consultation, new-launch, nurture,
unclassified lead, and contact-intent figures are reported separately.

Search Analytics exposes top rows rather than guaranteeing every query, so use
the report as a prioritized editing queue and verify material changes in
Search Console. It never creates issues, commits, pull requests, content, or
indexing requests.

Run the fixture-only local checks without Google credentials:

```bash
npm run test:search-growth
npm run check
```

---

## Reporting issues / security

- **Bugs / suggestions**: <joe@joetay.com>
- **Security disclosure**: see `/.well-known/security.txt` (RFC 9116)

---

## License

Private — all rights reserved. See `package.json` (`"license": "UNLICENSED"`).
