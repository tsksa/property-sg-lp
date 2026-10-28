import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Guards insights/feed.xml (Atom) and insights/feed.json (JSON Feed) against
// drifting from the source article titles. Both feeds are hand-maintained
// (no generator script — see ARCHITECTURE.md) and are advertised via
// <link rel="alternate"> on the homepage and every /insights/ page, so a
// mangled title is live in feed readers, not a dead file.
//
// The two formats decode differently, and copy-pasting one escaped string
// into both broke each in an opposite way:
//   - Atom/XML titles are escaped text: a literal "&" must appear as "&amp;".
//     Pasting an already-HTML-escaped title in verbatim double-escapes it
//     ("&amp;" -> "&amp;amp;"), so the reader shows the entity name itself.
//   - JSON Feed titles are plain text (JSON needs no entity escaping for
//     "&"), so the same HTML-escaped string ships the literal "&amp;" to
//     the reader instead of "&".
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSIGHTS_DIR = path.join(ROOT, 'insights');

test('Q3 2026 URA guide uses final figures with consistent cover, sources and update dates', () => {
  const slug = 'q3-2026-ura-private-home-prices';
  const url = `https://joetay.com/insights/${slug}.html`;
  const html = fs.readFileSync(path.join(INSIGHTS_DIR, `${slug}.html`), 'utf8');
  const source = 'https://www.ura.gov.sg/news/media/pr26-73/';
  const updated = '2026-10-28';
  // URA's full release, 23 October 2026, paragraphs 2–4. Keep Q2 comparators.
  const figures = [
    ['All private homes', '+0.5%', '+1.4%'],
    ['Non-landed private homes', '−0.1%', '+1.0%'],
    ['Core Central Region (CCR), non-landed', '+1.8%', '+0.3%'],
    ['Rest of Central Region (RCR), non-landed', '−1.2%', '0.0%'],
    ['Outside Central Region (OCR), non-landed', '−0.1%', '+2.3%'],
    ['Landed homes', '+2.5%', '+2.9%'],
  ];
  for (const [label, q2, q3] of figures) {
    assert.ok(html.includes(`<th scope="row">${label}</th><td>${q2}</td><td>${q3}</td>`), label);
  }
  assert.ok(html.includes('<th scope="col">Q3 2026 final figures</th>'));
  assert.ok(html.includes(source));
  assert.ok(html.includes('23 October 2026'));
  assert.doesNotMatch(html, /URA schedules|numbers may be revised|Treat volume comparisons as provisional/);
  const schema = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1])).find(s => s['@type'] === 'Article');
  assert.equal(schema.mainEntityOfPage, url);
  assert.equal(schema.datePublished, '2026-10-03');
  assert.equal(schema.dateModified, updated);
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.ok(html.includes(`<meta property="article:published_time" content="2026-10-03">`));
  assert.ok(html.includes(`<meta property="article:modified_time" content="${updated}">`));
  assert.ok(html.includes(`<time datetime="${updated}">Updated Oct 28, 2026</time>`));
  for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    assert.ok(html.includes(`<meta ${key} content="${schema.description}">`));
  }
  assert.match(schema.description, /final figures/);
  const cover = JSON.parse(fs.readFileSync(path.join(INSIGHTS_DIR, 'article-covers.json'), 'utf8'))
    .covers.find(c => c.slug === slug);
  assert.deepEqual(cover.figures, [
    { value: '1.4%', label: 'overall price growth · final figures' },
    { value: '2.3%', label: 'OCR non-landed growth · final figures' },
  ]);
  for (const { value, label } of cover.figures) assert.ok(html.includes(`${value} ${label}`));
  const item = JSON.parse(fs.readFileSync(path.join(INSIGHTS_DIR, 'feed.json'), 'utf8')).items.find(i => i.id === url);
  assert.equal(item.date_published, '2026-10-03T00:00:00+08:00');
  assert.equal(item.date_modified, `${updated}T00:00:00+08:00`);
  assert.equal(item.summary, schema.description);
  assert.equal(item.content_text, schema.description);
  const xml = fs.readFileSync(path.join(INSIGHTS_DIR, 'feed.xml'), 'utf8');
  const entry = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].find(m => m[1].includes(url))[1];
  assert.ok(entry.includes(`<published>${item.date_published}</published>`));
  assert.ok(entry.includes(`<updated>${item.date_modified}</updated>`));
  assert.ok(entry.includes(item.summary));
  assert.ok(xml.split('<entry>')[0].includes(`<updated>${item.date_modified}</updated>`));
  for (const file of ['index.html', 'insights/index.html']) {
    assert.ok(fs.readFileSync(path.join(ROOT, file), 'utf8').includes(item.summary), file);
  }
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for (const loc of [url, 'https://joetay.com/', 'https://joetay.com/insights/']) {
    const block = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
      .find(m => m[1].includes(`<loc>${loc}</loc>`))?.[1];
    assert.ok(block?.includes(`<lastmod>${updated}</lastmod>`), loc);
  }
});

test('upgrader guide preserves funding and tax caveats and discoverability', () => {
  const slug = 'sell-hdb-first-or-buy-condo-first';
  const html = fs.readFileSync(path.join(INSIGHTS_DIR, slug + '.html'), 'utf8');
  for (const phrase of [
    'Illustrative assumptions, not a loan offer or client result',
    'excluding any ABSD', 'The deposit is counted once',
    'TOP or CSC, whichever is earlier', 'at least one Singapore citizen',
    'not a private-condo approval assessment',
    '$230,000', '$280,000', '$480,000', '$435,000', '$45,000', '$25,000'
  ]) assert.ok(html.includes(phrase), phrase);
  for (const host of ['www.hdb.gov.sg', 'www.iras.gov.sg', 'www.cpf.gov.sg']) {
    assert.ok(html.includes('https://' + host + '/'));
  }
  for (const file of ['index.html', 'insights/index.html', 'insights/feed.xml', 'insights/feed.json', 'sitemap.xml']) {
    assert.ok(fs.readFileSync(path.join(ROOT, file), 'utf8').includes(slug), file);
  }
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const article = schemas.find(s => s['@type'] === 'Article');
  assert.ok(article.mainEntityOfPage.endsWith('/' + slug + '.html'));
  assert.equal(article.datePublished, '2026-09-20');
});

function decodeHtmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function sourceTitle(slug) {
  const html = fs.readFileSync(path.join(INSIGHTS_DIR, `${slug}.html`), 'utf8');
  const match = html.match(/<title>([^<]+)<\/title>/);
  assert.ok(match, `${slug}.html has no <title> to compare against`);
  return decodeHtmlEntities(match[1]).replace(/\s*\|\s*PropertySG$/, '').trim();
}

function slugFromUrl(url) {
  return path.basename(new URL(url).pathname, '.html');
}

test('feed.xml entry titles match their source article title exactly once-decoded', () => {
  const xml = fs.readFileSync(path.join(INSIGHTS_DIR, 'feed.xml'), 'utf8');
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let entries = 0;
  let match;
  while ((match = entryRe.exec(xml))) {
    entries += 1;
    const block = match[1];
    const title = block.match(/<title>([^<]+)<\/title>/)[1];
    const link = block.match(/<link href="([^"]+)"/)[1];
    const slug = slugFromUrl(link);
    assert.equal(
      decodeHtmlEntities(title),
      sourceTitle(slug),
      `feed.xml <title> for ${slug} doesn't match the article title once XML-decoded — check for double-escaped entities (e.g. "&amp;amp;")`,
    );
  }
  assert.ok(entries > 0, 'feed.xml has no <entry> elements to check');
});

test('feed.json item titles are raw text, not HTML-escaped', () => {
  const feed = JSON.parse(fs.readFileSync(path.join(INSIGHTS_DIR, 'feed.json'), 'utf8'));
  assert.ok(feed.items.length > 0, 'feed.json has no items to check');
  for (const item of feed.items) {
    const slug = slugFromUrl(item.url);
    assert.equal(
      item.title,
      sourceTitle(slug),
      `feed.json title for ${slug} doesn't match the article title — JSON Feed values are plain text, ` +
        'so an HTML entity like "&amp;" here ships the literal entity name instead of the character',
    );
  }
});

test('MOP seller guide preserves canonical, FAQ parity, sources and consistent review dates', () => {
  const slug = 'selling-hdb-after-mop-singapore';
  const html = fs.readFileSync(path.join(INSIGHTS_DIR, `${slug}.html`), 'utf8');
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const article = schemas.find(s => s['@type'] === 'Article');
  assert.equal(article.mainEntityOfPage, `https://joetay.com/insights/${slug}.html`);
  assert.equal(article.datePublished, '2026-04-21');
  assert.equal(article.dateModified, '2026-10-23');
  assert.ok(html.includes(`<link rel="canonical" href="${article.mainEntityOfPage}">`));
  assert.match(html, /<meta name="robots" content="index,follow/);
  assert.match(html, /<time datetime="2026-10-23">Updated Oct 23, 2026<\/time>/);
  assert.match(html, /<meta property="article:modified_time" content="2026-10-23">/);
  const faq = schemas.find(s => s['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 5);
  for (const entry of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${entry.name}</h3>`));
    assert.ok(html.includes(`<p>${entry.acceptedAnswer.text}</p>`));
  }
  for (const phrase of ['10-year MOP', 'non-occupation', 'Retirement Account', 'market value', 'within seven calendar days of each other', 'not an automatic ABSD refund', 'TOP or CSC, whichever is earlier', 'Illustrative assumptions, not a client result or fee quote']) {
    assert.ok(html.includes(phrase), phrase);
  }
  for (const obsolete of ['3–4 months minimum', '10 working days', '6 days to endorse', 'The agent who sold the BTO', 'often $25,000 to $50,000']) assert.ok(!html.includes(obsolete), obsolete);
  for (const host of ['www.hdb.gov.sg', 'www.cpf.gov.sg', 'www.iras.gov.sg']) assert.ok(html.includes(`https://${host}/`));
  const feed = JSON.parse(fs.readFileSync(path.join(INSIGHTS_DIR, 'feed.json'), 'utf8')).items.find(i => i.id === article.mainEntityOfPage);
  assert.equal(feed.date_published, '2026-04-21T00:00:00+08:00');
  assert.equal(feed.date_modified, '2026-10-23T00:00:00+08:00');
  const entry = [...fs.readFileSync(path.join(INSIGHTS_DIR, 'feed.xml'), 'utf8').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].find(m => m[1].includes(article.mainEntityOfPage))[1];
  assert.ok(entry.includes(`<updated>${feed.date_modified}</updated>`));
  assert.ok(entry.includes(feed.summary));
  assert.ok(fs.readFileSync(path.join(INSIGHTS_DIR, 'index.html'), 'utf8').includes(feed.summary));
  for (const [file, anchor] of [['sell-hdb/singapore/index.html', 'the-common-mistakes'], ['insights/how-long-to-sell-hdb-singapore-2026.html', 'worked-sale-proceeds']]) {
    assert.ok(fs.readFileSync(path.join(ROOT, file), 'utf8').includes(`/insights/${slug}.html#${anchor}`));
    assert.ok(html.includes(`id="${anchor}"`));
  }
});
