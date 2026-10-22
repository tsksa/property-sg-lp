# Current QA — 22 October 2026

**Local review passed for the pilot pages and optional homepage film.** The design pilot remains limited to Vela Bay and Pinery. Hosted-preview verification passed for the combined release; production is unchanged and remains a post-merge check. Earlier production checks of PR #472 do not establish deployment of these newer changes. The integrated check before the Azure media replacement passed 1,089 tests with 0 failures. The Azure update passes all 29 homepage and publish-directory checks; media validation is recorded below. The publish-directory build also passed; generated sitemap output is excluded from the PR.

## Browser evidence

- Vela checked at 1280×900 and 390px wide; Pinery at 390px and 320px, with no horizontal overflow in the Pinery checks. The enquiry fields retain visible labels and the complete project-specific unit-mix choices. An empty Vela submission focuses the name field without sending a lead.
- Homepage film checked on desktop and mobile: Play advances the film, Pause stops it, switching format restores the poster, and the transcript stays available. Browser network recording showed no MP4 requests before explicit Play; the video has no initial source. Enabling reduced motion stops playback. Dark-theme CSS was inspected and a screenshot retained.
- Evidence folder: `/Users/andylau/website-audits/joetay-2026-10-22/followup-release/`. Captures: `vela-pilot-desktop.png`, `vela-pilot-mobile.png`, `vela-pilot-form-desktop.png`, `pinery-pilot-mobile.png`, `pinery-pilot-form-mobile.png`, `homepage-motion-desktop.png`, `homepage-motion-mobile.png`, and `homepage-motion-dark.png`.

## Hosted preview — prior silent version

- PR #456 preview at code commit `1f259e8`: Vela at 1280px and Pinery at 390px show the pilot, one form and no horizontal overflow. The mobile film reaches readyState 4, plays, replays and pauses.
- Google/Meta requests are absent before opt-in, present after acceptance, and absent after withdrawal/reload. Missing or foreign price-alert origins and cross-site metadata return 403; trusted empty payload reaches 400 validation. No real lead or subscription was sent.
- Analytics loader, motion player, pilot CSS and both MP4s match local hashes. Preview responses carry `X-Robots-Tag: noindex`. Pricing #474 shows $2.842m from the 35 available Pinery units in its dated feed.
- Evidence: `hosted-verification.json`, `preview-pricing.json`, `preview-vela-desktop.png`, `preview-pinery-mobile.png` and `preview-pricing-474.png` in the current evidence folder.

## Code and media verification

- Independent review passed 110 targeted motion, enquiry, project-page and pricing tests. All five bespoke enquiry handlers match merged PR #472 byte for byte, retaining the 3-second submission floor, duplicate guards, explicit success acknowledgement and error recovery. The delayed old-play rejection bug is fixed and covered by a deferred-promise regression.
- Read-only generator inspection found stable second-pass output for all 27 project pages, with the pilot transformation unchanged on all 27. Vela, Pinery and all five bespoke pages match generated output exactly. Eleven non-pilot pages differ only by one blank line; no content or behavior drift was found.
- Original silent media: desktop 801,307 bytes at 1280×720; mobile 871,633 bytes at 720×1280. These 16-second H.264/yuv420p files are superseded by the narrated exports below. They reuse existing homepage imagery, Joe’s photo and self-hosted fonts, with no new property or outcome claims. Playback is optional, with lazy posters and a text transcript.
- Test log: `/Users/andylau/website-audits/joetay-2026-10-22/evidence/combined-independent-review-tests.log`. Generator evidence: `evidence/combined-generator-idempotence.json` in that audit folder. These local checks do not establish successful real lead delivery, indexing changes or conversion gains.

## Azure Speech narration — current 22 October update

