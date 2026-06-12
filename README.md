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

- **GA4** property: `GT-KVFDZD5V`
- **Google Ads** conversion ID: `AW-18046717591`
- **Meta Pixel**: `3279494272146114`
- **PDPA**: disclosure in `privacy-policy.html` covers reCAPTCHA, Twilio,
  Netlify Functions, GA4, and Google Ads conversion tracking.

---

## Reporting issues / security

- **Bugs / suggestions**: <joe@joetay.com>
- **Security disclosure**: see `/.well-known/security.txt` (RFC 9116)

---

## License

Private — all rights reserved. See `package.json` (`"license": "UNLICENSED"`).
