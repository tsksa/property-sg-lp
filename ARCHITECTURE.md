# joetay.com — Architecture

*Last updated 2026-07-07. Maintained by the architecture loop; update when the shape of the system changes, not for content edits.*

## System shape

**Build-less static site + one serverless function**, deployed by Netlify from `main` (site `propertysg78`, production domain `https://joetay.com`, apex canonical, www→apex 301).

```
Browser ──► Netlify CDN ── 26 static HTML pages (no build step; publish = ".")
   │
   └─POST /api/submit-lead ──► netlify/functions/submit-lead.js
                                  ├─ gates: honeypot → time-on-form → required fields
                                  │         → phone format (SG strict / +CC intl)
                                  │         → email heuristics → rate limit (Netlify Blobs)
                                  │         → reCAPTCHA v3 (fail-open w/ review flag)
                                  ├─ Google Apps Script webhook → Sheets + email
                                  └─ Twilio WhatsApp (3 category templates + fallback)
```

- **Lead capture is the business.** Everything else exists to route people to a form, WhatsApp, or a call.
- CORS on the function is pinned to `joetay.com`, `www`, and `*--propertysg78.netlify.app` (deploy previews). Disallowed origins get `null`.
- Third-party runtime deps: Google Fonts, GA4 (`GT-KVFDZD5V`), Meta pixel (`3279494272146114`) — both consent-gated (`pdpa_consent` in localStorage) and deferred (pixel → idle, reCAPTCHA → first form interaction). OneMap API for postal lookup. An external Synology NAS streams the Newport 360° tours behind click-to-load facades with a WhatsApp fallback.

## Pages

| Cluster | Files | Notes |
|---|---|---|
| Homepage | `index.html` | ~200KB monolith: hero form, valuation popup, FAQ (+schema), reviews, exit popup, dark mode |
| Valuation | `valuation.html` | standalone funnel, inline errors with ARIA association |
| New launches | `new-launches/*.html` (11 + shared css/js) | detail pages share the `pf` form pattern + inline `handleSubmit` |
| Tools | `calculator/`, `neighbour-prices/` | client-side only; neighbour-prices queries data.gov.sg live |
| Content | `insights/*` (4 articles + feeds), `glossary/` | Article schema, Atom/JSON feeds are hand-maintained files |
| Ad landers | `sell/`, `rent-out/` | titles matched to Google Ads copy — **don't rebrand or retitle** |
| Utility | `404.html`, `privacy-policy.html` (noindex), `downloads/` | excluded from indexable-page invariants |

## Conventions (enforced by CI where possible)

- **Brand:** PropertySG is the primary brand (Joe's decision, 2026-07-07). Title suffixes `| PropertySG`; schema entity `@id: https://joetay.com/#agent` named PropertySG with Joe Tay as `founder` (carries the CEA credential). "Joe Tay" stays in person attributions.
- **Every indexable page:** one title, one ≤160-char description, one apex canonical, og:image (+project-specific hero on NL pages), twitter:card, manifest link, skip link → `id="main"`, viewport, hreflang en-SG.
- **Trackers must be consent-gated** and use the canonical IDs — no page-local variants.
- **Never submit real lead forms in testing** — the pipeline sends real WhatsApp messages. Validation-failure POSTs only.

## Quality gates

| Gate | Where | What |
|---|---|---|
| Validate | `.github/workflows/validate.yml` | JSON-LD parse on every page, sitemap/feeds/manifest/function syntax |
| Consistency guard | `scripts/check-consistency.mjs` (`npm run check`, in Validate) | the per-page invariants above; drift fails the build |
| Lighthouse | `.github/workflows/lighthouse.yml` | perf ≥0.85 warn, a11y ≥0.9 **error**, on push to main |
| Canary | `.github/workflows/canary.yml` | live prod every 2h: pages, lead-function preflight/CORS/validation, SEO surfaces, NAS soft-check |

## The build-system question (proposal for Joe — undecided)

The one structural weakness left: **26-way duplication with no templating.** Measured today: the gtag snippet, consent gate, and font stack each exist in 26 copies; the pixel loader in 14; 906KB of HTML total. Every site-wide change is a scripted multi-file edit, and history shows the failure mode (ungated pixel copies, missing manifest links, drift caught by the new guard).

**Option A — stay build-less (status quo).** Zero migration risk; agents/scripts do the fan-out; the consistency guard catches drift. Cost: every cross-page change stays O(26), and the guard only checks invariants we thought to encode.

**Option B — Eleventy with layouts.** One `base.njk` holds head/meta/tracking/footer; pages become content + front-matter. Cross-page changes become O(1). Cost: a real migration (est. 2–3 focused days incl. pixel-perfect diffing of all 26 pages), a build step in Netlify, and every future contributor needs to understand it. Risk is front-loaded and testable (build output can be diffed byte-wise against current pages before switching).

**Recommendation:** B, but only as a dedicated project with the merge queue at zero, a page-by-page HTML diff harness, and Joe's explicit go — not as a loop iteration. Until then, A + the guard is a sound steady state.

## Parked / known items

- `#22` privacy-policy legal wording — needs Joe's review
- `#70` service worker — unblocked (404 page exists) but parked pending a decision on offline behavior
- GitHub Pages duplicate at `tsksa.github.io/property-sg-lp` — **disable in repo Settings → Pages** (Joe)
- Google Business Profile — not created; biggest remaining local-SEO lever
- CSP header — report-only proposal pending
- Tour assets on the NAS — CDN/object-storage migration if Joe wants them first-party
