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
