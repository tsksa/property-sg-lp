import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The BTO calculator deliberately mirrors /calculator/'s tested loan rules
// rather than importing them — this repo is build-less and the affordability
// calculator's own tests pin its INLINE source, so a physical extraction would
// have rewritten that regression net. These tests do two jobs instead:
//   1. pin the BTO page's own regulatory constants, and
//   2. assert the two pages' shared rules are byte-identical (drift guard),
//      so a rule change on one page cannot silently strand the other.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'bto-calculator', 'index.html'), 'utf8');
const resaleHtml = fs.readFileSync(path.join(ROOT, 'calculator', 'index.html'), 'utf8');

const amortisedLoan = (monthlyPayment, annualRate, years) => {
  const r = annualRate / 12;
  const n = years * 12;
  return monthlyPayment * (1 - (1 + r) ** -n) / r;
};

test('tenure is capped at the 25-year HDB ceiling and by age 65', () => {
  assert.match(html, /const tenure = Math\.min\(25, ageCapTenure\)/);
  assert.match(html, /const ageCapTenure = Math\.max\(5, 65 - age\)/);
  assert.doesNotMatch(html, /Math\.min\(30,/, 'the private 30-year ceiling has crept in');
});

test('HDB eligibility uses the 3% floor while the displayed payment stays at 2.6%; no unsourced bank rate', () => {
  assert.match(html, /const annualRate = loanType === 'HDB' \? Math\.max\(0\.03, 0\.026\) : 0\.040/);
  assert.match(html, /const marketRate = loanType === 'HDB' \? 0\.026 : annualRate;/);
  assert.doesNotMatch(html, /illustrative bank rate/, 'bank repayment must not use an unsourced market rate');
});

test('shared loan rules are byte-identical with the resale calculator (drift guard)', () => {
  for (const rule of [
    /const annualRate = loanType === 'HDB' \? Math\.max\(0\.03, 0\.026\) : 0\.040/,
    /const marketRate = loanType === 'HDB' \? 0\.026 : annualRate;/,
    /const msrMax = income \* 0\.30/,
    /const ltv = 0\.75/,
  ]) {
    const inBto = html.match(rule)?.[0];
    const inResale = resaleHtml.match(rule)?.[0];
    assert.ok(inBto, `BTO page lost rule ${rule}`);
    assert.ok(inResale, `resale calculator lost rule ${rule} — update BOTH pages together`);
    assert.equal(inBto, inResale);
  }
});

test('budget maths: downpayment-bound and loan-bound regimes both correct', () => {
  // Mirrors the page's formula: maxPrice = min(maxLoan + savings, savings / 0.25)
  const income = 7000, savings = 60000;
  const maxLoan = amortisedLoan(income * 0.30, 0.03, 25);
  const maxPrice = Math.min(maxLoan + savings, savings / 0.25);
  assert.equal(maxPrice, 240000, 'with $60k savings the 25% downpayment must bind at $240k');
  assert.match(html, /Math\.min\(maxLoan \+ funds, funds \/ \(1 - ltv\)\)/);

  // savings-rich: the loan binds instead, and the buyer over-downpays legally
  const richPrice = Math.min(maxLoan + 400000, 400000 / 0.25);
  assert.ok(Math.abs(richPrice - (maxLoan + 400000)) < 1e-6);
});

test('option fees match the published HDB schedule', () => {
  assert.match(html, /<option value="500">2-room Flexi<\/option>/);
  assert.match(html, /<option value="1000">3-room<\/option>/);
  assert.match(html, /<option value="2000" selected>4-room<\/option>/);
  assert.match(html, /\$500 for a 2-room Flexi flat, \$1,000 for a 3-room flat, and \$2,000 for a 4-room/);
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

// ── Enhanced CPF Housing Grant (JOE-13) ──
// The 16-band family table from HDB's "EHG amount for first-timer households"
// PDF (current since 20 Aug 2024). Steps are NOT uniform, so every band is
// pinned — an interpolated or drifted table produces wrong money for a live
// buyer at 10 of the 16 bands.
const EHG_EXPECTED = [
  [1500, 120000], [2000, 110000], [2500, 105000], [3000, 95000],
  [3500, 90000], [4000, 80000], [4500, 70000], [5000, 65000],
  [5500, 55000], [6000, 50000], [6500, 40000], [7000, 30000],
  [7500, 25000], [8000, 20000], [8500, 10000], [9000, 5000],
];

test('the EHG family table matches HDB, band for band', () => {
  for (const [upTo, grant] of EHG_EXPECTED) {
    assert.match(
      html,
      new RegExp(`\\{ upTo: ${upTo}, grant: ${grant} \\}`),
      `EHG band ≤$${upTo} must be $${grant}`,
    );
  }
  assert.equal((html.match(/\{ upTo: \d+, grant: \d+ \}/g) || []).length, 16,
    'the table must have exactly 16 bands');
});

test('EHG lookup semantics: boundaries inclusive, ceiling above $9,000', () => {
  // Mirrors the page's ehgFamilyGrant()
  const grant = (income) => {
    for (const [upTo, g] of EHG_EXPECTED) if (income <= upTo) return g;
    return 0;
  };
  assert.equal(grant(1500), 120000);
  assert.equal(grant(1501), 110000, 'band boundary must be inclusive of upTo');
  assert.equal(grant(9000), 5000);
  assert.equal(grant(9001), 0, 'no EHG above the $9,000 ceiling');
  assert.match(html, /return 0; \/\/ above the \$9,000 EHG income ceiling/);
});

test('EHG is opt-in and behaves as CPF-payable funds in the budget', () => {
  assert.match(html, /<input type="checkbox" id="firstTimer"/);
  assert.match(html, /const ehg = firstTimer \? ehgFamilyGrant\(income\) : 0/);
  assert.match(html, /const funds = savings \+ ehg/);
  // conditions caveat is visible where the user ticks the box
  assert.match(html, /needs 12 months(&#39;|')s? continuous employment/);
});

// ── Content sections (JOE-469 WS4) ──
// The worked examples are published figures, so they must be exactly what the
// page's own formulas return; a rule change that moves the tool must move them.
test('worked budget examples match the calculator maths, row for row', () => {
  const ehg = (income) => {
    for (const [upTo, g] of EHG_EXPECTED) if (income <= upTo) return g;
    return 0;
  };
  const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
  const instalment = (principal, annualRate, years) => {
    const r = annualRate / 12;
    return principal * r / (1 - (1 + r) ** -(years * 12));
  };
  const section = html.match(/<section class="calc-faq calc-explain" aria-labelledby="bto-examples-title">[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'missing the worked-examples section');
  assert.match(section, /<h2 id="bto-examples-title">BTO budget examples by household income<\/h2>/);
  const rows = [...section.matchAll(/<tr><th scope="row">([^<]+)<\/th>((?:<td>[^<]*<\/td>)+)<\/tr>/g)]
    .map(([, income, cells]) => [income, ...[...cells.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1])]);
  assert.equal(rows.length, 5);
  for (const [incomeText, savingsText, ehgText, budget, loanText, monthlyText, bound] of rows) {
    const income = Number(incomeText.replace(/[$,]/g, ''));
    const savings = Number(savingsText.replace(/[$,]/g, ''));
    const grant = ehgText.startsWith('None') ? 0 : ehg(income);
    if (grant) assert.equal(ehgText, money(grant));
    const tenure = Math.min(25, Math.max(5, 65 - 30));
    const maxLoan = amortisedLoan(income * 0.30, 0.03, tenure);
    const funds = savings + grant;
    const maxPrice = Math.min(maxLoan + funds, funds / 0.25);
    const loan = Math.min(maxLoan, maxPrice * 0.75);
    assert.equal(budget, money(maxPrice), `${incomeText}: budget`);
    assert.equal(loanText, money(loan), `${incomeText}: loan`);
    assert.equal(monthlyText, money(instalment(loan, 0.026, tenure)), `${incomeText}: monthly`);
    assert.equal(bound, maxPrice === funds / 0.25 ? '25% downpayment' : 'What you can borrow', `${incomeText}: binding limit`);
  }
});

test('the staggered downpayment section cites HDB and adds up to 25%', () => {
  const section = html.match(/<section class="calc-faq calc-explain" aria-labelledby="bto-staggered-title">[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'missing the staggered downpayment section');
  assert.match(section, /<h2 id="bto-staggered-title">Staggered downpayment vs the standard BTO payment schedule<\/h2>/);
  assert.match(section, /href="https:\/\/www\.hdb\.gov\.sg\/[^"]+Annex-B\.pdf"/);
  assert.match(section, /Checked \d{1,2} [A-Z][a-z]+ 20\d\d/);
  const splits = [...section.matchAll(/<td>\$([\d,]+) \(([\d.]+)%\)<\/td><td>\$([\d,]+) \(([\d.]+)%\)<\/td>/g)];
  assert.equal(splits.length, 3);
  for (const [, signing, signingPct, keys, keysPct] of section.matchAll(/<td>\$([\d,]+) \(([\d.]+)%\)<\/td><td>\$([\d,]+) \(([\d.]+)%\)<\/td>/g)) {
    const price = 400000;
    assert.equal(Number(signingPct) + Number(keysPct), 25);
    assert.equal(Number(signing.replace(/,/g, '')), price * Number(signingPct) / 100);
    assert.equal(Number(keys.replace(/,/g, '')), price * Number(keysPct) / 100);
  }
});

test('the BTO title is unchanged and the income ceiling matches the August 2026 revision', () => {
  assert.match(html, /<title>HDB BTO Calculator — Budget &amp; Downpayment 2026 \| PropertySG<\/title>|<title>HDB BTO Calculator — Budget & Downpayment 2026 \| PropertySG<\/title>/);
  assert.doesNotMatch(html, /income ceiling is \$14,000/);
  assert.match(html, /income ceiling is \$16,000 a month for families buying a new flat/);
});
