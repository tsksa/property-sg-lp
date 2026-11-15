import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ARTICLES, HUB, SOURCES, hubPage } from '../scripts/generate-seller-cluster.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const slugs = ARTICLES.map((article) => article.slug);

// AUDIT.md A4 / G3 / G4: Seller's Stamp Duty, selling a condo and renting out
// each get a sourced guide, and /sell/guide/ puts every selling guide in order.
test('each new guide is indexable, sourced from official pages and linked to a next step', () => {
  assert.deepEqual(slugs, ['seller-stamp-duty-singapore', 'how-to-sell-condo-singapore', 'renting-out-hdb-condo-singapore']);
  for (const article of ARTICLES) {
    const html = read(`insights/${article.slug}.html`);
    assert.ok(article.title.length <= 60, `${article.slug}: title is ${article.title.length} characters`);
    assert.ok(article.description.length <= 160, `${article.slug}: description is ${article.description.length} characters`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://joetay.com/insights/${article.slug}\\.html">`));
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, /<h2[^>]*>Official sources and review date<\/h2>/);
    const external = [...html.matchAll(/href="(https:\/\/[^"]+)" rel="noopener"/g)].map((m) => m[1]).filter((href) => !href.includes('wa.me'));
    assert.ok(external.length >= 2, `${article.slug}: cites fewer than two sources`);
    for (const href of external) {
      assert.match(href, /^https:\/\/www\.(?:iras|hdb|ura|cea|cpf)\.gov\.sg\//, `${article.slug}: ${href} is not an official source`);
    }
    assert.match(html, /general education, not legal, tax or financial advice/);
    assert.match(html, /<div class="article-cta">/);
    assert.match(html, /href="https:\/\/wa\.me\/6581881488\?text=/);
    assert.match(html, /CEA R009618D/);
  }
});

test('visible FAQs exactly mirror the FAQPage schema', () => {
  for (const article of ARTICLES) {
    const html = read(`insights/${article.slug}.html`);
    const schema = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((node) => node['@type'] === 'FAQPage');
    assert.equal(schema.mainEntity.length, article.faqs.length);
    for (const [question, answer] of article.faqs) {
      assert.ok(html.includes(`<h3>${esc(question)}</h3>\n<p>${esc(answer)}</p>`), `${article.slug}: "${question}" not visible`);
      assert.equal(schema.mainEntity.find((item) => item.name === question)?.acceptedAnswer.text, answer);
    }
  }
});

test('the Seller’s Stamp Duty guide agrees with the stamp duty calculator and its own example', () => {
  const guide = read('insights/seller-stamp-duty-singapore.html');
  const calculator = read('stamp-duty-calculator/index.html');
  // The calculator page already states the post-4 July 2025 rates; the guide must not differ.
  assert.match(calculator, /16% if sold within one year, 12% in the second year, 8% in the third and 4% in the fourth/);
  for (const row of ['<td>Up to 1 year</td><td>12%</td><td>16%</td>', '<td>More than 1 year, up to 2 years</td><td>8%</td><td>12%</td>', '<td>More than 2 years, up to 3 years</td><td>4%</td><td>8%</td>', '<td>More than 3 years, up to 4 years</td><td>No SSD</td><td>4%</td>']) {
    assert.ok(guide.includes(row), `rate row missing: ${row}`);
  }
  assert.ok(guide.includes('8% × $1,500,000 = <strong>$120,000</strong>'));
  assert.equal(0.08 * 1_500_000, 120_000);
});

test('the renting guide states the lease duty example correctly', () => {
  const guide = read('insights/renting-out-hdb-condo-singapore.html');
  assert.ok(guide.includes('A two-year lease at $3,400 a month has a total rent of $81,600'));
  assert.equal(24 * 3400, 81_600);
  assert.ok(guide.includes('0.4% × $81,600 = <strong>$326</strong>'));
  assert.equal(Math.floor(0.004 * 81_600), 326);
  assert.ok(Object.values(SOURCES).every((href) => /^https:\/\/www\.(?:iras|hdb|ura|cea|cpf)\.gov\.sg\//.test(href)));
});

test('the index, feeds, sitemap and FAQ hub discover every new guide', () => {
  const surfaces = {
    'insights/index.html': read('insights/index.html'),
    'sitemap.xml': read('sitemap.xml'),
    'insights/feed.xml': read('insights/feed.xml'),
    'insights/feed.json': read('insights/feed.json'),
    'faq/index.html': read('faq/index.html'),
    'sell/guide/index.html': read('sell/guide/index.html'),
  };
  for (const slug of slugs) {
    for (const [name, text] of Object.entries(surfaces)) assert.ok(text.includes(slug), `${slug} missing from ${name}`);
  }
});

test('the seller’s guide hub is current and every link on it resolves', () => {
  const html = read(HUB.path);
  assert.equal(html, hubPage());
  assert.ok(HUB.title.length <= 60 && HUB.description.length <= 160);
  assert.match(html, /<link rel="canonical" href="https:\/\/joetay\.com\/sell\/guide\/">/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  for (const step of HUB.steps) {
    assert.ok(step.links.length >= 1);
    for (const [href] of step.links) {
      const file = href.endsWith('/') ? `${href.slice(1)}index.html` : href.slice(1);
      assert.ok(fs.existsSync(path.join(ROOT, file)), `hub links to missing page ${href}`);
      assert.ok(html.includes(`<a href="${href}">`), `${href} missing from hub`);
    }
  }
  assert.ok(read('sitemap.xml').includes('<loc>https://joetay.com/sell/guide/</loc>'));
  // The hub carries the checklist form, so it needs the honeypot and token helper.
  assert.ok(html.includes('<div data-jt-checklist></div>') && html.includes('/js/recaptcha-helper.js'));
});
