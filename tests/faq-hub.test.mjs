import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FAQ_DESCRIPTION, FAQ_TITLE, FAQ_TOPICS, faqHubHtml, faqsOf, loadTopics } from '../scripts/generate-faq-hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'faq/index.html'), 'utf8');
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// AUDIT.md A3 / G6: one page answering the common seller and landlord
// questions, built only from answers the guides already publish.
test('the published FAQ hub is what the generator produces', () => {
  assert.equal(html, faqHubHtml());
});

test('every answer on the hub is the answer its source guide publishes, and links to that guide', () => {
  const topics = loadTopics();
  assert.ok(topics.length >= 7, `expected at least 7 topics, found ${topics.length}`);
  for (const topic of topics) {
    const published = new Map(faqsOf(topic.source));
    assert.ok(topic.faqs.length >= 3, `${topic.id}: too few questions`);
    const section = html.slice(html.indexOf(`<h2 id="${topic.id}">`));
    for (const [question, answer] of topic.faqs) {
      assert.equal(published.get(question), answer, `${topic.id}: "${question}" differs from its source`);
      assert.ok(section.includes(`<h3>${esc(question)}</h3>\n<p>${esc(answer)}</p>`), `${topic.id}: "${question}" missing from the hub`);
    }
    assert.ok(section.includes(`<p class="faq-more">Full guide: <a href="${topic.href}">`), `${topic.id}: no link to the full guide`);
    assert.ok(fs.existsSync(path.join(ROOT, topic.source)), `${topic.id}: source page missing`);
  }
});

test('no question appears twice and skipped questions exist on their source page', () => {
  const questions = loadTopics().flatMap((topic) => topic.faqs.map(([question]) => question));
  assert.equal(new Set(questions).size, questions.length, 'duplicate question on the hub');
  for (const topic of FAQ_TOPICS) {
    const published = faqsOf(topic.source).map(([question]) => question);
    if (!published.length) continue;
    for (const skipped of topic.skip || []) assert.ok(published.includes(skipped), `${topic.id}: skip entry "${skipped}" no longer matches a question`);
  }
});

test('the hub is a normal indexable page, reachable from the footer and the sitemap', () => {
  assert.ok(FAQ_TITLE.length <= 60, `title is ${FAQ_TITLE.length} characters`);
  assert.ok(FAQ_DESCRIPTION.length <= 160, `description is ${FAQ_DESCRIPTION.length} characters`);
  assert.match(html, /<link rel="canonical" href="https:\/\/joetay\.com\/faq\/">/);
  assert.match(html, /<h1 id="article-title">/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  // One marked-up instance of a repeated FAQ per site: the source guides keep it.
  assert.doesNotMatch(html, /"@type": "FAQPage"/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').includes('<loc>https://joetay.com/faq/</loc>'));
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/lib/site-footer.mjs'), 'utf8').includes("['/faq/',"));
});
