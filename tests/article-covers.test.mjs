// Article covers (JOE-398): every insights article opens with a cover image
// that is also its share preview, and a cover may only repeat what its article
// says. See scripts/lib/article-covers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateCover, chartBars, highlighted, parseMoney, articleText, coverPaths, COVER_MARKER, CARD_MARKER,
} from '../scripts/lib/article-covers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { covers } = JSON.parse(read('insights/article-covers.json'));
const articles = fs.readdirSync(path.join(ROOT, 'insights')).filter((f) => f.endsWith('.html') && f !== 'index.html');

test('every insights article has a cover', () => {
  const slugs = new Set(covers.map((c) => c.slug));
  for (const f of articles) {
    assert.ok(slugs.has(f.replace(/\.html$/, '')), `insights/${f} has no cover: add it to insights/article-covers.json, then run node scripts/build-article-covers.mjs and node scripts/apply-article-cover.mjs`);
  }
});

test('every cover figure and chart label appears word for word in its article', () => {
  for (const c of covers) {
    assert.deepEqual(validateCover(c, read(`insights/${c.slug}.html`)), [], c.slug);
  }
});

test('a figure the article does not contain is rejected', () => {
  const html = '<h1>T</h1><div class="article-meta-top"><span class="cat">Buying</span></div><p>The ceiling is $16,000.</p>';
  assert.deepEqual(validateCover({ slug: 'x', title: 'T', figures: [{ value: '$16,000', label: 'l' }] }, html), []);
  assert.match(validateCover({ slug: 'x', title: 'T', figures: [{ value: '$18,000', label: 'l' }] }, html)[0], /does not appear/);
});

test('chart bars are read from the article table, sorted, from $0', () => {
  const html = `<h1>T</h1><table><thead><tr><th>Town</th><th>4-room</th></tr></thead><tbody>
    <tr><td>Bedok</td><td>$585,000 (123)</td></tr><tr><td>Bishan</td><td>—</td></tr><tr><td>Yishun</td><td>$550,000 (90)</td></tr>
  </tbody></table>`;
  const bars = chartBars(html, { table: 0, labelColumn: 'Town', valueColumn: '4-room' });
  assert.deepEqual(bars.map((b) => [b.label, b.value]), [['Yishun', 550000], ['Bedok', 585000]], 'a town without a price is left out, not drawn at zero');
  assert.deepEqual(highlighted(bars, 'ends').map((b) => b.label), ['Yishun', 'Bedok']);
  assert.equal(parseMoney('$1,194,444 (9)'), 1194444);
  assert.match(articleText('<h1>A&nbsp;B</h1><script>x</script><p>C &amp; D</p>'), /A B C & D/);
});

test('cover images exist in every size and stay small', () => {
  for (const c of covers) {
    for (const [kind, p] of Object.entries(coverPaths(c.slug))) {
      const file = path.join(ROOT, p);
      assert.ok(fs.existsSync(file), `${c.slug}: missing ${p}`);
      const kb = fs.statSync(file).size / 1024;
      assert.ok(kb < 150, `${c.slug}: ${kind} is ${Math.round(kb)} KB`);
    }
  }
});

test('each article opens with its cover and uses it as the share preview', () => {
  for (const c of covers) {
    const html = read(`insights/${c.slug}.html`);
    const url = `https://joetay.com${coverPaths(c.slug).jpg}`;
    assert.equal((html.match(new RegExp(COVER_MARKER, 'g')) || []).length, 1, `${c.slug}: expected one cover figure`);
    assert.ok(html.indexOf(COVER_MARKER) < html.indexOf('<section class="article-body"'), `${c.slug}: the cover must come before the article body`);
    assert.match(html, new RegExp(`<meta property="og:image" content="${url}">`), `${c.slug}: og:image`);
    assert.match(html, new RegExp(`<meta name="twitter:image" content="${url}">`), `${c.slug}: twitter:image`);
    assert.ok(html.includes(`"image": "${url}"`), `${c.slug}: BlogPosting image`);
    const alt = html.match(/<figure class="article-cover"[\s\S]*?alt="([^"]+)"/)[1];
    assert.ok(alt.length > 20, `${c.slug}: cover needs a descriptive alt`);
    assert.ok(html.includes(`<meta property="og:image:alt" content="${alt}">`), `${c.slug}: og:image:alt should match the cover alt`);
  }
});

test('every index card carries its cover thumbnail', () => {
  const index = read('insights/index.html');
  assert.equal((index.match(new RegExp(CARD_MARKER, 'g')) || []).length, covers.length);
  for (const c of covers) {
    assert.match(index, new RegExp(`<a href="${c.slug}\\.html" class="blog-card">\\s*<picture class="blog-card-img" ${CARD_MARKER}>`), `${c.slug}: card thumbnail`);
  }
});
