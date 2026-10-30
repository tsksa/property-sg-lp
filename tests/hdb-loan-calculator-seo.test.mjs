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
  assert.equal(title, 'HDB and Home Loan Calculator Singapore (2026) | PropertySG');
  assert.ok(title.length <= 60, `title is ${title.length} characters`);
  assert.ok(description.length <= 155, `description is ${description.length} characters`);
  assert.match(description, /HDB loan calculator/i);
  assert.match(description, /monthly repayment/i);
  assert.match(html, /<h1[^>]*>HDB and home loan calculator<\/h1>/);
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
  assert.equal(faq.mainEntity.length, 9);
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

  assert.match(html, /Sources checked 25 August 2026/);
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
