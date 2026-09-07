import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fontLinksHtml, FONT_FILES } from '../scripts/lib/self-hosted-fonts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = /^(node_modules|\.git|\.claude|tests|scripts|netlify|\.github)(\/|$)/;

function* htmlFiles(dir = ROOT) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (SKIP.test(rel)) continue;
    if (entry.isDirectory()) yield* htmlFiles(abs);
    else if (entry.name.endsWith('.html')) yield rel;
  }
}

// 7 Sep 2026 audit: LCP 2.9s with the critical path through fonts.googleapis.com
// and fonts.gstatic.com. Fonts are now served from /assets/fonts. These pin
// that no page quietly goes back to the third-party path.
test('the two font files exist and are WOFF2', () => {
  for (const file of Object.values(FONT_FILES)) {
    const abs = path.join(ROOT, file);
    assert.ok(fs.existsSync(abs), `${file} missing`);
    assert.equal(fs.readFileSync(abs).subarray(0, 4).toString('latin1'), 'wOF2', `${file} is not WOFF2`);
    assert.ok(fs.statSync(abs).size < 120_000, `${file} is larger than the latin subset should be`);
  }
});

test('no page loads fonts from Google, and every font-using page carries the self-hosted block', () => {
  let withFonts = 0;
  for (const rel of htmlFiles()) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${rel} still references Google Fonts`);
    // A page uses the families if its own CSS names them or it links one of the
    // section stylesheets that do. The shared theme/header sheets only name
    // them in a fallback stack, so /about-joe/ (Georgia + system fonts) is
    // rightly left without a 130 KB preload it would never paint.
    const own = html.replace(/<style data-jt-fonts="[^"]*">[^<]*<\/style>/, '');
    if (!/Fraunces|DM Sans/.test(own) && !/new-launches\.css|blog\.css|ads-landing\.css/.test(html)) continue;
    withFonts += 1;
    const display = html.match(/<style data-jt-fonts="(swap|optional)">/)?.[1];
    assert.ok(display, `${rel} has no self-hosted font block`);
    assert.ok(html.includes(fontLinksHtml({ display })), `${rel} font block differs from scripts/lib/self-hosted-fonts.mjs`);
    assert.equal((html.match(/data-jt-fonts=/g) || []).length, 1, `${rel} has more than one font block`);
  }
  assert.ok(withFonts >= 100, `only ${withFonts} pages carry fonts`);
});

test('the CSP no longer allows the Google Fonts hosts and serves fonts from self', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.doesNotMatch(toml, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(toml, /font-src 'self'/);
  assert.match(toml, /for = "\/assets\/fonts\/\*"[\s\S]*?Cache-Control = "public, max-age=31536000, immutable"/);
});
