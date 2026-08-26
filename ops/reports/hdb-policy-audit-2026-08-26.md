# HDB policy update — 26 August 2026

Scope: joetay.com in `property-sg-lp` only. These are local changes, not a production release. No newsletter has been sent.

## Confirmed rules

- General family ceiling: $16,000; eligible single buying alone: $8,000; eligible extended family: $24,000 with each nucleus within $16,000. Applies to HFE applications from 24 August 2026. Flat-type and household exceptions remain.
- Qualifying new EC ceiling: $18,000, determined by the site's land sale tender closing on or after 24 August 2026, not a buyer's application date. Existing balance units and earlier tender cohorts do not automatically qualify.
- Existing HFE letters: already-eligible holders need no action solely for this change. Previously income-ineligible holders with no flat application may cancel and reapply. Pending pre-24 August applications use the old ceiling unless replaced. A fresh application changes the income-assessment period.
- Next BTO: November 2026; HDB advises complete HFE documents by 25 September. Extra ballot chances per qualifying child begin February 2027, not November 2026.
- PPHS, Fresh Start and Step-Up CPF Housing Grant ceilings rise to $8,000. The listed senior housing/monetisation schemes move to $16,000; scheme conditions remain.
- Separate July announcement: removal of the 15-month private-owner wait for non-subsidised resale purchases without an HDB loan. The 30-month private-property disposal condition remains for subsidised purchases, new ECs and HDB loans.

## Website review and changes

| Surface | Finding / action |
| --- | --- |
| New insight | Explains household limits, EC tender cohort, four HFE transition cases, BTO dates and practical examples. Includes official sources, visible FAQs and matching structured data. |
| Resale grant guide | Replaced old $14,000/$7,000 ceilings; added effective date and extended-family qualifier. |
| HDB loan eligibility guide | Already had revised headline figures. Added effective date, family-nucleus condition and existing-HFE guidance. |
| HFE guide | Added transition cases, new assessment-period warning and November BTO preparation date. |
| EHG guide | Clarifies the separate $9,000 family/$4,500 single-buyer thresholds did not increase with the general ceiling. |
| Loan calculator | Added a visible policy notice in both modes. Clarifies estimates do not determine eligibility or approval. No formula or input-limit change. |
| MOP guide | Corrected two claims implying that selling any HDB flat creates a 30-month wait; distinguishes private-property disposal. |
| Discovery | Added the insight to the article index, JSON/Atom feeds, sitemap, llms.txt and reciprocal article links. |
| Newsletter | Prepared an unsent Markdown draft. Publish the linked article before sending; recipient list and sending need approval. |

Searches covered public HTML and relevant JavaScript/generator sources for income ceilings, old $14,000/$7,000/$21,000 figures, and 15-/30-month wait-out language. Historical transaction prices, worked examples and explicitly labelled previous ceilings were not changed. Older operations notes are not public policy guidance.

## Intentionally unchanged

- HDB repayment formula and 2.6% July–September rate; affordability assessment assumptions (3% HDB assessment floor, 30% MSR, 55% bank-loan TDSR, maximum 75% LTV). The ceiling announcement is not a rate or borrowing-ratio change.
- EHG limits and grant amounts. An expanded CPF Housing Grant income ceiling is not an EHG increase.
- Stamp-duty calculator, BSD/ABSD schedules and private new-launch pricing. The reviewed announcements do not announce changes to these.
- Existing financial-planning simplifications, including the affordability tool's borrower-age model. This update is not a full underwriting or legal-compliance certification.
- Prior uncommitted calculator link-accessibility fix and its regression test are preserved.

## Sources

Read HDB's announcement and both annexes, including rendered PDF pages:

- [HDB income ceilings and family support](https://www.hdb.gov.sg/hdb-pulse/news/2026/increase-in-income-ceilings-and-greater-support-for-families-with-children)
- [Annex A: revised ceilings](https://www.hdb.gov.sg/-/media/hdb-pulse/news/2026/increase-in-income-ceilings-and-greater-support-for-families-with-children/Annex-A.pdf?sc_lang=en&hash=791DCCF1F12CD509C997A5A5831DE08F)
- [Annex B: HFE transition](https://www.hdb.gov.sg/-/media/hdb-pulse/news/2026/increase-in-income-ceilings-and-greater-support-for-families-with-children/Annex-B.pdf?sc_lang=en&hash=05C2364C54C2ED2BBA548DBB3B664555)
- [HDB loan conditions](https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb)
- [HDB EHG conditions](https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/couples-and-families/enhanced-cpf-housing-grant)
- [HDB interest rate](https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate)
- [HDB private-owner wait-out announcement](https://www.hdb.gov.sg/hdb-pulse/news/2026/removal-of-the-15-month-wait-out-period-for-private-residential-property-owners)

Use the current HDB page and annexes over cached search snippets where dates differ. Announced at the 23 August National Day Rally; HFE changes effective 24 August.

## Local verification

- `npm run check`: passed; 225 tests passed, plus generator, sitemap, internal-link and consistency checks. Consistency scan: 81 pages, zero failures.
- `git diff --check`: passed.
- Browser at desktop width: article heading, comparison table, policy content and first Insights card rendered correctly; no horizontal overflow on the article.
- Both calculator modes displayed correctly. Default repayment remained S$1,361.01; S$120,000 over 10 years at 0% produced S$1,000.00 monthly with zero interest.
- Policy note remained visible in both modes. Its link and the existing calculator guide links had persistent underlines.
- No new mobile-device, screen-reader, production or Google-indexing verification was performed. Automated keyboard input did not confirm arrow-key switching in this browser session; no keyboard-handler changes were made.

## Release checklist

- Run `npm run check` and review the diff before committing.
- Preview the new insight and both calculator modes; verify policy links, structured data and discovery surfaces.
- After approval: commit, push and open a PR. Merge/deploy only when separately authorized.
- After production verification: submit the new insight for indexing if quota permits. Sending the newsletter is a separate action.
