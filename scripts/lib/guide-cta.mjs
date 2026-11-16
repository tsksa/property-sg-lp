// End-of-guide contact prompts tied to each guide's topic (AUDIT.md C3).
//
// Guides used to end on one of a few generic boxes ("Thinking about selling?")
// or on nothing at all. Each guide listed here ends instead on a prompt that
// asks for the one thing Joe needs to answer that guide's question, with a
// matching pre-filled WhatsApp message and a related tool or guide.
//
// One source for both kinds of guide:
// - generated guides (seller, HDB loan and HDB grants clusters) call
//   guideEndCtaHtml(slug) from their templates;
// - hand-written guides carry the same block between the guide-cta markers,
//   kept in sync by scripts/apply-guide-ctas.mjs (`--check` in npm run check).
//
// Copy rules (Joe's standing instructions): no fee rates, no track-record
// figures, no testimonials, no promised reply times. Square brackets in a
// WhatsApp message are blanks for the reader to fill in.
//
// Guides with a topic prompt already (hfe-letter, hdb-loan-vs-bank-loan,
// sell-hdb-first, the resale-price, launch and cheapest-flat reports, Q3 URA
// prices, 3Q rental market) are not listed. property-agent-commission,
// hdb-valuation-explained and selling-hdb-after-mop are left as they are:
// their end blocks carry fee or track-record wording that needs Joe's say.

export const WHATSAPP = 'https://wa.me/6581881488';

/**
 * @typedef {object} GuideCta
 * @property {string} heading
 * @property {string} text
 * @property {string} wa        pre-filled WhatsApp message (plain text)
 * @property {string} waLabel
 * @property {string} href      the related tool or guide (root-relative)
 * @property {string} label
 * @property {string} location  becomes data-cta-location="insights_<location>_end"
 * @property {string} leadType
 */

