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
