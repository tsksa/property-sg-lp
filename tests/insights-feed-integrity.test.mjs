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
