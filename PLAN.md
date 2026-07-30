# HomeLah Property Portal Phase 1 Plan (JOE-77)

## Objective

Build Phase 1 of HomeLah as a mobile-first Singapore property listing portal where agents publish compliant listings, buyers and tenants discover them through URL-driven search, and enquiries route to the correct agent with WhatsApp as the primary call to action.

## Confirmed Decisions

- Working name: **HomeLah**.
- Hosting: Vercel.
- Database, auth, and storage: Supabase Postgres, Supabase Auth, and Supabase Storage.
- Framework: Next.js App Router with TypeScript.
- Styling: Tailwind CSS with shadcn/ui primitives.
- ORM: Drizzle ORM with SQL migrations committed to the repo.
- Maps/geocoding: OneMap, with authenticated API credentials when available and safe fallback behavior.
- Analytics: GA4 events plus first-party listing event rows.
- Agent login: invite-only email and password, no public signup in Phase 1.

## Acceptance Criteria

- Agents can sign in and create, edit, publish, unpublish, and delete listings.
- Publishing is blocked unless owner consent is recorded at the database level.
- Each public listing displays the responsible agent's CEA name, registration number, agency, and agency licence number.
- Admin photo upload supports multiple images, resizing to WebP, ordering, floorplan marking, and deletion.
- Buyers and tenants can search live listings with shareable URL filters.
- Listing detail pages include a gallery, key facts, map, SEO metadata, JSON-LD, agent compliance details, enquiry form, and sticky WhatsApp CTA on mobile.
- WhatsApp taps are logged before redirecting to a prefilled `wa.me` chat.
- Enquiry and valuation forms enforce SG mobile validation, honeypot protection, per-IP rate limits, disposable-email blocking, and explicit unticked PDPA consent.
- Admin users can see enquiries, update enquiry pipeline status, and view per-listing stats.
- The site includes privacy policy, terms, sitemap, robots, canonical URLs, Open Graph images, and listing JSON-LD.
- Seed data includes 12 clearly fake demo listings across HDB, condo, landed, and commercial property types.
- Definition of done passes on Joe's phone: add listing with photos in admin, find via search, tap WhatsApp into a prefilled chat, then see enquiry and click events in admin and GA4.
- Lighthouse mobile score on listing pages is at least 90.

## Non-goals for Phase 1

- Public self-serve agent signup.
- Paid subscriptions, paid featured listings, Stripe, or invoices.
- Multi-agency verification workflows beyond invite-only agents.
- Native mobile apps.
- Copying UI, copy, data, or interaction patterns from existing property portals.
- Replacing professional legal review for PDPA or platform terms.

## Architecture

### App

- `src/app/(public)` for public marketing, search, listing, agent, valuation, privacy, and terms pages.
- `src/app/admin` for protected admin dashboard, listing management, media management, enquiry pipeline, and stats.
- `src/app/api` for form submissions, WhatsApp tracking, listing events, search suggestions, postal lookup, uploads, and admin mutations that need route handlers.
- Server Components by default; Client Components only for interactivity such as galleries, forms, upload UI, filters, autocomplete, and admin controls.

### Data

Tables planned for Phase 1:

- `agents`
- `listings`
- `listing_media`
- `enquiries`
- `valuation_requests`
- `listing_events`
- `rate_limits`

Core database guarantees:

- `owner_consent` must be true for published listings.
- PSF is calculated consistently from price and floor area.
- Postal sectors derive districts where possible.
- Search/filter columns are indexed.
- Full-text and trigram search support keyword and fuzzy project searches.

### Integrations

- Supabase Postgres for persisted application data.
- Supabase Auth for invite-only agent login.
- Supabase Storage for production listing media.
- OneMap for postal/address lookup, maps, and exact pin coordinates.
- GA4 for analytics events.
- Vercel for deployments and environment management.

## Build Order

1. **Project scaffold**
   - Create the Next.js App Router app with TypeScript, Tailwind, shadcn/ui, linting, formatting, environment examples, and repository conventions.

2. **Schema and migrations**
   - Add Drizzle schema and migrations for agents, listings, media, enquiries, valuation requests, listing events, and rate limits.
   - Add database checks, generated PSF, indexes, full-text search, and trigram support.

3. **Seed data**
   - Add 12 clearly fake demo listings, fake media, and demo agents with compliant CEA fields.

4. **Shared plumbing**
   - Implement validation schemas, SG phone validation, disposable email blocking, rate limiting, PDPA consent handling, currency/PSF formatters, WhatsApp prefill builder, GA4 helper, and OneMap utilities.

5. **Public site**
   - Build home, search, listing detail, agent profile, sitemap, robots, OG image, canonical URL, and schema.org support.

6. **Lead capture**
   - Build listing enquiry and valuation forms with the full anti-fake wall and attribution capture.

7. **Admin**
   - Build invite-only auth, dashboard, listing CRUD, media upload/reorder/delete, enquiry pipeline, and per-listing stats.

8. **Launch verification**
   - Configure Supabase, Vercel, GA4, and OneMap production credentials.
   - Run smoke tests, phone walkthrough, and Lighthouse mobile checks.

## Testing Plan

- Unit tests for validation, postal-sector district mapping, WhatsApp prefill text, rate-limit helpers, and search-suggestion merging.
- Migration smoke tests against local Postgres.
- Production build before PRs that touch app runtime code.
- Browser verification for public listing, search filters, admin CRUD, upload, forms, and WhatsApp redirect flow.
- Lighthouse mobile runs on representative listing pages before launch.

## Risks and Mitigations

- **OneMap instability or auth changes:** support authenticated credentials and degrade gracefully when keyless responses are thin or flagged.
- **Fake leads:** combine SG phone validation, honeypot fields, per-IP limits, disposable-email checks, and explicit PDPA consent.
- **Compliance drift:** store CEA fields per agent and render them on every listing; enforce owner consent in the database.
- **Performance regressions:** keep maps lazy-loaded, minimize client JavaScript, use SSR/ISR where appropriate, and run Lighthouse checks on mobile.
- **Scope creep into platform mode:** keep Phase 1 invite-only and defer self-serve onboarding, monetization, and verification flows to a separate issue.

## Approval Gate

No application implementation should start until Joe confirms this plan and any paid-service, stack, auth, or payment-design decisions that would change the agreed scope.
