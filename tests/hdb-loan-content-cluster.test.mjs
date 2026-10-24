import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const slugs = [
  'hdb-loan-eligibility-singapore',
  'hfe-letter-singapore-guide',
  'msr-vs-tdsr-singapore',
  'hdb-loan-vs-bank-loan-singapore',
  'hdb-income-ceiling-2026-ndr-changes',
];

test('the HDB loan and policy guides are indexable, sourced and calculator-linked', () => {
  for (const slug of slugs) {
    const html = read(`insights/${slug}.html`);
    assert.match(html, /<link rel="canonical" href="https:\/\/joetay\.com\/insights\//);
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, slug === 'hdb-loan-vs-bank-loan-singapore' ? /Reviewed 24 Oct 2026/ : /Reviewed (25|26) Aug 2026/);
    assert.match(html, /href="\/calculator\/">HDB loan calculator<\/a>/);
    assert.match(html, /https:\/\/(?:www\.)?(?:hdb\.gov\.sg|cpf\.gov\.sg)\//);
    assert.doesNotMatch(html, /guaranteed approval|financial advice tailored to you/i);
  }
});

test('visible FAQs exactly mirror FAQPage schema', () => {
  for (const slug of slugs) {
    const html = read(`insights/${slug}.html`);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((match) => JSON.parse(match[1]));
    const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');
    assert.ok(faq, `${slug} missing FAQPage`);
    for (const entry of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${entry.name}</h3>`), `${slug} missing visible question: ${entry.name}`);
      assert.ok(html.includes(`<p>${entry.acceptedAnswer.text}</p>`), `${slug} missing visible answer: ${entry.name}`);
    }
  }
});

test('hub, calculator, sitemap and feeds discover the whole cluster', () => {
  const surfaces = [read('insights/index.html'), read('calculator/index.html'), read('sitemap.xml'), read('insights/feed.xml'), read('insights/feed.json')];
  for (const slug of slugs) {
    for (const surface of surfaces) assert.ok(surface.includes(slug), `${slug} missing from a discovery surface`);
  }
});

test('visible updated labels are derived from the datetime value', () => {
  const source = read('scripts/generate-hdb-loan-cluster.mjs');
  assert.doesNotMatch(source, /Updated Aug 26, 2026/);
  assert.match(source, /visibleDate\(modified\)/);
  const labelFor = (iso) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  for (const slug of ['hdb-loan-eligibility-singapore', 'hfe-letter-singapore-guide', 'msr-vs-tdsr-singapore', 'hdb-loan-vs-bank-loan-singapore']) {
    const html = read(`insights/${slug}.html`);
    const time = html.match(/<time datetime="(\d{4}-\d{2}-\d{2})">([^<]+)<\/time>/);
    assert.ok(time, `${slug}: missing updated time`);
    assert.equal(time[2], `Updated ${labelFor(time[1])}`, slug);
  }
  const policy = read('insights/hdb-income-ceiling-2026-ndr-changes.html');
  const policyTime = policy.match(/<time datetime="(\d{4}-\d{2}-\d{2})">([^<]+)<\/time>/);
  assert.ok(policyTime, 'income ceiling: missing time');
  assert.equal(policyTime[2], labelFor(policyTime[1]), 'a published date that is also the modified date stays unprefixed');
});

// 19 Oct 2026 report: the HFE guide became the top organic landing page (8
// sessions in 28 days) with no way to reach Joe inside the article. A WhatsApp
// CTA now sits in the body, after the processing-time section (JOE-345).
test('the HFE guide asks readers to contact Joe mid-article', () => {
  const html = read('insights/hfe-letter-singapore-guide.html');
  const body = html.slice(html.indexOf('<section class="article-body"'));
  const cta = body.indexOf('<div class="article-cta">');
  assert.ok(cta > body.indexOf('>HFE processing and waiting time</h2>'), 'CTA should follow the processing-time section');
  assert.ok(cta < body.indexOf('>How to view your HFE letter</h2>'), 'CTA should sit mid-article, not at the end');
  assert.match(body.slice(cta, cta + 800), /href="https:\/\/wa\.me\/6581881488\?text=[^"]+"/);
});

// 7 Sep 2026 audit: the cluster earned 103 impressions ("hdb mortgage loan",
// "hdb bank loan interest rate", "hdb bank loan singapore") at positions 73-87
// while every inbound link came from inside the cluster itself. These pin the
// outside-in links and the sections that answer those three queries.
test('the HDB-vs-bank guide answers the bank-rate and mortgage queries it ranks for', () => {
  const html = read('insights/hdb-loan-vs-bank-loan-singapore.html');
  assert.match(html, /<h2[^>]*>HDB bank loan interest rate: how bank packages are priced<\/h2>/);
  assert.match(html, /<h2[^>]*>HDB mortgage loan: which loans an HDB flat can take<\/h2>/);
  assert.match(html, /<h2[^>]*>Bank loan for an HDB flat: what the bank will ask for<\/h2>/);
  assert.match(html, /<h3>Does the 30% MSR apply to a bank loan for an HDB flat\?<\/h3>/);
  assert.match(html, /<h3>What is the bank loan interest rate for an HDB flat\?<\/h3>/);
  assert.doesNotMatch(html, /\d\.\d{1,2}% (?:fixed|floating|bank package)/i, 'bank rates must never be quoted');
  assert.match(html, /"dateModified": "2026-10-24"/);
});

test('every calculator and the hub link into the financing cluster from outside it', () => {
  for (const page of ['bto-calculator', 'renovation-loan-calculator', 'stamp-duty-calculator']) {
    const html = read(`${page}/index.html`);
    const block = html.match(/<div class="calc-faq calc-plan"[\s\S]*?<\/div>/)?.[0];
    assert.ok(block, `${page}: missing "Plan the financing" block`);
    const links = [...block.matchAll(/href="\/insights\/([a-z0-9-]+)\.html"/g)].map((m) => m[1]);
    assert.ok(links.length >= 4, `${page}: only ${links.length} cluster links`);
    assert.ok(links.includes('hdb-loan-vs-bank-loan-singapore'), `${page}: must link the HDB-vs-bank guide`);
  }
  const hub = read('insights/index.html');
  const guide = hub.match(/<section class="blog-guide" id="hdb-financing"[\s\S]*?<\/section>/)?.[0];
  assert.ok(guide, 'hub missing the #hdb-financing reading path');
  assert.equal((guide.match(/<li>/g) || []).length, 8);
  for (const slug of [...slugs.filter((s) => s !== 'hdb-income-ceiling-2026-ndr-changes'), 'hdb-downpayment-cash-cpf-grants', 'use-cpf-buy-hdb-flat-singapore', 'enhanced-cpf-housing-grant-singapore', 'hdb-resale-grants-singapore']) {
    assert.ok(guide.includes(`href="${slug}.html"`), `reading path missing ${slug}`);
  }
});

// Condo district pages went live 1 Sep 2026 with a single inbound path (the
// /condo-prices/ hub). This mirrors the financing reading path: every live
// district page is linked from the insights hub, grouped by region.
test('the insights hub links every live condo district page', () => {
  const hub = read('insights/index.html');
  const section = hub.match(/<section class="blog-guide blog-districts" id="condo-districts"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'hub missing the #condo-districts cluster');
  const live = fs.readdirSync(path.join(ROOT, 'condo-prices')).filter((name) => /^d\d\d$/.test(name));
  assert.ok(live.length >= 20, `only ${live.length} district pages found`);
  for (const dir of live) assert.ok(section.includes(`href="/condo-prices/${dir}/"`), `hub cluster missing ${dir}`);
  const linked = [...section.matchAll(/href="\/condo-prices\/(d\d\d)\/"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(linked)].sort(), live.sort(), 'hub links a district that has no page');
  assert.match(section, /href="\/condo-prices\/"/);
});


test('loan comparison gives a dated rate answer and qualifies its cash example', () => {
  const html = read('insights/hdb-loan-vs-bank-loan-singapore.html');
  assert.match(html, /1 October to 31 December 2026/);
  assert.doesNotMatch(html, /Jul–Sep 2026|1 July to 30 September 2026/);
  assert.match(html, /both a \$600,000 purchase price and a \$600,000 valuation/);
  assert.match(html, /5% of the lower of purchase price and valuation/);
  assert.match(html, /role="region" aria-label="Scrollable HDB and bank loan comparison" tabindex="0"/);
  assert.match(html, /fixed-rate end date and lock-in end date separately/);
  assert.ok(html.indexOf('>HDB bank loan interest rate:') < html.indexOf('>When an HDB loan may fit better<'));
});
