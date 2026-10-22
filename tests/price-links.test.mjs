import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PRICE_LINK_TARGETS,
  PRICE_LINKS_MARKER,
  applyPriceLinks,
  districtName,
  priceDistricts,
  priceLinksHtml,
  priceTowns,
} from '../scripts/lib/price-links.mjs';

// JOE-448: Google had never crawled 21 of 26 town pages and 22 of 26 district
// pages, because the pages it does crawl (homepage, sold-prices lookup,
// valuation, calculator, seller guides) linked none of them. These pin that
// every price page now has a plain, static link from several of those pages,
// with an anchor that says what the page is.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const dirsIn = (dir, pattern) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name) && fs.existsSync(path.join(ROOT, dir, entry.name, 'index.html')))
    .map((entry) => entry.name)
    .sort();
// Static links only: a link written by a script at runtime is not a crawl path.
const staticHrefs = (html) => new Set([...html.replace(/<script\b[\s\S]*?<\/script>/gi, '').matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]));

test('the town and district lists come from the pages on disk', () => {
  const towns = priceTowns();
  assert.deepEqual(towns.map((t) => t.slug), dirsIn('hdb-prices', /^[a-z0-9-]+$/));
  for (const town of towns) {
    assert.ok(read(`hdb-prices/${town.slug}/index.html`).includes(`<h1>${town.name} HDB resale prices</h1>`));
    assert.equal(town.label, `${town.name} HDB resale prices`);
  }
  assert.equal(towns.find((t) => t.slug === 'kallang-whampoa').name, 'Kallang/Whampoa');

  const districts = priceDistricts();
  assert.deepEqual(districts.map((d) => d.href), dirsIn('condo-prices', /^d\d\d$/).map((d) => `/condo-prices/${d}/`));
  assert.ok(!districts.some((d) => d.id === 'D24'), 'D24 has no district page and must not be linked');
  assert.equal(districtName('D19'), 'D19 Serangoon, Hougang, Punggol, Sengkang');
  assert.equal(districts.find((d) => d.id === 'D19').label, 'D19 Serangoon, Hougang, Punggol, Sengkang condo resale prices');
});

test('every target page carries the current block, and re-applying changes nothing', () => {
  for (const target of PRICE_LINK_TARGETS) {
    const html = read(target.file);
    assert.equal((html.match(new RegExp(`<section[^>]*${PRICE_LINKS_MARKER}`, 'g')) || []).length, 1, `${target.file}: expected one price links block`);
    assert.equal(applyPriceLinks(html, target), html, `${target.file}: block is stale — run node scripts/apply-price-links.mjs`);
  }
});

test('the block is inserted once and then replaced in place', () => {
  const target = { file: 'fixture.html', before: '</main>', lists: ['towns'], hubs: ['hdb'], level: 3 };
  const page = '<main>\n<p>Body</p>\n</main>\n';
  const once = applyPriceLinks(page, target);
  assert.equal(applyPriceLinks(once, target), once);
  assert.ok(once.indexOf(PRICE_LINKS_MARKER) < once.indexOf('</main>'));
  assert.throws(() => applyPriceLinks('<div></div>', target), /no "<\/main>" anchor/);
});

test('every town page is linked from at least 5 target pages, every district page from at least 3', () => {
  const linkedFrom = new Map();
  for (const { file } of PRICE_LINK_TARGETS) {
    for (const href of staticHrefs(read(file))) linkedFrom.set(href, (linkedFrom.get(href) || 0) + 1);
  }
  for (const town of priceTowns()) assert.ok((linkedFrom.get(town.href) || 0) >= 5, `${town.href} linked from ${linkedFrom.get(town.href) || 0} target pages`);
  for (const district of priceDistricts()) assert.ok((linkedFrom.get(district.href) || 0) >= 3, `${district.href} linked from ${linkedFrom.get(district.href) || 0} target pages`);
  assert.ok(staticHrefs(read('index.html')).has('/condo-prices/'), 'the homepage body should link the condo hub');
});

