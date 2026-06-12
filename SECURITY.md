# Security Policy

The canonical disclosure contact and policy for joetay.com lives at
**<https://joetay.com/.well-known/security.txt>** per [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116).

This file mirrors that information so GitHub surfaces the Security
tab and so contributors landing on the repo find the disclosure path
without leaving GitHub.

---

## Reporting a vulnerability

| Channel | When to use |
|---|---|
| **Email**: <joe@joetay.com> | First choice. Plain prose, attachments fine. |
| **WhatsApp**: <https://wa.me/6581881488> | Time-sensitive disclosures where Joe needs to act today. |

**Do not** open a public GitHub issue or pull request for security
vulnerabilities. The issue tracker is configured to route security
contacts away from public visibility (see `.github/ISSUE_TEMPLATE/config.yml`).

---

## What's in scope

- The static site at `https://joetay.com`
- The Netlify Function at `/.netlify/functions/submit-lead` (lead capture)
- The service worker at `/sw.js` (offline cache)
- The signed cookies / JWTs the site sets — currently **none** beyond Google's
  GA4 / Ads conversion cookies, which are out of scope (route to Google's
  vulnerability disclosure programme instead)

---

## What's out of scope

These services are used by joetay.com but operated by third parties.
Report vulnerabilities directly to each vendor:

| Service | Reporting path |
|---|---|
| Google reCAPTCHA v3 | <https://www.google.com/about/appsecurity/> |
| Google Tag Manager / GA4 / Ads | Same as above |
| Meta Pixel (fbevents.js) | <https://www.facebook.com/whitehat> |
| Calendly | <https://calendly.com/security> |
| Twilio (WhatsApp Business API) | <https://www.twilio.com/security> |
| Netlify (hosting + Functions) | <https://www.netlify.com/security/> |
| PropertyGuru / 99.co / SRX / EdgeProp | Each portal has its own contact |

Joe will help triage and route reports against any of these
if you're not sure where to send them.

---

## What I commit to

- **Acknowledge** receipt within 48 hours
- **Provide a triage assessment** (in / out of scope, severity)
  within 5 business days
- **Keep you posted** as a fix is developed — typically resolved
  within 30 days for medium / high severity issues on the site or
  Functions code

For critical issues (active exploit, lead-data exposure, payment
bypass), reach out via WhatsApp and Joe will respond same-day.

---

## What I ask in return

- **Give me a reasonable window** to deploy a fix before public
  disclosure. 90 days is the standard responsible-disclosure timeline;
  shorter if there's evidence of active exploitation.
- **No automated scanning at high request rates** — the Netlify
  Functions are on a paid tier with usage limits. A burst of 10,000
  rapid-fire requests to `/submit-lead` will look like a DoS and may
  be blocked at the edge before Joe sees the report.
- **Be respectful of the people whose data flows through this site** —
  no exfiltration of real lead data even as proof. Use synthetic
  payloads or your own contact details.
