# Calculator funnel v2

Deploy code before changing GA4. Preserve the old exploration as a historical
report; its mixed `calculator_engaged` definition is not comparable with v2.

## Event contract

- `calculator_entry_click`: a labelled entry link was clicked, not proof a tool opened.
- `calculator_started`: first input interaction, or explicit valid calculation,
  for a tool in the current page visit. `action=start`.
- `calculator_result_generated`: first valid result rendered after interaction,
  not the initial default render. `action=result`.
- These two stages carry `calculator`, `entry_point=tool_input`, `funnel_version=2`.
- `contact_click` carries the last interacted calculator on that page and
  `funnel_version=2`. This is intent only, not a submitted enquiry. Generic links
  before any calculator interaction are not assigned a calculator.
- Labels: affordability, bto, stamp-duty, renovation-loan, repayment,
  resale_cash_readiness. No financial values are added to events.
- Stages are once per calculator per page visit, not unique people or sessions.
  All tracking remains opt-in. Declined and pre-consent actions are not replayed.
  Reloads start a new visit; do not interpret event counts as users.

## GA4 changes after deployment

1. Verify Calculator, Action and Entry point are event-scoped custom definitions
   mapped exactly to `calculator`, `action`, `entry_point`. Do not duplicate them.
   Inspect why the existing breakdown is `(not set)` before assuming code alone
   repairs historical rows. Custom definitions do not backfill old event data.
2. Create a separate v2 exploration, using only dates after deployment and allowing
   processing time. Do not compare its rates directly with the old exploration.
3. Closed funnel: calculator_started -> calculator_result_generated -> contact_click.
   Each step must include the same fixed calculator value. Use one tab per tool;
   a breakdown alone cannot prevent users crossing between tools in different steps.
   Steps indirectly follow; use a 30-minute step limit and label it explicitly.
4. Do not require a contact click before a form submission. Use a separate outcome
   funnel: calculator_started -> calculator_result_generated -> generate_lead.
   Filter the first two steps to the same calculator. The final event is a later
   site enquiry/booking by that user, not proof the calculator caused it. WhatsApp
   message receipt is not observable as generate_lead in this browser tracking.
5. Inspect raw event reports and device splits before drawing abandonment conclusions.
   Small counts, consent refusal, cross-device journeys and unprocessed dates limit
   interpretation. No synthetic submissions or production events for verification.

## Scope

No UI, formulas, spam filters, provider settings or lead-success behaviour changed.
GA4 configuration is a separate authorized step after the production release gate.
