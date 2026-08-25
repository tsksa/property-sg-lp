import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const ARTICLE_TITLE = 'Property Agent Commission Singapore: What 2% Covers';
const HUB_TITLE = 'Property agent commission in Singapore: what 2% covers';

test('commission article answers the Search Console query intent with sourced visible guidance', () => {
  const html = read('insights/property-agent-commission-singapore.html');

  assert.match(html, new RegExp(`<title>${ARTICLE_TITLE}</title>`));
  assert.match(html, /<h1[^>]*>Property agent commission in Singapore: what 2% covers<\/h1>/);
  assert.match(html, /<h2>Are property agent commission rates fixed in Singapore\?<\/h2>/);
  assert.match(html, /<h2>HDB, condo and buyer-agent fees at a glance<\/h2>/);
  assert.match(html, /<h3>What is the property agent commission for selling an HDB flat in Singapore\?<\/h3>/);
  assert.match(html, /<h3>Is condo seller agent commission fixed in Singapore\?<\/h3>/);
  assert.match(html, /<h3>Who pays a dedicated buyer's agent in Singapore\?<\/h3>/);
  assert.match(html, /<h3>When is property agent commission paid, and is GST added\?<\/h3>/);
  assert.match(html, /<h2>Do you pay an agent fee if you found the property on 99\.co\?<\/h2>/);
  assert.match(html, /https:\/\/www\.cea\.gov\.sg\/consumers\/engaging-a-property-agent\//);
  assert.match(html, /https:\/\/www\.hdb\.gov\.sg\/managing-my-home\/selling-a-flat\//);
  assert.match(html, /https:\/\/intercom\.help\/99faq\/en\/articles\/117729-do-i-need-to-pay-commission/);
  assert.doesNotMatch(html, /The Singapore commission standard|2% is industry-standard/);
});

test('commission FAQ schema mirrors the new HDB, condo, buyer-agent and payment answers', () => {
  const html = read('insights/property-agent-commission-singapore.html');
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');

  assert.ok(faq, 'missing FAQPage structured data');
  assert.deepEqual(
    faq.mainEntity.map((entry) => entry.name),
    [
      'What is the property agent commission for selling an HDB flat in Singapore?',
      'Is condo seller agent commission fixed in Singapore?',
      "Who pays a dedicated buyer's agent in Singapore?",
      'When is property agent commission paid, and is GST added?',
    ],
  );
  assert.match(faq.mainEntity[0].acceptedAnswer.text, /no fixed HDB seller agent fee/i);
  assert.match(faq.mainEntity[1].acceptedAnswer.text, /no official fixed condo seller commission/i);
  assert.match(faq.mainEntity[2].acceptedAnswer.text, /cannot also represent or collect commission from the seller/i);
  assert.match(faq.mainEntity[2].acceptedAnswer.text, /Luxury or off-market searches do not have a separate CEA-prescribed fee structure/i);
  assert.match(faq.mainEntity[3].acceptedAnswer.text, /paid after the property transaction is completed/i);
});

test('homepage commission claims match CEA guidance and the article', () => {
  const homepage = read('index.html');

  assert.match(homepage, /Commission rates are negotiable in Singapore/);
  assert.match(homepage, /No single commission rate is fixed in Singapore/);
  assert.doesNotMatch(homepage, /standard for Singapore property|Singapore's industry standard/i);
  assert.doesNotMatch(homepage, /typically closes? 5(?:-|–)10% higher/i);
});

test('commission article connects Joe to independently verifiable profiles', () => {
  const html = read('insights/property-agent-commission-singapore.html');
  for (const url of [
    'https://propertyportal.era.com.sg/agent/detail/R009618D',
    'https://www.propertyguru.com.sg/agent/joe-tay-80979',
    'https://www.srx.com.sg/joetay',
  ]) {
    assert.ok(html.includes(url), `missing independent profile: ${url}`);
  }

  const articleSchema = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1]))
    .find((schema) => schema['@type'] === 'Article');
  assert.ok(articleSchema, 'missing Article structured data');
  assert.deepEqual(articleSchema.author.sameAs, [
    'https://propertyportal.era.com.sg/agent/detail/R009618D',
    'https://www.propertyguru.com.sg/agent/joe-tay-80979',
    'https://www.srx.com.sg/joetay',
  ]);
});

test('insights hub and feeds use the same search-focused title', () => {
  const hub = read('insights/index.html');
  const atom = read('insights/feed.xml');
  const jsonFeed = JSON.parse(read('insights/feed.json'));
  const item = jsonFeed.items.find(
    (entry) => entry.url === 'https://joetay.com/insights/property-agent-commission-singapore.html',
  );

  assert.ok(hub.includes(HUB_TITLE));
  assert.match(hub, /<span>10 min read<\/span>[\s\S]*?<h2>Property agent commission in Singapore: what 2% covers<\/h2>/);
  assert.ok(atom.includes(`<title>${ARTICLE_TITLE}</title>`));
  assert.equal(item?.title, ARTICLE_TITLE);
});