/** @type {Record<string, GuideCta>} */
export const GUIDE_CTAS = {
  'how-to-sell-hdb-flat-singapore': {
    heading: 'Planning to sell your flat?',
    text: 'Send Joe your block, flat type and when your MOP ends or ended. He will go through what recent sales in your block support and the order of the HDB steps for your case.',
    wa: 'Hi Joe, I’m planning to sell my HDB flat. It’s a [flat type] at Block [number], [town].',
    waLabel: 'WhatsApp Joe about your flat',
    href: '/neighbour-prices/',
    label: 'Check your block’s sold prices →',
    location: 'sell_hdb_guide',
    leadType: 'seller',
  },
  'how-long-to-sell-hdb-singapore-2026': {
    heading: 'Working back from a move date?',
    text: 'Send Joe the date you need to move by, with your town and flat type. He will map the sale backwards from that date: when to register your Intent to Sell, list, grant the option and submit the resale application.',
    wa: 'Hi Joe, I need to move by [month and year]. My flat is a [flat type] in [town]. Can you map out my sale timeline?',
    waLabel: 'Send Joe your target move date',
    href: '/valuation.html',
    label: 'Get a free valuation →',
    location: 'how_long_to_sell',
    leadType: 'seller',
  },
  'how-to-sell-condo-singapore': {
    heading: 'Selling a condo?',
    text: 'Send Joe the project, the unit size and roughly which floor. He will look at the recent caveats in your project and talk you through pricing, the option and completion.',
    wa: 'Hi Joe, I’m thinking of selling my condo at [project], about [size] sqft on a [high, mid or low] floor.',
    waLabel: 'WhatsApp Joe about your condo',
    href: '/condo-prices/',
    label: 'Condo prices by district →',
    location: 'sell_condo_guide',
    leadType: 'seller',
  },
  'seller-stamp-duty-singapore': {
    heading: 'Not sure whether SSD applies to you?',
    text: 'Send Joe the date you bought (the date of the option or the sale agreement) and when you plan to sell. He will check the sale against the holding period with you before you commit to a date.',
    wa: 'Hi Joe, I bought my property on [date] and I’m thinking of selling around [month and year]. Does Seller’s Stamp Duty apply?',
    waLabel: 'Ask Joe about your SSD dates',
    href: '/stamp-duty-calculator/',
    label: 'Work out stamp duty →',
    location: 'ssd_guide',
    leadType: 'seller',
  },
  'renting-out-hdb-condo-singapore': {
    heading: 'Thinking about renting out your home?',
    text: 'Tell Joe about the property and when it is free. He will reply with the rent recent tenancies support and what approval you need.',
    wa: 'Hi Joe, I’m thinking of renting out my [HDB flat or condo] in [town] from [month].',
    waLabel: 'WhatsApp Joe about renting out',
    href: '/rent-out/',
    label: 'See how Joe rents out homes →',
    location: 'renting_out_guide',
    leadType: 'landlord',
  },
  'singapore-rental-market-2q-2026': {
    heading: 'Renting out your flat or condo?',
    text: 'Send Joe the property and when it is free. He will reply with the rent recent tenancies nearby support and what approval you need.',
    wa: 'Hi Joe, I’m thinking of renting out my [HDB flat or condo] in [town] from [month].',
    waLabel: 'WhatsApp Joe about renting out',
    href: '/rent-out/',
    label: 'See how Joe rents out homes →',
    location: 'rental_2q',
    leadType: 'landlord',
  },
  '15-month-wait-out-removed-private-owners-hdb': {
    heading: 'Selling private and buying a resale flat?',
    text: 'Send Joe what you own now and the kind of flat you have in mind. He will help you put the purchase and the sale in an order that meets the six-month disposal condition.',
    wa: 'Hi Joe, I own private property and I’m looking at buying an HDB resale flat without the wait-out. Can you help me plan the order?',
    waLabel: 'WhatsApp Joe about your move',
    href: '/buy/',
    label: 'How Joe helps resale buyers →',
    location: 'wait_out_guide',
    leadType: 'buyer',
  },
  'ec-vs-private-condo-2027': {
    heading: 'Weighing an EC against a condo?',
    text: 'Send Joe your household income, your budget and the areas you are considering. He will lay out the EC and private options that fit, with the costs side by side.',
    wa: 'Hi Joe, I’m comparing an EC with a private condo. Our household income is about $[amount] a month and our budget is about $[amount].',
    waLabel: 'WhatsApp Joe about EC or condo',
    href: '/calculator/',
    label: 'Check your affordability →',
    location: 'ec_vs_condo_guide',
    leadType: 'buyer',
  },
  'hdb-income-ceiling-2026-ndr-changes': {
    heading: 'Not sure which ceiling applies to you?',
    text: 'Send Joe who is in your household and whether you are looking at a new flat, a resale flat or an EC. He will go through the ceiling and grants that apply before you apply for your HFE letter.',
    wa: 'Hi Joe, I’d like to check which income ceiling applies to us. We’re a [family or single] household looking at a [BTO, resale flat or EC].',
    waLabel: 'Ask Joe about your ceiling',
    href: '/insights/hfe-letter-singapore-guide.html',
    label: 'Read the HFE letter guide →',
    location: 'income_ceiling_guide',
    leadType: 'hdb_buyer',
  },
  'hdb-loan-eligibility-singapore': {
    heading: 'Want a second look at your loan budget?',
    text: 'Send Joe your household income and the flat price you have in mind. He will check it against the 30% MSR and the HDB loan limits before you apply for your HFE letter.',
    wa: 'Hi Joe, I’d like to check my HDB loan budget. Our household income is about $[amount] a month and we’re looking at flats around $[price].',
    waLabel: 'WhatsApp Joe about your loan',
    href: '/calculator/',
    label: 'Check your monthly instalment →',
    location: 'loan_eligibility_guide',
    leadType: 'hdb_buyer',
  },
  'msr-vs-tdsr-singapore': {
    heading: 'Is MSR or TDSR your limit?',
    text: 'Send Joe your monthly income and your existing monthly debts. He will work out which ratio caps your loan and the price range that leaves.',
    wa: 'Hi Joe, could you check whether MSR or TDSR limits my loan? My income is about $[amount] a month and my existing debts are about $[amount] a month.',
    waLabel: 'Ask Joe which ratio applies',
    href: '/calculator/',
    label: 'Check your affordability →',
    location: 'msr_tdsr_guide',
    leadType: 'buyer',
  },
  'enhanced-cpf-housing-grant-singapore': {
    heading: 'Checking whether you qualify?',
    text: 'Send Joe your household income and the flat you are looking at. He will go through the grants you may qualify for and how they change the cash and CPF you need.',
    wa: 'Hi Joe, I’d like to check which grants we qualify for. Our household income is about $[amount] a month and we’re looking at a [flat type] flat.',
    waLabel: 'Ask Joe about your grants',
    href: '/insights/hdb-resale-grants-singapore.html',
    label: 'All HDB resale grants →',
    location: 'ehg_guide',
    leadType: 'hdb_buyer',
  },
  'hdb-resale-grants-singapore': {
    heading: 'Which grants can you combine?',
    text: 'Send Joe your household make-up, your income and the town you are looking in. He will go through which resale grants you may combine and what that leaves you to pay.',
    wa: 'Hi Joe, I’d like to check which resale grants we can get for a [flat type] in [town]. Our household income is about $[amount] a month.',
    waLabel: 'Ask Joe about your grants',
    href: '/buy/',
    label: 'How Joe helps resale buyers →',
    location: 'resale_grants_guide',
    leadType: 'hdb_buyer',
  },
  'use-cpf-buy-hdb-flat-singapore': {
    heading: 'Planning how much CPF to use?',
    text: 'Send Joe the flat price and roughly what is in your CPF Ordinary Accounts. He will lay out the downpayment, the cash portion and what stays in CPF.',
    wa: 'Hi Joe, I’d like to plan how much CPF to use for a flat around $[price].',
    waLabel: 'WhatsApp Joe about your CPF',
    href: '/calculator/',
    label: 'Check your monthly instalment →',
    location: 'use_cpf_guide',
    leadType: 'hdb_buyer',
  },
  'hdb-downpayment-cash-cpf-grants': {
    heading: 'Working out your downpayment?',
    text: 'Send Joe the flat price and whether you plan an HDB or a bank loan. He will break the downpayment into cash, CPF and grants for your case.',
    wa: 'Hi Joe, I’d like to work out the downpayment for a flat around $[price] with an [HDB or bank] loan.',
    waLabel: 'WhatsApp Joe about your downpayment',
    href: '/calculator/',
    label: 'Check your affordability →',
    location: 'downpayment_guide',
    leadType: 'hdb_buyer',
  },
};

export const CTA_START = '<!-- guide-cta:start (scripts/lib/guide-cta.mjs) -->';
export const CTA_END = '<!-- guide-cta:end -->';

/** The end-of-guide prompt for `slug`, or '' when the guide has none listed. */
export function guideEndCtaHtml(slug) {
  const cta = GUIDE_CTAS[slug];
  if (!cta) return '';
  const tracked = `data-cta-location="insights_${cta.location}_end" data-lead-type="${cta.leadType}"`;
  return `${CTA_START}
<div class="article-cta">
  <h3>${cta.heading}</h3>
  <p>${cta.text}</p>
  <div class="article-cta-actions">
    <a href="${WHATSAPP}?text=${encodeURIComponent(cta.wa)}" target="_blank" rel="noopener" ${tracked}>${cta.waLabel}</a>
    <a class="article-cta-secondary" href="${cta.href}" ${tracked}>${cta.label}</a>
  </div>
</div>
${CTA_END}`;
}
