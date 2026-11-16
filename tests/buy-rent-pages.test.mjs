import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PAGES, SOURCES, servicePage } from '../scripts/generate-buy-rent-pages.mjs';
import { SITE_ENTRIES } from '../scripts/build-publish-dir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const OFFICIAL = /^https:\/\/www\.(?:iras|hdb|ura|cea|cpf)\.gov\.sg\//;

// AUDIT.md G5: resale buyers and tenants each get a short service page.
test('both pages are current, indexable and within the title and description budgets', () => {
  assert.deepEqual(PAGES.map((page) => page.pagePath), ['/buy/', '/rent/']);
  for (const page of PAGES) {
    const html = read(page.path);
    assert.equal(html, servicePage(page), `${page.path} is stale`);
    assert.ok(page.title.length <= 60, `${page.path}: title is ${page.title.length} characters`);
    assert.ok(page.description.length <= 160, `${page.path}: description is ${page.description.length} characters`);
    assert.ok(html.includes(`<link rel="canonical" href="${page.url}">`));
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(html, /CEA R009618D/);
    assert.match(html, /Agency Lic\. No\. L3002382K/);
  }
});

test('every external citation is an official government page', () => {
  assert.ok(Object.values(SOURCES).every((href) => OFFICIAL.test(href)));
  for (const page of PAGES) {
    const html = read(page.path);
    const external = [...html.matchAll(/href="(https:\/\/[^"]+)" target="_blank" rel="noopener"/g)]
      .map((m) => m[1]).filter((href) => !href.includes('wa.me'));
    assert.ok(external.length >= 3, `${page.path}: cites ${external.length} sources`);
    for (const href of external) assert.match(href, OFFICIAL, `${page.path}: ${href} is not an official source`);
    assert.match(html, /<em>Reviewed \d{1,2} \w{3} 2026/);
    assert.match(html, /general information, not legal, tax or financial advice/);
  }
});

// Joe's standing rule: no fees, track-record numbers or testimonials without his say.
test('neither page states a fee rate, a track record or a testimonial', () => {
  for (const page of PAGES) {
    const text = read(page.path).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    assert.doesNotMatch(text, /\b(?:2|1\.5|0\.5)% (?:commission|fee)|commission of \d|\d+\+? (?:clients|transactions|homes sold|years)|\$\d+M\+|review(?:s|ed by)? from/i, page.path);
  }
});

test('the HDB figures match HDB’s pages and the selling guide that already cites them', () => {
  const buy = read('buy/index.html');
  const sellGuide = read('insights/how-to-sell-hdb-flat-singapore.html');
  for (const fact of ['$1 to $1,000', 'cannot exceed $5,000', '21 calendar days', 'expires at 4pm on the 21st day', '$120 processing fee', 'valid for 9 months', 'about 8 weeks']) {
    assert.ok(buy.includes(fact), `buy page missing "${fact}"`);
  }
  for (const fact of ['Between $1 and $1,000', 'not more than $5,000', '21 calendar days', '$120']) {
    assert.ok(sellGuide.includes(fact), `selling guide no longer says "${fact}"; recheck the buy page`);
  }
});

test('the rent page agrees with the landlord guide and its lease duty example adds up', () => {
  const rent = read('rent/index.html');
  const landlord = read('insights/renting-out-hdb-condo-singapore.html');
  for (const fact of ['8% for the neighbourhood and 11% for the block', 'at least three consecutive months', '0.4% of the total rent', 'within 14 days of signing']) {
    assert.ok(rent.includes(fact), `rent page missing "${fact}"`);
  }
  for (const fact of ['8% at the neighbourhood level and 11% at the block level', 'at least three consecutive months','0.4% of the total rent']) {
    assert.ok(landlord.includes(fact), `landlord guide no longer says "${fact}"; recheck the rent page`);
  }
  assert.ok(rent.includes('0.4% × $81,600 = $326'));
  assert.equal(24 * 3400, 81_600);
  assert.equal(Math.floor(0.004 * 81_600), 326);
});

test('visible FAQs mirror the FAQPage schema', () => {
  for (const page of PAGES) {
    const html = read(page.path);
    const schema = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((node) => node['@type'] === 'FAQPage');
    assert.equal(schema.mainEntity.length, page.faqs.length);
    for (const [question, answer] of page.faqs) {
      assert.ok(html.includes(`<h3>${esc(question)}</h3>\n<p>${esc(answer)}</p>`), `${page.path}: "${question}" not visible`);
      assert.equal(schema.mainEntity.find((item) => item.name === question)?.acceptedAnswer.text, answer);
    }
  }
});

test('each page ends in a tracked WhatsApp and call CTA, and every internal link resolves', () => {
  for (const page of PAGES) {
    const html = read(page.path);
    const tracked = `data-cta-location="${page.ctaLocation}" data-lead-type="${page.leadType}"`;
    assert.ok(html.includes(`href="https://wa.me/6581881488?text=${encodeURIComponent(page.whatsappText)}" target="_blank" rel="noopener" ${tracked}`));
    assert.ok(html.includes(`href="tel:+6581881488" ${tracked}`));
    const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    for (const [, href] of body.matchAll(/href="(\/[^"#?]*)/g)) {
      const file = href.endsWith('/') ? `${href.slice(1)}index.html` : href.slice(1);
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${page.path} links to missing ${href}`);
    }
  }
});

test('the pages are published, in the sitemap and llms.txt, and linked from the shared footer', () => {
  const sitemap = read('sitemap.xml');
  const llms = read('llms.txt');
  const sellGuide = read('sell/guide/index.html');
  for (const page of PAGES) {
    assert.ok(SITE_ENTRIES.includes(page.pagePath.slice(1, -1)), `${page.pagePath} not in the publish allowlist`);
    assert.ok(sitemap.includes(`<loc>${page.url}</loc>`));
    assert.ok(llms.includes(`(${page.url})`));
    assert.ok(sellGuide.includes(`<li><a href="${page.pagePath}">`), `${page.pagePath} missing from the shared footer`);
  }
});