test('anchors describe the page they link to', () => {
  const html = priceLinksHtml({ towns: priceTowns(), districts: priceDistricts(), hubs: ['hdb', 'condo'] });
  assert.match(html, /<a href="\/hdb-prices\/tampines\/">Tampines HDB resale prices<\/a>/);
  assert.match(html, /<a href="\/condo-prices\/d19\/">D19 Serangoon, Hougang, Punggol, Sengkang condo resale prices<\/a>/);
  assert.match(html, /<a href="\/condo-prices\/">Condo resale prices, district by district<\/a>/);
  // Not "every condo district": districts under the caveat floor get no page.
  assert.match(html, new RegExp(`for ${priceTowns().length} HDB towns and ${priceDistricts().length} condo districts`));
  assert.doesNotMatch(html, /every[^<]*district/i);
  // The insights hub's own district list says more than "District 1" too.
  const districts = read('insights/index.html').match(/<section class="blog-guide blog-districts" id="condo-districts"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(districts, />District \d+</);
  assert.match(districts, /<a href="\/condo-prices\/d01\/">D01 Raffles Place, Marina, Cecil<\/a>/);
});

test('placement: homepage between FAQ and guides, insights towns before districts, articles keep their h2 outline', () => {
  const home = read('index.html');
  const faq = home.indexOf('id="faq"');
  const block = home.indexOf(PRICE_LINKS_MARKER);
  assert.ok(faq < block && block < home.indexOf('id="latest-guides"'), 'homepage block must sit between #faq and #latest-guides');

  const insights = read('insights/index.html');
  assert.ok(insights.indexOf('id="hdb-towns"') > -1 && insights.indexOf('id="hdb-towns"') < insights.indexOf('id="condo-districts"'));

  for (const file of ['insights/hdb-valuation-explained.html', 'insights/how-long-to-sell-hdb-singapore-2026.html', 'calculator/index.html']) {
    const html = read(file);
    const section = html.match(new RegExp(`<section[^>]*${PRICE_LINKS_MARKER}[\\s\\S]*?</section>`))[0];
    assert.doesNotMatch(section, /<h2\b/, `${file}: block must use h3 so the page outline does not change`);
    assert.match(section, /<h3 class="jt-pl-title"/);
  }
  for (const file of ['insights/hdb-valuation-explained.html', 'insights/how-long-to-sell-hdb-singapore-2026.html']) {
    const html = read(file);
    assert.ok(html.indexOf(PRICE_LINKS_MARKER) > html.indexOf('</article>') && html.indexOf(PRICE_LINKS_MARKER) < html.indexOf('</main>'));
  }
});

test('the Google Ads landers stay free of the block', () => {
  for (const file of ['sell/index.html', 'rent-out/index.html', 'sell-hdb/singapore/index.html']) {
    assert.ok(!read(file).includes(PRICE_LINKS_MARKER), `${file} must not carry the price links block`);
    assert.ok(!PRICE_LINK_TARGETS.some((target) => target.file === file));
  }
});

// The lists follow the page directories, so a monthly refresh that adds a town
// or district page changes them. Each refresh workflow must regenerate the
// launch pages and commit every page that carries a list, or its PR fails
// npm run check (and the sitemap dates a homepage change the PR never ships).
// The launch generators run before the furniture, which tidies the font block
// generate-project-pages.mjs leaves on hand-written pages.
for (const [workflow, dataGenerator] of [
  ['refresh-estate-pages.yml', 'generate-estate-pages.mjs'],
  ['refresh-condo-pages.yml', 'generate-condo-pages.mjs'],
]) {
  test(`${workflow} regenerates and commits every page that links the price pages`, () => {
    const yml = read(`.github/workflows/${workflow}`);
    const data = yml.indexOf(`node scripts/${dataGenerator}`);
    const furniture = yml.indexOf('node scripts/apply-page-furniture.mjs');
    for (const generator of ['generate-new-launch-index.mjs', 'generate-project-pages.mjs']) {
      const at = yml.indexOf(`node scripts/${generator}`);
      assert.ok(data > -1 && at > data && at < furniture, `${workflow}: run ${generator} after ${dataGenerator} and before apply-page-furniture.mjs`);
    }
    const add = yml.slice(yml.indexOf('git add '), yml.indexOf('git commit'));
    const staged = new Set(add.replace(/\\\n/g, ' ').split(/\s+/));
    for (const { file } of PRICE_LINK_TARGETS) assert.ok(staged.has(file), `${workflow} does not commit ${file}`);
    assert.ok(staged.has('new-launches/*.html'), `${workflow} does not commit the regenerated launch pages`);
  });
}
