import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replaceAll('&amp;', '&')
  .replaceAll('&#39;', "'")
  .replace(/\s+/g, ' ')
  .trim();

test('calculator targets HDB loan calculator search intent', () => {
  const html = read('calculator/index.html');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];

  // 19 Oct 2026 report: the generic query "loan calculator" sat at position 11
  // (211 impressions), with "home loan calculator singapore" at 40. The page
  // already handles bank loans, so the title and H1 now say so (JOE-345).
  // 30 Oct 2026 (JOE-470): still 0 clicks at position 10.6. A title that opens
  // with "HDB" tells most "loan calculator" searchers the page is not for them,
  // so it now leads with "Home Loan Calculator Singapore", which also contains
  // the exact phrase "loan calculator singapore", and keeps HDB in view.
  assert.equal(title, 'Home Loan Calculator Singapore: HDB &amp; Bank | PropertySG');
  assert.ok(title.replaceAll('&amp;', '&').length <= 60, `title is ${title.length} characters`);
  assert.ok(description.length <= 155, `description is ${description.length} characters`);
  assert.match(description, /home loan calculator/i);
  assert.match(description, /\bHDB\b/);
  assert.match(description, /monthly repayment/i);
  assert.match(html, /<h1[^>]*>Home loan calculator for HDB and bank loans<\/h1>/);
  // The HDB head term stays on the page in the eyebrow and the guide heading.
  assert.match(html, /<div class="eyebrow">HDB Loan Calculator Singapore<\/div>/);
  assert.match(html, /<h2 id="hdb-loan-guide-title">HDB loan calculator guide<\/h2>/);
  assert.match(html, /<h3>Using it as a home loan calculator for a bank loan<\/h3>/);
  // A private-property buyer must not read the HDB-specific MSR result as exact.
  assert.match(html, /For a condo or other private home, the 30% MSR does not apply/);
  // Bugbot on #473: the copy promised "any home loan" while the term field
  // stopped at 25 years, so a 30-year private-home package could not be entered.
  assert.match(html, /id="repaymentYears"[^>]*max="30"/);
  assert.match(html, /independent planning estimate/i);
  assert.doesNotMatch(html, /official HDB loan calculator/i);
});

test('visible HDB FAQs exactly mirror FAQ structured data', () => {
  const html = read('calculator/index.html');
  const visible = stripTags(html);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');

  assert.ok(faq, 'missing FAQPage structured data');
  assert.equal(faq.mainEntity.length, 14);
  for (const entry of faq.mainEntity) {
    assert.ok(visible.includes(entry.name), `FAQ question is not visible: ${entry.name}`);
    assert.ok(visible.includes(entry.acceptedAnswer.text), `FAQ answer is not visible: ${entry.name}`);
  }
});

test('calculator hands BTO and renovation queries to their own calculators', () => {
  const html = read('calculator/index.html');
  const questions = [...html.matchAll(/<summary>([^<]+)<\/summary>/g)].map((match) => match[1]);
  // JOE-469 WS4: FAQs such as "Is this an HDB renovation loan calculator?" let
  // /calculator/ outrank /bto-calculator/ and /renovation-loan-calculator/ on
  // their own head terms, so no question here names either tool any more.
  for (const question of questions) {
    assert.doesNotMatch(question, /renovation loan calculator/i, `FAQ question competes with the renovation page: ${question}`);
    assert.doesNotMatch(question, /\bBTO\b/, `FAQ question competes with the BTO page: ${question}`);
  }
  assert.ok(questions.includes('Does this include renovation costs?'));
  assert.ok(questions.includes('Can I use this calculator for a new or resale flat?'));
  assert.match(html, /<a href="\/renovation-loan-calculator\/">renovation loan calculator<\/a> instead\.<\/p>/);
  assert.match(html, /use the <a href="\/bto-calculator\/">BTO calculator<\/a> instead\.<\/p>/);
  // The other calculators sit in a visible chip row in the hero, not behind a
  // disclosure, so the hand-off is one click from the top of the page.
  const hero = html.match(/<section class="calc-hero"[\s\S]*?<\/section>/)[0];
  const chips = hero.match(/<p class="calc-tools">[\s\S]*?<\/p>/)?.[0];
  assert.ok(chips, 'missing the other-calculators chip row');
  assert.ok(hero.indexOf(chips) < (hero.indexOf('<details') === -1 ? Infinity : hero.indexOf('<details')), 'chip row must sit outside the disclosure');
  for (const href of ['/bto-calculator/', '/renovation-loan-calculator/', '/stamp-duty-calculator/']) {
    assert.ok(chips.includes(`href="${href}"`), `chip row is missing ${href}`);
  }
  assert.match(html, /Who is eligible for an HDB housing loan\?/);
  assert.match(html, /Is an HDB loan at 2\.6% cheaper than a bank loan\?/);
  assert.match(html, /href="\/insights\/property-agent-commission-singapore.html#buyer-agent-fees"/);
});

