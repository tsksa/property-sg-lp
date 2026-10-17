# Contributing to joetay.com

Most contributions to this repo come from Joe himself (sometimes via
Claude Code sessions like the one that produced PRs #18–#83). External
PRs are welcome but rare — this is a private, commercial site, not an
open-source project.

## Before you open a PR

1. **Search existing PRs.** [PR #18–#83 from June 2026](https://github.com/tsksa/property-sg-lp/pulls?q=is%3Apr) covered a wide audit (a11y, perf, security, SEO, schema, infra). The same finding may already be in flight.

2. **Read the right docs**:
   - `README.md` — site map + lead pipeline overview
   - `SECURITY.md` — for vulnerability reports (don't open public issues)
   - `.env.example` — config variables for local dev
   - `package.json` `engines` — Node version required

3. **For security issues**, follow `SECURITY.md` and `/.well-known/security.txt`. Never open a public issue or PR for an unpatched vulnerability.

## Local development

```bash
git clone https://github.com/tsksa/property-sg-lp.git
cd property-sg-lp
npm install
npx netlify dev
```

The site serves at `http://localhost:8888`. The `submit-lead` Function
endpoint is `/.netlify/functions/submit-lead`.

For local testing without Netlify CLI:

```bash
npx serve .
```

Static pages work; form submissions need `netlify dev` for the Function
proxy.

## Code style

- **Indent**: 2 spaces (enforced by `.editorconfig`)
- **Line endings**: LF (enforced by `.editorconfig`)
- **Quotes**: Mixed — match the file you're editing
- **Comments**: Only when the *why* is non-obvious. Don't restate the code.
- **No build step**: This is a static site. Don't add bundlers, transpilers,
  or CSS preprocessors without a strong reason and Joe's sign-off.

## Commit messages

- **Subject line**: imperative mood ("Add HSTS header", "Fix calendar lazy-load")
- **Body**: explain *why*, not just *what*. Reference WCAG / RFC numbers
  / RFCs / PR links where relevant.
- **Length**: subject line ≤ 72 chars, body wrap at 72 chars.
- **Prefixes** (optional, Conventional Commits style):
  - `deps:` for dependency bumps (Dependabot uses this)
  - `ci:` for `.github/` changes
  - Other commits omit a prefix.

## Pull request review

- **CODEOWNERS** (`.github/CODEOWNERS`) auto-assigns Joe as reviewer.
- **CI must pass** — the `Validate` and `Lighthouse` workflows run on every PR.
- **Accessibility regressions fail the build** — the Lighthouse a11y category has a hard threshold of 90.
- **Risk / blast radius** in the PR template should be filled in honestly. A static-content edit is one thing; a `submit-lead.js` change can break the entire lead capture pipeline.

## What constitutes a good PR

- **Small and focused** — one concern per PR.
- **Test plan filled in** — concrete steps a reviewer can follow.
- **No new dependencies** unless absolutely needed (no build step → fewer deps).
- **No breaking changes** to public URLs without a `301` redirect in `_redirects`.
- **New top-level pages or assets** go in `SITE_ENTRIES` in `scripts/build-publish-dir.mjs`. Netlify deploys only that allowlist, so anything left out is not published.
- **No PII** in commits, comments, or schema (testimonials are exception — they're public quotes with consent).

## What gets declined

- Refactoring for refactoring's sake (no behaviour change, no fix).
- New JavaScript frameworks (React / Vue / Svelte / etc.) — this is intentionally vanilla.
- AI-generated content posted as if human (acknowledge the tool in PR description).
- Anything that depends on a third-party service Joe isn't already using.

## Questions

- General: <joe@joetay.com>
- Security: see `SECURITY.md`
- Property advisory (you reached this page by mistake?): <https://joetay.com/#book>
