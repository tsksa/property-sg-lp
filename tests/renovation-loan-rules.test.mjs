import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Guards the renovation-loan calculator's regulatory constants and its one
// honesty rule: the cap and tenure are hard facts (the major banks' published
// terms), but the INTEREST RATE must stay a user input — a hard-coded bank
// rate goes stale silently and misleads a live borrower.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'renovation-loan-calculator', 'index.html'), 'utf8');

test('the cap is min($30,000, 6× monthly income) and tenure tops out at 5 years', () => {
  assert.match(html, /const RENO_CAP = 30000/);
  assert.match(html, /const RENO_INCOME_MULTIPLE = 6/);
  assert.match(html, /const RENO_MAX_TENURE_YEARS = 5/);
  assert.match(html, /Math\.min\(RENO_CAP, RENO_INCOME_MULTIPLE \* income\)/);
});

test('the interest rate is a user input, not a hard-coded bank rate', () => {
  assert.match(html, /<input type="number" id="rate"/);
  assert.match(html, /parseFloat\(document\.getElementById\('rate'\)\.value\)/);
  // The illustrative default must be labelled as such where the user sees it.
  assert.match(html, /illustrative default, check your bank/);
});

test('flat-rate instalment maths is correct', () => {
  // Mirrors the page: monthly = (P + P*r*t) / (t*12)
  const monthly = (P, r, t) => (P + P * r * t) / (t * 12);
  assert.equal(monthly(30000, 0.045, 5), 612.5);
  assert.equal(monthly(24000, 0.045, 5), 490);
  assert.match(html, /\(principal \+ principal \* flatAnnualRate \* years\) \/ months/);
});

test('the income cap binds before the $30k ceiling for lower incomes', () => {
  const eligible = (income, requested) => Math.max(0, Math.min(requested, Math.min(30000, 6 * income)));
  assert.equal(eligible(4000, 30000), 24000);
  assert.equal(eligible(5000, 30000), 30000);
  assert.equal(eligible(10000, 20000), 20000);
  assert.equal(eligible(0, 30000), 0);
});

test('the page is honest about flat rate vs effective rate', () => {
  assert.match(html, /effective interest rate \(EIR\)/i);
  assert.match(html, /your bank's EIR will be higher/);
});

test('every FAQPage answer is rendered visibly on the page, verbatim', () => {
  const faq = JSON.parse(
    [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)]
      .map((m) => m[1]).find((j) => j.includes('"FAQPage"')),
  );
  const body = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  for (const q of faq.mainEntity) {
    assert.ok(body.includes(`<summary>${q.name}</summary>`), `question not visible: ${q.name}`);
    assert.ok(body.includes(`<p>${q.acceptedAnswer.text}</p>`), `answer not visible: ${q.name}`);
  }
});

test('mobile inputs are 16px so iOS does not zoom on focus', () => {
  assert.match(html, /@media\(max-width:768px\)\{\.calc-field input,\.calc-field select\{font-size:16px\}\}/);
});

// ── HDB renovation loan content (JOE-469 WS4) ──
// /calculator/ used to answer "Is this an HDB renovation loan calculator?" and
// outranked this page on its own head term. This page now answers it.
test('the page answers "is there an HDB renovation loan" under its own H2', () => {
  assert.match(html, /<title>Renovation Loan Calculator 2026: HDB &amp; Condo \| PropertySG<\/title>/);
  assert.match(html, /<h1 id="page-hero-title">Renovation loan calculator \(HDB and condo\)<\/h1>/);
  assert.match(html, /<h2 id="hdb-renovation-loan-title">Is there an HDB renovation loan\?<\/h2>/);
  // C6: the cap is the LOWER of the two figures, cited to a bank's own page.
  assert.match(html, /lower of 6 times your monthly income or \$30,000/);
  assert.match(html, /href="https:\/\/www\.dbs\.com\.sg\/[^"]+renovation-loan"/);
  assert.match(html, /Banks commonly cap renovation loans at the lower of 6 times/);
  assert.doesNotMatch(html, /Rates and rules checked/);
  assert.match(html, /Rules checked \d{1,2} [A-Z][a-z]+ 20\d\d/);
  assert.match(html, /"dateModified": "20\d\d-\d\d-\d\d"/);
});

test('worked examples at $15,000 and $30,000 use the page maths', () => {
  const monthly = (P, r, t) => (P + P * r * t) / (t * 12);
  const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
  const section = html.match(/<section class="calc-faq calc-explain" aria-labelledby="hdb-renovation-loan-title">[\s\S]*?<\/section>/)[0];
  assert.match(html, /id="rate"[^>]*value="4\.5"/, 'examples assume the page default rate');
  for (const loan of [15000, 30000]) {
    const row = section.match(new RegExp(`<tr><th scope="row">\\${money(loan)}</th>(.*?)</tr>`))?.[1];
    assert.ok(row, `missing the ${money(loan)} row`);
    assert.ok(row.includes(`<td>${money(loan / 6)}</td>`), `${money(loan)}: income needed`);
    for (const years of [3, 5]) {
      assert.ok(row.includes(`${money(monthly(loan, 0.045, years))} / ${money(loan * 0.045 * years)}`), `${money(loan)} over ${years} years`);
    }
  }
  // D1: no bank rate table. Rates stay a user input.
  assert.doesNotMatch(section, /\d+(\.\d+)?% (p\.a\.|EIR)/);
});