test('calculator explains the instalment formula it actually uses', async () => {
  const html = read('calculator/index.html');
  assert.match(html, /How is the HDB monthly instalment \(installment\) calculated\?/);
  assert.match(html, /monthly instalment = P × r ÷ \(1 − \(1 \+ r\)\^−n\)/);
  // The worked figure must come from the tool's own maths.
  const { repaymentEstimate } = await import('../assets/decision-calculations.mjs');
  const { paymentCents } = repaymentEstimate({ principal: 300000, annualRatePercent: 2.6, years: 25 });
  const shown = `$${(paymentCents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`;
  assert.ok(html.includes(`a $300,000 loan works out to ${shown} a month`), `worked example should show ${shown}`);
});

test('calculator body links the HDB loan vs bank loan comparison with descriptive anchor text', () => {
  const html = read('calculator/index.html');
  const guide = html.match(/<section class="calc-guide"[\s\S]*?<\/section>/)[0];
  assert.match(guide, /<a href="\/insights\/hdb-loan-vs-bank-loan-singapore\.html">HDB loan vs bank loan: rates and downpayment<\/a>/);
});

test('calculator cites current primary HDB guidance and its review date', () => {
  const html = read('calculator/index.html');

  assert.match(html, /Sources checked 30 October 2026/);
  assert.match(html, /https:\/\/www\.hdb\.gov\.sg\/managing-my-home\/finances\/loan-matters\/interest-rate/);
  assert.match(html, /https:\/\/www\.hdb\.gov\.sg\/buying-a-flat\/flat-grant-and-loan-eligibility\/housing-loan\/housing-loan-from-hdb/);
  assert.match(html, /current HDB concessionary interest rate is 2\.6% per year for 1 October to 31 December 2026/);
  assert.match(html, /published maximum loan-to-value limit is 75%/);
  assert.match(html, /not a loan offer/);
  assert.match(html, /Is this calculator the same as an HFE letter\?/i);
  assert.match(html, /No\. This calculator is an independent planning tool\./i);
});

test('relevant HDB pages link to the calculator with descriptive anchor text', () => {
  for (const relative of [
    'glossary/index.html',
    'insights/hdb-valuation-explained.html',
    'hdb-prices/index.html',
  ]) {
    const html = read(relative);
    assert.match(
      html,
      /<a[^>]+href="\/calculator\/"[^>]*>[^<]*HDB loan calculator[^<]*<\/a>/i,
      `missing descriptive calculator link in ${relative}`,
    );
  }
});

test('glossary stamp duty entries link the stamp duty calculator by name', () => {
  const html = read('glossary/index.html');
  for (const id of ['absd', 'bsd']) {
    const entry = html.match(new RegExp(`<div class="g-term" id="${id}">[\\s\\S]*?</div>\\s*</div>|<div class="g-term" id="${id}">[\\s\\S]*?(?=<div class="g-term")`))?.[0];
    assert.ok(entry, `missing glossary entry ${id}`);
    assert.match(entry, /<a href="\/stamp-duty-calculator\/">stamp duty calculator<\/a>/, `${id} entry needs a descriptive calculator link`);
  }
});

test('title, social tags and JSON-LD names agree on one brand (JOE-470)', () => {
  const html = read('calculator/index.html');
  const decoded = 'Home Loan Calculator Singapore: HDB & Bank | PropertySG';
  for (const pattern of [
    /<meta property="og:title" content="([^"]+)">/,
    /<meta name="twitter:title" content="([^"]+)">/,
  ]) {
    assert.equal(html.match(pattern)?.[1].replaceAll('&amp;', '&'), decoded);
  }
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const page = schemas.find((schema) => schema['@type'] === 'WebPage');
  assert.equal(page.name, decoded);
  assert.equal(page.dateModified, '2026-10-30');
  assert.equal(page.breadcrumb.itemListElement[1].name, 'Home Loan Calculator');
  assert.doesNotMatch(html, /\| Joe Tay"/);
});

