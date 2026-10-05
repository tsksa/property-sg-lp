# Vela Bay and Pinery pilot — design QA

final result: passed

## Visual target and evidence

User selected the recommended combination: option 1 split hero plus option 3 buyer brief below it. The combined reference was shown before implementation.

Source: /Users/andylau/.codex/generated_images/01a1061e-570f-7ed3-8d9f-71d3e2535e8a/exec-d03f8824-e177-4c19-84df-d5de2b581caa.png

Implementation screenshots: /Users/andylau/website-audits/joetay-2026-10-05/launch-page-pilot/vela-desktop.png and pinery-desktop.png, plus vela-mobile.png, pinery-mobile.png and form-validation captures in the same folder.

Final desktop reference and Vela capture are both 1435×1096 pixels, CSS viewport 1435×1096, devicePixelRatio 1. No density normalization or image stretching. Light theme, initial page, no form data. Source and implementation were opened together in one comparison input. Text and individual controls are legible at original size, so no separate crop was needed. Pinery uses the same structure with its own existing image and content; its longer project title naturally occupies two lines.

## Comparison history and findings

Initial Vela capture: vela-desktop-v1.png at 1440×1100. Compared with the source at its native 1435×1096; the small viewport difference was not treated as a defect.

- P2, typography: the hero proposition wrapped at “longer-” rather than between its two sentences. Fixed by inserting a presentational line break at the sentence boundary. Increased the project title scale to strengthen hierarchy. The final matched-size capture confirms the clean two-line proposition.
- P2, form styling: the new enquiry-section heading rule enlarged the preserved form heading. Scoped the form heading back to 1.3rem.
- P2, dark-mode navigation: the inherited breadcrumb link colour was too dark. Scoped a readable breadcrumb colour to pilot pages in dark mode; browser-confirmed rgb(193,202,216).
- CTA width refined to 360px maximum on desktop, full available width on phones. Final screenshot confirms its prominence without crowding.

No remaining actionable P0/P1/P2 findings in the pilot changes.

## Five fidelity surfaces

- Fonts/typography: existing self-hosted Fraunces and DM Sans, confirmed from computed styles. Clear heading hierarchy, intentional headline break, distinct Pinery/Vela copy. Chinese Vela name preserved. No truncated project names at tested widths.
- Spacing/layout: cream 40/60 split hero, facts strip, navy three-column buyer brief; mobile stacks name, image, proposition/action, facts and brief. No horizontal overflow at 320, 390, 768 or 1435px. Existing header and breadcrumb retained intentionally, despite the simplified mock masthead.
- Colours/tokens: existing navy/cream/gold palette and accessible emerald primary action. Computed CTA colours #047857 and white. Dark surfaces and breadcrumbs verified. Keyboard focus is a visible 3px solid outline.
- Image quality: original self-hosted developer renders, not generated building imagery. Correct project-specific assets, alt text, responsive source, dimensions and high-priority loading. ERA marks retained; explicit artist's-impression caption added. No new fabricated visual assets or custom icons.
- Copy/content: original metadata, JSON-LD and approved long-form Joe's Takes unchanged. Core fact dates remain distinct from sales-status dates. The new Pinery brief avoids unverified scarcity percentages and uses conditional current-unit checks. Live inventory is not claimed to be freshly verified.

## Interaction and accessibility verification

- Vela facts link scrolls to its existing facts heading. Both enquiry links reach their relocated original forms.
- Empty submissions validate without a lead being sent: Vela focuses the name input; Pinery announces four missing fields and focuses name.
- Each page contains one H1 and one original enquiry form. Form HTML, JSON-LD and approved take sections compare byte-for-byte equal to origin/main.
- WhatsApp CTA URL includes the correct project-specific message. No message sent.
- Keyboard navigation from the facts link reaches the primary CTA with visible focus.
- Both pages checked at 320px; Pinery at 390px and 768px; Vela at 390px and 768px. Primary controls remain usable and 52px high.
- Pinery hero/brief stay visible with page JavaScript disabled. Vela checked with reduced motion. Emulation settings restored.
- Dark mode inspected on Pinery; shared pilot colours checked, then light mode restored.
- Browser error logs checked: no captured console error entries. Python local server does not serve Netlify functions; no live API or successful lead-delivery claim is made. The local reCAPTCHA domain notice is expected and does not substitute for production form testing.

## Automated checks and scope

32 targeted project/gallery tests passed. Full npm run check passed 766 tests. After final CSS/defensive image lookup tweaks, targeted tests and diff check passed again. Regeneration is idempotent. Only the two pilot pages load project-pilot.css; all other project pages remain unchanged.

## Follow-up polish

The mock's larger decorative badge and WhatsApp glyph are intentionally omitted in favour of existing site typography and a clear text action. No rollout beyond the two pilots. Actual lead delivery, Search Console outcomes and conversion improvement are not established by this visual pass.

## Hosted preview verification

Both project pages were opened in the Netlify preview for PR #456 at 1435×1096. Each showed one original form, loaded original hero imagery and fully visible opening content, with no horizontal overflow. Screenshots: preview-vela.png and preview-pinery.png in the evidence folder above.

---

## Historical review retained from main

The following records an earlier mobile-header task; its observations are not a fresh assessment of current theme behavior.

# Shared mobile header design QA

- Source visual: `/Users/andylau/.codex/visualizations/2026/08/31/joetay-mobile-header-audit/06-homepage-menu-open.png`
- Implementation visual: `/Users/andylau/.codex/visualizations/2026/08/31/shared-mobile-header/new-launches-menu-open.png`
- Comparison visual: `/Users/andylau/.codex/visualizations/2026/08/31/shared-mobile-header/comparison.png`
- Viewport: 390 x 844 CSS pixels, 1x density
- State: mobile navigation open, first destination focused

## Full comparison

The shared hub menu matches the homepage reference for the navy palette, Joe Tay and PropertySG lockup, close control, green contextual CTA, link order, dividers, focus treatment, and full-height overlay. The hub header is slightly taller because its existing template padding is preserved. The contextual CTA text is intentionally page-specific (`Book a Call`, `Get My Estimate`, or equivalent) rather than always `Sell with Joe`.

The homepage-only dark-mode control is intentionally absent. The audited internal page families do not expose a dark theme, so adding a non-functional toggle would be misleading.

## Interaction and responsive QA

- Verified at 390 x 844 on New Launches, Neighbour Prices, Insights, Calculator, and Stamp Duty Calculator.
- Menu button, contextual CTA, and every destination measure at least 44 CSS pixels high.
- The first menu destination receives focus on open; Escape closes the menu and restores focus to the toggle.
- Body scrolling is locked while open, the panel fills the remaining viewport, and no horizontal overflow occurs.
- At 1024 x 768 the menu closes, the toggle is hidden, and the original desktop navigation remains visible.

## Iteration history

1. Added the shared header assets and page-family generator.
2. Corrected the target-header matcher so exact `topbar` templates are included.
3. Compared the open shared menu beside the homepage reference; no actionable visual mismatch remained.

final result: passed
