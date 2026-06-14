# Linear backfill — PR triage epic + 18 sub-issues

Generated 2026-06-13 from the 193-PR audit. Drop into Linear via either path:

- **CSV importer** (https://linear.app/help/articles/2042842/import-issues) — use the companion file `linear-triage.csv` next to this one.
- **Manual paste-create** — each section below is one issue. Copy the title; paste the body block underneath into the description; set priority + parent per the metadata line.

The epic should be created first (no parent). Then each sub-issue uses the epic's issue identifier (e.g. `TSK-42`) as its parent. Replace `EPIC-PARENT-ID` placeholders after you create the epic.

---

## 🟪 EPIC

### Title
`Web-property enhancement backlog — June 2026 triage`

### Priority
Medium (3)

### Description
```markdown
Outcome of the 2026-06-13 PR audit on `tsksa/property-sg-lp`.

**Starting state:** 193 open PRs.
**Closed as duplicates this session:** 11 (#101, #104, #105, #108, #110, #117, #138, #139, #140, #141, #155).
**Remaining to ship/triage:** 182, grouped under this epic into 18 sub-issues by risk and theme.

## Risk taxonomy
- 🔴 **HIGH** — touches submit-lead function, CORS, response headers, security tracking, service workers (12 PRs across 5 sub-issues).
- 🟡 **MEDIUM** — JS / modal / form behavior, performance, schema rich-results (56 PRs across 9 sub-issues).
- 🟢 **LOW** — single-attribute a11y, metadata, devex, content fixes (114 PRs across 4 sub-issues).

## Recommended merge sequence
1. **Day 1** — all 12 HIGH sub-issues except #70 (service worker). Real bug fixes with measurable impact.
2. **Week 1** — MEDIUM sub-issues, batched per cluster (nl-modal sequence is intentionally ordered; merge in PR-number order).
3. **Week 2+** — LOW sub-issues in title-sorted batches of 10–15, watching Netlify deploy logs.
4. **Parked** — #70 (service worker) until #24 (custom 404 page) is live; #6 (Remotion tutorial video, scope creep).

## Why an epic
192 PRs of mostly-tiny enhancements were piling up without a shared narrative. This epic gives them a unifying merge plan, prevents future duplicate work (we already saw skip-link, og:image, noopener, and reduced-motion each have 2–6 overlapping branches), and lets us track velocity against the backlog.
```

---

## 🔴 HIGH-1 — Security & data-integrity fixes

### Title
`HIGH-1: ship security & data-integrity fixes (4 PRs)`

### Priority
Urgent (1)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Four merge-now PRs that close real abuse / pollution / XSS vectors. Each is small and independent.

| PR | Branch | Why |
|---|---|---|
| https://github.com/tsksa/property-sg-lp/pull/159 | `claude/calendly-postmessage-origin` | Pin `e.origin === 'https://calendly.com'` on the Calendly message listener. Any iframe could otherwise spoof a `generate_lead` event and pollute Google Ads / Meta conversion stream. |
| https://github.com/tsksa/property-sg-lp/pull/167 | `claude/onemap-xss-fix` | Replace `innerHTML` with safe DOM construction on OneMap responses + `encodeURIComponent` the query. Genuine XSS surface. |
| https://github.com/tsksa/property-sg-lp/pull/192 | `claude/getclientip-spoofing` | Prefer `x-nf-client-connection-ip` (Netlify-stamped, unforgeable) over `x-forwarded-for` (client-injectable). Fixes rate-limit bypass. |
| https://github.com/tsksa/property-sg-lp/pull/198 | `claude/cors-origin-whitelist` | Replace `Access-Control-Allow-Origin: *` with explicit echo-back of `joetay.com` + `*.netlify.app` origins. |

**Spot-check before merging #198:** confirm Joe doesn't have an embedded valuation form on any third-party site (PropertyGuru profile, ERA agent page). If he does, add its origin to the allow-list.
```

---

## 🔴 HIGH-2 — International phone (paired)

### Title
`HIGH-2: international phone fix — merge #158 + #190 together`

### Priority
Urgent (1)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Two PRs that **must merge in the same deploy** — they fix the same bug at different layers:

| PR | Branch | Layer |
|---|---|---|
| https://github.com/tsksa/property-sg-lp/pull/158 | `claude/intl-phone-validation` | Client — final-CTA pattern swap when country code changes |
| https://github.com/tsksa/property-sg-lp/pull/190 | `claude/server-international-phone` | Server — `submit-lead.js` accepts `+CC` (non-65) numbers |

If you merge only #158, the client lets international numbers through but the server rejects them with `400 "Please enter a valid Singapore phone number"` — silent lead loss disguised as a validation error.

If you merge only #190, no UI prompts the user to pick a country code so the issue stays invisible.

**Recommended:** GitHub "merge queue" or just merge both within minutes of each other and verify one round-trip with a `+1` number.
```

---

## 🔴 HIGH-3 — Submit-lead reliability

### Title
`HIGH-3: submit-lead reliability fixes (3 PRs)`

### Priority
High (2)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Three independent submit-lead.js fixes that each close a silent-failure mode:

| PR | Branch | Fix |
|---|---|---|
| https://github.com/tsksa/property-sg-lp/pull/171 | `claude/cors-preflight-cache` | Adds `Access-Control-Max-Age: 86400` on OPTIONS responses. Free perf win, zero risk. |
| https://github.com/tsksa/property-sg-lp/pull/191 | `claude/email-heuristic-birth-years` | Bumps digit-cluster threshold `\d{4,}` → `\d{6,}`. Stops rejecting `john1995@gmail.com`. |
| https://github.com/tsksa/property-sg-lp/pull/193 | `claude/recaptcha-fail-open` | Routes missing reCAPTCHA token to `review_required` flag instead of silent 200-drop. Closes silent lead loss for visitors with reCAPTCHA blocked (corporate firewall, ad blocker, regional restriction). |

Order doesn't matter — they touch different code paths in the same file.
```

---

## 🔴 HIGH-4 — Response headers

### Title
`HIGH-4: response headers — HSTS + COOP (2 PRs)`

### Priority
High (2)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Two `netlify.toml` header additions. Both safe; both worth shipping in the same deploy to consolidate cache-key change.

| PR | Branch | Adds |
|---|---|---|
| https://github.com/tsksa/property-sg-lp/pull/23 | `claude/headers-hsts-webp-cache` | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` + immutable cache on `.webp` matching the existing `.jpg` / `.png` rule. |
| https://github.com/tsksa/property-sg-lp/pull/64 | `claude/coop-header` | `Cross-Origin-Opener-Policy: same-origin-allow-popups` — `allow-popups` preserves WhatsApp & Calendly. |

**Note on HSTS `preload`:** the directive is set but doesn't auto-submit. To list on https://hstspreload.org/ you'd register manually. Leaving the header allows browsers to honor it without committing to the preload list (which is hard to roll back).

**Verify after deploy:** `curl -I https://joetay.com/` should show both new headers.
```

---

## 🔴 HIGH-5 — Service worker (parked)

### Title
`HIGH-5: service worker — defer until #24 lands`

### Priority
Low (4)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
| PR | Branch | Status |
|---|---|---|
| https://github.com/tsksa/property-sg-lp/pull/70 | `claude/service-worker-offline` | ⏸️ Parked |

The PR's code is clean (network-first, only same-origin GETs, falls back to cached homepage) — but two reasons to defer:

1. **Depends on `/404.html`** — the precache list includes `/404.html`, which only exists once #24 (custom-404-page) ships. Without it the service-worker install fails silently and offline support never activates.
2. **Hard to roll back** — once a service worker is registered for a domain, bad versions stick in user browsers until you ship a corrective version. Worth waiting until you're explicitly comfortable owning the lifecycle.

Unblock when #24 is merged AND there's an SW kill-switch strategy (`CACHE_NAME` bump + `clients.claim()` is in place — but team should agree on emergency-unregister procedure).
```

---

## 🟡 MED-1 — nl-modal hardening sequence

### Title
`MED-1: nl-modal hardening sequence (11 PRs)`

### Priority
High (2)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Eleven PRs that progressively close every a11y, security, and state-management bug in the new-launches lead modal. Each builds on patterns established by earlier ones — **merge in ascending PR-number order** to avoid conflicts:

#175 → focus trap + focus restore
#177 → hide × from SR, use `closest()` for click delegation
#179 → send `time_on_form_ms` (closes anti-spam gap #162 missed)
#180 → apply close-button a11y pattern to success state
#181 → rebuild modal if previous submit replaced its contents
#182 → attach document `keydown` once across rebuilds
#183 → announce success state + restore focus
#188 → `reportValidity()` before submit (companion to #187)
#196 → aria-label every input + select
#199 → require `project_select` when its row is visible
#200 → require `interest` dropdown for parity with static projectForms

All target `new-launches/new-launches.js`. Merging them out of order will cause merge conflicts. Consider squashing into one deploy.

PR links: #175 #177 #179 #180 #181 #182 #183 #188 #196 #199 #200
```

---

## 🟡 MED-2 — val-popup hardening

### Title
`MED-2: val-popup modal hardening (3 PRs)`

### Priority
High (2)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
The homepage valuation popup gets the same modal a11y treatment as nl-modal. Three PRs, merge in order:

#135 → focus trap + focus restoration
#178 → hide ✕ from SR + explicit `type=button` (parity with #177)
#186 → native HTML5 validation instead of 3× `alert()`

All target `index.html` (valuation popup is inline there).

PR links: https://github.com/tsksa/property-sg-lp/pull/135 https://github.com/tsksa/property-sg-lp/pull/178 https://github.com/tsksa/property-sg-lp/pull/186
```

---

## 🟡 MED-3 — exit-popup a11y

### Title
`MED-3: exit-popup modal a11y (1 PR)`

### Priority
Medium (3)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
| PR | Branch |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/136 | `claude/exit-popup-modal-a11y` |

Brings the exit-intent popup up to the same modal a11y standard as #135 (val-popup): focus trap, focus restore, `role=dialog`, labelled by title. Standalone — no dependencies.
```

---

## 🟡 MED-4 — Form noscript + inline error + aria-live

### Title
`MED-4: form noscript fallbacks, inline errors, aria-live (8 PRs)`

### Priority
Medium (3)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Eight form-UX improvements. Mostly independent — can be merged in any order, but #31 + #123 both swap `alert()` for inline banners and share the banner stylesheet, so merge them in the same deploy.

| PR | What |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/31 | valuation form: inline error banner instead of `alert()` |
| https://github.com/tsksa/property-sg-lp/pull/88 | noscript fallbacks: hero + valuation forms |
| https://github.com/tsksa/property-sg-lp/pull/89 | noscript fallbacks: all 10 new-launches detail pages |
| https://github.com/tsksa/property-sg-lp/pull/90 | noscript fallbacks: sell/ + rent-out/ Google Ads pages |
| https://github.com/tsksa/property-sg-lp/pull/91 | noscript fallbacks: 4 remaining homepage forms |
| https://github.com/tsksa/property-sg-lp/pull/122 | form-success messages → `role=status` |
| https://github.com/tsksa/property-sg-lp/pull/123 | homepage form: inline accessible error banner |
| https://github.com/tsksa/property-sg-lp/pull/174 | `.reveal` content visible when JS is disabled (progressive enhancement) |
```

---

## 🟡 MED-5 — Calculator a11y trio

### Title
`MED-5: calculator a11y + behavior (5 PRs)`

### Priority
Medium (3)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Five calculator-page improvements — three a11y plus two new bug fixes from the 2026-06-12 session.

| PR | Why |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/120 | radiogroup + aria-label on loan-type selector |
| https://github.com/tsksa/property-sg-lp/pull/169 | restore visible keyboard focus indicator (WCAG 2.4.7) |
| https://github.com/tsksa/property-sg-lp/pull/225 | move keyboard focus after smooth-scroll on `/new-launches/` (unblocks skip-link PRs) |
| https://github.com/tsksa/property-sg-lp/pull/226 | debounce calc recalc so `aria-live` doesn't fire per keystroke (~20 redundant SR announcements per typed value) |
| https://github.com/tsksa/property-sg-lp/pull/227 | reflect tenure clamping back into the input (sighted users see clamped value, not stale typed value) |

#226 and #227 are real bugs surfaced during this session's review of `calculator/index.html`.
```

---

## 🟡 MED-6 — FAQ a11y + schema

### Title
`MED-6: FAQ a11y + schema (3 PRs)`

### Priority
Medium (3)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
| PR | What |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/46 | complete ARIA disclosure pattern on homepage FAQ (WCAG 4.1.2) |
| https://github.com/tsksa/property-sg-lp/pull/124 | wire FAQ buttons with `aria-controls` / `aria-labelledby` |
| https://github.com/tsksa/property-sg-lp/pull/163 | align homepage FAQPage schema with visible FAQ text (rich-result safety) |

#46 and #124 likely overlap — read both diffs and merge the broader one, drop the other. #163 is independent.
```

---

## 🟡 MED-7 — Performance

### Title
`MED-7: performance — preconnect, preload, lazy, async (7 PRs)`

### Priority
Medium (3)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Seven LCP / scroll / font performance improvements. Verify Lighthouse hasn't regressed after each batch.

| PR | What |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/34 | prefetch `/valuation.html` from homepage for instant CTA navigation |
| https://github.com/tsksa/property-sg-lp/pull/48 | preconnect to `img.singmap.com` on 11 new-launches pages |
| https://github.com/tsksa/property-sg-lp/pull/49 | preconnect to `googletagmanager` + `connect.facebook.net` |
| https://github.com/tsksa/property-sg-lp/pull/63 | preload hero image on each new-launches detail page (LCP) |
| https://github.com/tsksa/property-sg-lp/pull/68 | passive scroll listener on testimonials parallax |
| https://github.com/tsksa/property-sg-lp/pull/72 | cache parallax cards + `rAF`-throttle scroll handler |
| https://github.com/tsksa/property-sg-lp/pull/106 | async Google Fonts load on valuation / privacy / seller-checklist |

Merge in any order. #68 and #72 both touch the same parallax handler — check for conflicts.
```

---

## 🟡 MED-8 — Schema rich-results

### Title
`MED-8: schema rich-results enrichment (4 PRs)`

### Priority
Medium (3)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
| PR | What |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/21 | populate `hasDefinedTerm` schema on glossary (18 terms) |
| https://github.com/tsksa/property-sg-lp/pull/26 | add `SoftwareApplication` schema to affordability calculator |
| https://github.com/tsksa/property-sg-lp/pull/69 | remove duplicate Mr Ng review from Joe Tay's `Person` schema |
| https://github.com/tsksa/property-sg-lp/pull/156 | add `image` + `publisher.logo` to insights `Article` JSON-LD |

#69 removes content — eyeball before merging. Validate each with Google's Rich Results Test after deploy.
```

---

## 🟡 MED-9 — Misc MED

### Title
`MED-9: misc medium-risk improvements (10 PRs)`

### Priority
Medium (3)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
| PR | What |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/19 | remove fragile deploy-preview image redirects |
| https://github.com/tsksa/property-sg-lp/pull/27 | refresh sitemap `lastmod` dates against actual git history |
| https://github.com/tsksa/property-sg-lp/pull/30 | lazy-load end-of-article CTA author images |
| https://github.com/tsksa/property-sg-lp/pull/41 | **prefers-reduced-motion site-wide (WCAG 2.3.3)** — touches every page, eyeball the global override |
| https://github.com/tsksa/property-sg-lp/pull/52 | Calendly noscript fallback |
| https://github.com/tsksa/property-sg-lp/pull/97 | back-to-top button on glossary + calculator pages |
| https://github.com/tsksa/property-sg-lp/pull/133 | dark-mode toggle screen-reader-friendly (`aria-pressed` + label) |
| https://github.com/tsksa/property-sg-lp/pull/134 | cookie banner: `region` not `dialog` |
| https://github.com/tsksa/property-sg-lp/pull/162 | extend time-on-form anti-spam gate to 12 other lead forms |
| https://github.com/tsksa/property-sg-lp/pull/166 | drop `noindex` privacy-policy.html from sitemap.xml |
```

---

## 🟢 LOW-1 — SEO & metadata

### Title
`LOW-1: SEO + metadata + structured data (24 PRs)`

### Priority
Low (4)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
Single-attribute meta / Open Graph / Twitter / structured-data additions. Safe bulk-merge in batches of 6–8.

PRs: #29 #34 #42 #43 #44 #45 #51 #53 #61 #71 #75 #102 #107 #111 #112 #113 #114 #115 #116 #142 #145 #170 #189 #204
```

---

## 🟢 LOW-2 — A11y attribute additions

### Title
`LOW-2: A11y attribute additions (40 PRs)`

### Priority
Low (4)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
40 PRs adding `aria-hidden` to decorative SVGs, `aria-label` to nav regions, `role="list"` to card grids, `scope="col"` to table headers, `lang="zh"` to Chinese text, radiogroup labels, breadcrumb aria. All are single-attribute changes.

Safe to merge in batches of 8–10. PR descriptions are self-documenting.

PRs: #38 #39 #40 #54 #65 #66 #67 #92 #93 #95 #96 #98 #99 #100 #103 #118 #119 #121 #125 #126 #127 #128 #129 #130 #131 #132 #143 #144 #146 #147 #148 #149 #150 #151 #152 #153 #154 #161 #164 #209
```

---

## 🟢 LOW-3 — Tap-targets + safe-area + content fixes

### Title
`LOW-3: WCAG 2.5.5 tap targets + safe area + content fixes (11 PRs)`

### Priority
Low (4)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
| PR | What |
|---|---|
| https://github.com/tsksa/property-sg-lp/pull/55 | `viewport-fit=cover` so `env(safe-area-inset-*)` actually works |
| https://github.com/tsksa/property-sg-lp/pull/176 | drop `aria-hidden="true"` from honeypot inputs (axe-core spec violation) |
| https://github.com/tsksa/property-sg-lp/pull/205 | new-launches.css: mirror safe-area inset (iPhone X+) |
| https://github.com/tsksa/property-sg-lp/pull/206 | modal close buttons: 32–36px → 44×44 |
| https://github.com/tsksa/property-sg-lp/pull/207 | `.nl-to-top`: 42/38 → 44×44 |
| https://github.com/tsksa/property-sg-lp/pull/212 | `.hero-valuation-link`: enlarge tap target to 44px |
| https://github.com/tsksa/property-sg-lp/pull/4 | rename WhatsApp conversion placeholder |
| https://github.com/tsksa/property-sg-lp/pull/22 | fix privacy policy: PDPA-accurate cookie + third-party disclosure |
| https://github.com/tsksa/property-sg-lp/pull/25 | suppress Google Ads conversions with placeholder labels (50 occurrences) |
| https://github.com/tsksa/property-sg-lp/pull/157 | remove invalid postalCode "SG" from new-launches Residence schemas |
| https://github.com/tsksa/property-sg-lp/pull/20 | remove `REMOVE BEFORE GOING LIVE` editorial-leak comments |

#22 changes legal copy — Joe/legal should eyeball before merge. Others are mechanical.
```

---

## 🟢 LOW-4 — Devex + 404 + skip-link series

### Title
`LOW-4: Devex tooling + 404 + skip-link series (18 PRs)`

### Priority
Low (4)

### Parent
`EPIC-PARENT-ID`

### Description
```markdown
**Skip-link series (3)** — merge in order:
- https://github.com/tsksa/property-sg-lp/pull/33 — homepage
- https://github.com/tsksa/property-sg-lp/pull/36 — 10 mid-tier pages
- https://github.com/tsksa/property-sg-lp/pull/37 — 10 detail + 2 landing pages

**404 + writes** (3):
- https://github.com/tsksa/property-sg-lp/pull/24 — custom 404 page
- https://github.com/tsksa/property-sg-lp/pull/28 — robots.txt: disallow /downloads/
- https://github.com/tsksa/property-sg-lp/pull/18 — ABSD / foreigner / decoupling FAQs

**Devex** (12) — mostly repo hygiene, CI, .editorconfig, package.json metadata, codeowners, etc.
- #9 #32 #57 #58 #59 #62 #74 #76 #77 #78 #79 #80 #81 #82 #83 #84 #85 #86 #87 #35

**Skipped** (1):
- #6 (Remotion tutorial video) — out of scope; reject.
```

---

## After all 18 sub-issues are created

Update the epic body to swap `EPIC-PARENT-ID` references for the actual epic identifier (Linear assigns one like `TSK-42`).

Optional: add a Linear **project** for grouping, and a **cycle** if you want to time-box the HIGH bucket.
