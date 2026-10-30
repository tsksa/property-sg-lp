import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const ARTICLE = 'insights/how-long-to-sell-hdb-singapore-2026.html';
const URL = `https://joetay.com/${ARTICLE}`;
const html = read(ARTICLE);
const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
  .map(match => JSON.parse(match[1]));

test('selling timeline keeps its canonical URL and separates marketing from HDB completion', () => {
  assert.ok(html.includes(`<link rel="canonical" href="${URL}">`));
  assert.equal((visible.match(/<h1\b/g) || []).length, 1);
  assert.match(visible, /about 8 weeks after acceptance of the resale application/);
  assert.match(visible, /variable marketing period, not an HDB processing deadline/);
  assert.match(visible, /Submission is not acceptance, and acceptance is not final approval/);
  assert.doesNotMatch(visible, /4–8 weeks from listing|3–4 months from|21st day|bank pays|10 working days|resets the algorithm|2–3× longer/);
});

test('OTP guidance distinguishes the fee cap, option deadline and application window', () => {
  assert.match(visible, /Option Fee is S\$1–S\$1,000/);
  assert.match(visible, /no more than S\$5,000/);
  assert.match(visible, /Neither fee can be zero/);
  assert.match(visible, /21 calendar days after the Option Date/);
  assert.match(visible, /expires at <strong>4pm<\/strong>/);
  assert.match(visible, /Request for Value by the next working day after the Option Date/);
  assert.match(visible, /Once one party submits, the other must submit within <strong>7 calendar days/);
  assert.match(visible, /not a blanket seven-day deadline measured from exercising the option/);
  assert.match(visible, /buyer's agreement and HDB's approval/);
});

test('FAQ schema has exactly matching visible native disclosure answers', () => {
  const faqs = schemas.filter(schema => schema['@type'] === 'FAQPage');
  assert.equal(faqs.length, 1);
  assert.equal(faqs[0].mainEntity.length, 4);
  for (const item of faqs[0].mainEntity) {
    assert.ok(visible.includes(`<summary>${item.name}</summary><p>${item.acceptedAnswer.text}</p>`), item.name);
  }
  assert.equal((visible.match(/<details class="timeline-faq">/g) || []).length, 4);
  assert.match(html, /\.timeline-faq summary:focus-visible/);
});