- Regenerated the approved script with the user's Azure Speech resource in `southeastasia`, using the prebuilt `en-SG-WayneNeural` voice and official REST API. Authentication and regional voice availability succeeded. The credential was supplied through a hidden process input and was not stored in source, assets, configuration or logs.
- Eight 48 kHz PCM sentence clips were aligned to the existing four scenes. Speech speed is unchanged after synthesis; only surrounding silence is trimmed, with 80 ms before and 150 ms after detected speech retained. Captions are timed from these clips, not copied from the earlier Edge output. Final cue: 15.259 seconds.
- Both 16-second exports copy the original H.264 video: desktop 896,657 bytes at 1280×720; mobile 966,983 bytes at 720×1280, each with mono 48 kHz AAC. New `-azure.mp4` and `-en-azure.vtt` URLs avoid cached earlier narration. Only player asset URLs and corresponding expectations changed; playback behavior and the public transcript remain the same.
- Independent media review confirms unchanged video packet hashes, matching AAC audio across formats, clean decode, -18.35 LUFS integrated loudness and -2.65 dBTP true peak with no clipped samples. The final assembled clip ends at 15.309 seconds, leaving 0.691 seconds of padding.
- 23 homepage/motion checks and 6 publish-directory checks pass. JavaScript syntax and diff checks pass. Provider scripts and source/export metadata are retained outside the repository in `/Users/andylau/website-audits/joetay-2026-10-22/motion/azure-narration/`.
- Human listening review of accent, Joe's name and pacing remains outstanding. Azure preview commit `9d1efc8` passed at 1280px and 390px with visible captions, readyState 4 and unmuted playback; media/VTT/player hashes match local bytes and preview responses are noindex. No MP4/VTT is requested before Play. Evidence: `motion/azure-narration/hosted-verification.json`, `preview-desktop.png` and `preview-mobile.png`.
- After deployment the user reported a load error in an already-open preview. All three former voiced asset URLs returned 404 while the current Azure assets returned 200. Added five exact same-site 200 rewrites for both original silent filenames, both earlier voiced filenames and the earlier caption URL. This preserves cached-player compatibility without duplicated media. The routing regression and canonical generator checks pass; live GET/range verification follows deployment.

## Earlier Singapore English narration — Edge prototype

- Added prebuilt Microsoft `en-SG-WayneNeural` narration using Edge online speech through an isolated `edge-tts` 7.3.1 environment. No Azure Speech account or resource was configured; this is not offline speech or a clone of Joe's voice. The public player discloses AI-generated Singapore English narration.
- New voiced URLs prevent a cached silent file being reused. Desktop is 894,733 bytes at 1280×720; mobile is 965,059 bytes at 720×1280. Both are 16 seconds with mono 48 kHz AAC audio. The original H.264 bitstreams are preserved without recompression. All four scenes contain speech; measured true peak is -0.9 dBFS with no full-scale clipping.
- Eight English caption cues match the exact narration and fit within the four scenes. The transcript separately identifies narration and on-screen copy. The final cue ends at 15.299 seconds, before the film ends.
- Local Chrome at 1280px and 390px: no initial media source or caption track; network recording shows no MP4/VTT before Play. Explicit Play reaches readyState 4 with `muted=false`, and captions are visibly rendered (track readyState 2). Pause and Replay work. A native mute choice survives Replay and switching to the mobile format. Reduced motion stops playback and restores the poster. No horizontal overflow at 390px or 320px.
- Hosted preview at application commit `9c0aea4` (deploy `6ada10225a1b3d55e0669c0d`) also passed at 1280px and 390px: explicit playback reaches readyState 4 unmuted, captions visibly render and the phone layout has no overflow. Player, both voiced MP4s and VTT match local bytes; MIME types are correct and all preview asset responses carry noindex. Screenshots: `followup-release/preview-homepage-voice-desktop.png` and `preview-homepage-voice-mobile.png`.
- Independent read-only media/player review found no actionable issues; all eight motion regression tests pass. No auditory listening review was performed, so accent naturalness and the pronunciation of Joe's name still need human review.
- Evidence: `followup-release/homepage-voice-desktop.png`, `followup-release/homepage-voice-mobile.png`, and `motion/narration/narration-export.json` under `/Users/andylau/website-audits/joetay-2026-10-22/`. Reproducible synthesis and assembly scripts are retained in that narration folder.

---

# Historical — 5 October 2026 Vela Bay and Pinery pilot QA

The observations, test counts and PR #456 preview checks below are retained historical evidence. They do not establish the state of the combined 22 October release.

Historical result: passed

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