test('worked example figures come from the calculator\'s own maths (JOE-470)', async () => {
  const html = read('calculator/index.html');
  const visible = stripTags(html);
  const { repaymentEstimate } = await import('../assets/decision-calculations.mjs');
  const money = (cents) => `S$${(cents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const at = (rate) => repaymentEstimate({ principal: 450000, annualRatePercent: rate, years: 25 });

  // S$600,000 flat: 75% loan, 25% downpayment, 5% minimum cash with a bank loan.
  assert.match(visible, /largest loan is S\$450,000 and the downpayment is S\$150,000/);
  assert.match(visible, /at least S\$30,000 of it must be cash/);

  const rows = [...html.matchAll(/<tr><th scope="row">([\d.]+)%<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td>/g)];
  assert.deepEqual(rows.map((row) => row[1]), ['2.6', '3', '4']);
  for (const [, rate, instalment, interest] of rows) {
    const result = at(Number(rate));
    assert.equal(instalment, money(result.paymentCents), `instalment at ${rate}%`);
    assert.equal(interest, money(result.interestCents), `total interest at ${rate}%`);
  }
  const hdb = at(2.6);
  assert.ok(visible.includes(`you still owe ${money(hdb.schedule[4].balanceCents)} after 5 years and ${money(hdb.schedule[9].balanceCents)} after 10`));
  assert.ok(visible.includes(`you would pay ${money(at(4).paymentCents - hdb.paymentCents)} more each month`));

  // Income needed: the 30% MSR must cover the instalment at the assessment rate.
  for (const [rate, income] of [[3, 7114], [4, 7918]]) {
    const cents = at(rate).paymentCents;
    assert.ok(income * 0.3 * 100 >= cents && (income - 1) * 0.3 * 100 < cents, `S$${income} is the smallest whole-dollar income at ${rate}%`);
    assert.ok(visible.includes(`about S$${income.toLocaleString('en-SG')} a month`));
  }
});

test('worked example affordability results match the affordability script (JOE-470)', async () => {
  const html = read('calculator/index.html');
  const vm = await import('node:vm');
  const run = (loanType) => {
    const values = { income: 7114, cash: 30000, cpfOA: 120000, age: 35, tenure: 25, otherDebt: 0 };
    const elements = new Map(Object.entries(values).map(([id, value]) => [id, { value: String(value) }]));
    const document = {
      getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); },
      querySelector: () => ({ value: loanType }),
      querySelectorAll: () => [],
      activeElement: null,
    };
    const source = html.slice(html.indexOf('const fmt ='), html.indexOf('// Debounce recalc'));
    vm.runInNewContext(`${source}\nrecalc(false);`, { document, window: {} });
    return elements.get('maxPrice').textContent.replace('$', 'S$');
  };
  const visible = stripTags(html);
  assert.ok(visible.includes(`the HDB loan result is ${run('HDB')}`));
  assert.ok(visible.includes(`Switch to Bank loan and it drops to ${run('Bank')}`));
});

test('rules box cites MAS, CPF and HDB primary sources and no unsourced bank rate (JOE-470)', () => {
  const html = read('calculator/index.html');
  assert.match(html, /id="loan-rules"/);
  assert.match(html, /href="#loan-rules">Rules checked 30 October 2026<\/a>/);
  assert.match(html, /Rules this calculator uses, checked 30 October 2026/);
  for (const url of [
    'https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits',
    'https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules',
    'https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr',
    'https://www.mas.gov.sg/news/media-releases/2022/measures-to-promote-sustainable-conditions-in-the-property-market-by-ensuring-prudent-borrowing-and-moderating-demand',
    'https://www.mynicehome.gov.sg/get-started/hdb-loans-guide/',
    'https://www.cpf.gov.sg/member/infohub/educational-resources/3-differences-between-hdb-loan-and-bank-loan',
  ]) {
    assert.ok(html.includes(`href="${url}"`), `missing source ${url}`);
  }
  // MAS lets a bank lend 30 years on an HDB flat (at 55% LTV past 25 years);
  // the old helper said 25 years for both HDB and bank loans.
  assert.doesNotMatch(html, /Up to 25 years for an HDB flat, with an HDB or bank loan/);
  assert.match(html, /Bank loan: up to 30 years on an HDB flat, but past 25 years the bank lends at most 55%/);
  // The "~2.5% typical fixed package" market rate had no source.
  assert.doesNotMatch(html, /~\s?2\.5%|typical fixed package|Actual ~/);
  assert.doesNotMatch(html, /\d\.\d{1,2}% (?:fixed|floating|bank package)/i);
});

test('guide-end CTA offers HDB financing help with tracked, figure-free WhatsApp (JOE-470)', () => {
  const html = read('calculator/index.html');
  const guide = html.match(/<section class="calc-guide"[\s\S]*?<\/section>/)[0];
  const cta = html.match(/<div class="calc-cta calc-guide-cta">[\s\S]*?<\/div>/)?.[0];
  assert.ok(cta, 'missing guide-end CTA');
  assert.ok(html.indexOf(cta) > html.indexOf('id="hdb-grant-reading-title"'), 'CTA should follow the guide content');
  const link = cta.match(/<a href="(https:\/\/wa\.me\/6581881488\?text=[^"]+)"[^>]*>/);
  assert.ok(link, 'CTA needs a prefilled wa.me link');
  assert.match(link[0], /data-cta-location="calculator_guide_end"/);
  assert.match(link[0], /data-lead-type="buyer_financing"/);
  assert.doesNotMatch(decodeURIComponent(link[1].split('?text=')[1]), /[\d$]/);
  assert.match(cta, /href="\/insights\/hfe-letter-singapore-guide\.html"/);
  assert.ok(guide.includes(cta), 'CTA should sit inside the calculator guide');
});