test('guide has working section anchors, official sources and relevant internal links', () => {
  for (const id of ['sale-stages', 'hdb-option-fee', 'resale-application', 'moving-checklist', 'timeline-faq']) {
    assert.ok(visible.includes(`href="#${id}"`));
    assert.equal((visible.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  for (const suffix of ['resale-flat-completion', 'resale-flat-application/application-process', 'resale-flat-application/approval-of-application', 'resale-flat-application/request-for-temporary-extension-of-stay']) {
    assert.ok(visible.includes(`https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/${suffix}`));
  }
  assert.ok(visible.includes('https://www.hdb.gov.sg/e-resale/valuation-request'));
  for (const target of ['/calculator/', '/stamp-duty-calculator/', '/neighbour-prices/', '/insights/property-agent-commission-singapore.html']) {
    assert.ok(visible.includes(`href="${target}"`));
  }
});

test('article, discovery card and feeds agree without changing the original publication date', () => {
  const article = schemas.find(schema => schema['@type'] === 'Article');
  const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.equal(article.datePublished, '2026-04-21');
  assert.equal(article.dateModified, '2026-08-26');
  assert.equal(article.description, description);
  assert.ok(visible.includes('<time datetime="2026-08-26">Updated Aug 26, 2026</time>'));
  for (const key of ['og:description', 'twitter:description']) assert.ok(html.includes(`="${key}" content="${description}"`));
  assert.ok(read('insights/index.html').includes(description));
  const item = JSON.parse(read('insights/feed.json')).items.find(item => item.url === URL);
  assert.equal(item.summary, description);
  assert.equal(item.content_text, description);
  assert.equal(item.date_published, '2026-04-21T00:00:00+08:00');
  assert.equal(item.date_modified, '2026-08-26T00:00:00+08:00');
  const entry = [...read('insights/feed.xml').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].find(match => match[1].includes(URL))[1];
  assert.ok(entry.includes(`<summary type="text">${description}</summary>`));
  assert.ok(entry.includes('<updated>2026-08-26T00:00:00+08:00</updated>'));
});

test('glossary OTP definition matches its schema and links to the fee explanation', () => {
  const glossary = read('glossary/index.html');
  const term = JSON.parse(glossary.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)[1]);
  const otp = term.hasDefinedTerm.find(item => item.name === 'OTP');
  const definition = glossary.match(/<div class="g-term" id="otp">([\s\S]*?)<\/div>/)[1];
  assert.ok(definition.includes(otp.description));
  assert.ok(definition.includes(`href="/${ARTICLE}#hdb-option-fee"`));
});

// The step-by-step selling guide (JOE-469) covers process and costs; the
// timeline article keeps the week-by-week detail. Each links the other.
const GUIDE = 'insights/how-to-sell-hdb-flat-singapore.html';
const GUIDE_URL = `https://joetay.com/${GUIDE}`;

test('how-to-sell guide exists with breadcrumb, FAQ parity and Joe as author', () => {
  const guide = read(GUIDE);
  const guideVisible = guide.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const guideSchemas = [...guide.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  assert.ok(guide.includes(`<link rel="canonical" href="${GUIDE_URL}">`));
  assert.equal((guideVisible.match(/<h1\b/g) || []).length, 1);
  const article = guideSchemas.find(schema => schema['@type'] === 'Article');
  assert.equal(article.author['@id'], 'https://joetay.com/about-joe/#joe-tay');
  assert.equal(article.publisher['@id'], 'https://joetay.com/#agent');
  assert.equal(article.author.jobTitle, undefined);
  assert.equal(article.mainEntityOfPage, GUIDE_URL);
  const crumbs = guideSchemas.find(schema => schema['@type'] === 'BreadcrumbList');
  assert.equal(crumbs.itemListElement.at(-1).item, GUIDE_URL);
  const faqs = guideSchemas.filter(schema => schema['@type'] === 'FAQPage');
  assert.equal(faqs.length, 1);
  for (const item of faqs[0].mainEntity) {
    assert.ok(guideVisible.includes(`<summary>${item.name}</summary><p>${item.acceptedAnswer.text}</p>`), item.name);
  }
  assert.match(guideVisible, /Joe Tay<\/a><\/strong> · CEA R009618D<\/div>/);
  assert.doesNotMatch(guide, /500\+|16\+ y|\$200M|\$8M|jobTitle/);
});

test('how-to-sell guide cites official sources and reconciles its worked example', () => {
  const guide = read(GUIDE);
  for (const source of [
    'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/eligibility',
    'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/intent-to-sell',
    'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/option-to-purchase',
    'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-application/application-process',
    'https://www.hdb.gov.sg/e-resale/valuation-request',
    'https://www.cpf.gov.sg/member/infohub/educational-resources/sales-proceeds-after-selling-your-home',
    'https://www.cea.gov.sg/consumers/engaging-a-property-agent/buying-or-selling/',
  ]) assert.ok(guide.includes(`href="${source}"`), source);
  assert.match(guide, /Illustrative figures only, not a quote, a valuation or a client result/);
  // HDB's conveyancing scale on $600,000, rounded up to the dollar.
  const legal = Math.ceil((300 * 6.75 + 300 * 5.4 + 5400 * 4.5) / 100);
  assert.equal(legal, 280);
  const cash = 600000 - 150000 - 220000;
  assert.ok(guide.includes(`<td>$${cash.toLocaleString('en-SG')}</td>`));
  const left = cash - 12000 - 1080 - legal - 59.95 - 80;
  assert.ok(guide.includes(`<td>$${left.toLocaleString('en-SG', { minimumFractionDigits: 2 })}</td>`));
  // CEA is cited only for "no fixed rate"; 2% is presented as Joe's quote.
  assert.match(guide, /CEA publishes no fixed rates or guidelines on commission amounts/);
  assert.doesNotMatch(guide, /CEA[^.]{0,80}2%/);
});

test('how-to-sell guide and the related seller pages link to each other', () => {
  const guide = read(GUIDE);
  for (const target of [
    `/${ARTICLE}`,
    '/insights/hdb-valuation-explained.html',
    '/insights/property-agent-commission-singapore.html',
    '/insights/selling-hdb-after-mop-singapore.html',
    '/insights/hfe-letter-singapore-guide.html',
    '/hdb-prices/',
    '/sell-hdb/singapore/',
  ]) assert.ok(guide.includes(`href="${target}"`), target);
  assert.ok(visible.includes(`<a href="/${GUIDE}">how to sell your HDB flat, step by step</a>`));
  for (const file of ['insights/hdb-valuation-explained.html', 'insights/property-agent-commission-singapore.html', 'sell-hdb/singapore/index.html']) {
    assert.ok(read(file).includes(`href="/${GUIDE}`), file);
  }
  for (const file of ['insights/index.html', 'insights/feed.xml', 'insights/feed.json', 'sitemap.xml', 'llms.txt']) {
    assert.ok(read(file).includes(GUIDE_URL.replace('https://joetay.com/insights/', '')), file);
  }
});
