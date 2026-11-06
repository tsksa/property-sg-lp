import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const HDB_SOURCE = 'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/eligibility';
const IRAS_SOURCE = "https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-residential-property";
const UPDATED = '2026-11-07';
const SLUG = 'ec-vs-private-condo-2027';

function plain(html) {
  return html.replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function schemas(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap(match => {
      const value = JSON.parse(match[1]);
      return value['@graph'] || (Array.isArray(value) ? value : [value]);
    });
}

function mopCategories(text) {
  assert.match(text, /unclassified/i);
  assert.match(text, /Standard/);
  assert.match(text, /Plus/);
  assert.match(text, /Prime/);
  assert.match(text, /PLH/);
  assert.match(text, /5[- ]years? for (?:Standard or unclassified|unclassified or Standard) flats/i,
    'the five-year period must be associated with Standard flats');
  assert.match(text, /10[- ]years? for Plus (?:and|or) Prime flats/i,
    'the ten-year period must be associated with Plus/Prime flats');
  assert.match(text, /special (?:purchase )?schemes/i);
  assert.match(text, /HDB|My HDBPage/);
}

test('selling MOP FAQ matches its schema and does not treat five years as universal permission', () => {
  const html = read('sell/index.html');
  const question = 'When can I sell my HDB after MOP?';
  const faq = schemas(html).find(item => item['@type'] === 'FAQPage');
  const answer = faq?.mainEntity.find(item => item.name === question)?.acceptedAnswer.text;
  assert.ok(answer, 'missing MOP FAQ schema');
  const detail = [...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)]
    .find(match => match[1].includes(`<summary>${question}</summary>`))?.[1];
  assert.ok(detail, 'missing visible MOP FAQ');
  const paragraph = detail.match(/<p>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(paragraph, 'missing visible MOP answer');
  assert.equal(plain(paragraph), plain(answer));
  mopCategories(answer);
  assert.match(answer, /legal completion|legally completed/i);
  assert.match(answer, /non-occupation/i);
  assert.match(answer, /other selling (?:conditions|requirements)|selling eligibility requirements/i);
  assert.ok(detail.includes(HDB_SOURCE), 'MOP FAQ must cite HDB selling eligibility');
  assert.doesNotMatch(answer, /Once past MOP, you can list immediately|for HDB flats is 5 years/);
});

for (const term of ['bto', 'mop']) {
  test(`glossary ${term.toUpperCase()} definition agrees with its schema and MOP categories`, () => {
    const html = read('glossary/index.html');
    const set = schemas(html).find(item => item['@type'] === 'DefinedTermSet');
    const definition = set?.hasDefinedTerm.find(item => item.url?.endsWith(`#${term}`));
    assert.ok(definition, `missing ${term} DefinedTerm`);
    const section = html.match(new RegExp(`<div class="g-term" id="${term}">([\\s\\S]*?)<\\/div>`))?.[1];
    assert.ok(section, `missing visible ${term} entry`);
    const paragraph = section.match(/<dd>\s*<p>([\s\S]*?)<\/p>/)?.[1];
    assert.ok(paragraph, `missing ${term} definition paragraph`);
    assert.equal(plain(paragraph), plain(definition.description));
    mopCategories(definition.description);
    assert.ok(section.includes(HDB_SOURCE), `${term} must cite HDB selling eligibility`);
    assert.doesNotMatch(definition.description, /Subject to a 5-year MOP/);
    if (term === 'mop') {
      assert.match(definition.description, /legal completion|legally completed/i);
      assert.match(definition.description, /non-occupation/i);
    }
  });
}

function privateCondoCell(html, rowLabel) {
  const row = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .find(match => match[1].includes(`<th scope="row">${rowLabel}</th>`))?.[1];
  assert.ok(row, `missing comparison row ${rowLabel}`);
  const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)];
  assert.equal(cells.length, 2, 'comparison must preserve separate EC and private-condo columns');
  return plain(cells[1][1]);
}

function hasIrasSource(html) {
  return [...html.matchAll(/href="(https:\/\/www\.iras\.gov\.sg\/[^\"]+)"/g)]
    .some(match => decodeURIComponent(match[1]) === IRAS_SOURCE);
}

test('English private-condo SSD explanation preserves both acquisition-date regimes', () => {
  const html = read(`insights/${SLUG}.html`);
  const cell = privateCondoCell(html, 'First five years');
  assert.match(cell, /4 years for residential property acquired on or after 4 July 2025/);
  assert.match(cell, /3 years for property acquired from 11 March 2017 to 3 July 2025/);
  assert.match(cell, /inclusive|both dates/i);
  assert.doesNotMatch(cell, /seller's stamp duty if sold within three years/);
  assert.ok(hasIrasSource(html), 'SSD explanation must cite IRAS');
  assert.match(plain(html), /SSD holding periods checked 7 November 2026/);
  assert.match(html, /update is limited to the SSD explanation/);
});

test('Chinese private-condo SSD explanation preserves the same cut-off and older date window', () => {
  const html = read(`zh/insights/${SLUG}.html`);
  const cell = privateCondoCell(html, '头五年');
  assert.match(cell, /2025 年 7 月 4 日或之后取得的住宅，适用四年持有期/);
  assert.match(cell, /2017 年 3 月 11 日至 2025 年 7 月 3 日[^。；]*适用三年持有期/);
  assert.match(cell, /首尾|包括|含/);
  assert.doesNotMatch(cell, /随时可售可租；三年内出售须缴卖家印花税/);
  assert.ok(hasIrasSource(html), 'Chinese SSD explanation must cite IRAS');
  assert.match(html, /2026 年 11 月 7 日/);
  assert.match(html, /本次仅更新 SSD 说明/);
});

test('focused SSD update keeps original publication dates and aligned article update metadata', () => {
  for (const prefix of ['', 'zh/']) {
    const html = read(`${prefix}insights/${SLUG}.html`);
    const article = schemas(html).find(item => item['@type'] === 'Article');
    assert.ok(article, `${prefix} article schema missing`);
    assert.equal(article.datePublished, '2026-09-14');
    assert.equal(article.dateModified, UPDATED);
    assert.ok(html.includes(`<meta property="article:modified_time" content="${UPDATED}">`));
  }
  const url = `https://joetay.com/insights/${SLUG}.html`;
  const item = JSON.parse(read('insights/feed.json')).items.find(entry => entry.id === url);
  assert.ok(item, 'English article must remain in the JSON feed');
  assert.equal(item.date_published, '2026-09-14T00:00:00+08:00');
  assert.equal(item.date_modified, `${UPDATED}T00:00:00+08:00`);
  const xml = read('insights/feed.xml');
  const entry = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .find(match => match[1].includes(url))?.[1];
  assert.ok(entry, 'English article must remain in the Atom feed');
  assert.ok(entry.includes(`<published>${item.date_published}</published>`));
  assert.ok(entry.includes(`<updated>${item.date_modified}</updated>`));
  const feedUpdated = xml.split('<entry>')[0].match(/<updated>([^<]+)<\/updated>/)?.[1];
  assert.ok(Date.parse(feedUpdated) >= Date.parse(item.date_modified));
});

test('policy consistency regressions are part of the full CI check command', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.match(scripts.check, /\bnpm run test:policy-content-consistency\b/);
  assert.equal(scripts['test:policy-content-consistency'], 'node --test tests/policy-content-consistency.test.mjs');
});
