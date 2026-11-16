import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GUIDE_CTAS, CTA_START, CTA_END, WHATSAPP, guideEndCtaHtml } from '../scripts/lib/guide-cta.mjs';
import { applyGuideCta } from '../scripts/apply-guide-ctas.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// AUDIT.md C3: every guide ends on a prompt tied to its topic. Each guide is in
// exactly one group, so a new guide fails here until someone decides its prompt.
const ALREADY_TOPICAL = [
  'hfe-letter-singapore-guide', 'hdb-loan-vs-bank-loan-singapore', 'sell-hdb-first-or-buy-condo-first',
  'hdb-resale-prices-2q-2026-by-town', 'hdb-resale-prices-3q-2026-by-town', 'new-condo-launches-2026-2027-calendar',
  'singapore-mega-launches-2027', 'cheapest-4-room-5-room-hdb-resale-flats', 'q3-2026-ura-private-home-prices',
  'singapore-rental-market-3q-2026',
];
// Their end blocks carry fee or track-record wording: Joe's call (CHANGES.md, "Needs Joe").
const NEEDS_JOE = ['property-agent-commission-singapore', 'hdb-valuation-explained', 'selling-hdb-after-mop-singapore'];

test('every guide is accounted for exactly once', () => {
  const guides = fs.readdirSync(path.join(ROOT, 'insights'))
    .filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, ''));
  const groups = [...Object.keys(GUIDE_CTAS), ...ALREADY_TOPICAL, ...NEEDS_JOE];
  assert.equal(new Set(groups).size, groups.length, 'a guide is listed twice');
  assert.deepEqual([...guides].sort(), [...groups].sort());
  for (const slug of ALREADY_TOPICAL) {
    assert.match(read(`insights/${slug}.html`), /href="https:\/\/wa\.me\/6581881488\?text=[^"]+"/, `${slug}: expected its own topic WhatsApp prompt`);
  }
});

test('each listed guide ends on its own prompt, exactly as the list defines it', () => {
  for (const slug of Object.keys(GUIDE_CTAS)) {
    const html = read(`insights/${slug}.html`);
    const block = guideEndCtaHtml(slug);
    assert.equal(html.split(CTA_START).length - 1, 1, `${slug}: one prompt only`);
    assert.ok(html.includes(block), `${slug}: prompt is out of step; run npm run apply:guide-ctas or regenerate`);
    assert.equal(applyGuideCta(html, slug), html, `${slug}: apply script would change it`);
    assert.doesNotMatch(html, /<h3>Thinking about selling\?<\/h3>/, `${slug}: generic box still present`);
    const end = html.indexOf(CTA_END);
    assert.ok(end > html.indexOf('<h1') && end < html.indexOf('</article>'), `${slug}: prompt sits inside the article`);
  }
});

test('prompts are tracked, unique per guide, and link to pages that exist', () => {
  const locations = new Set();
  for (const [slug, cta] of Object.entries(GUIDE_CTAS)) {
    assert.match(cta.location, /^[a-z0-9_]+$/, slug);
    assert.match(cta.leadType, /^[a-z_]+$/, slug);
    assert.ok(!locations.has(cta.location), `${slug}: data-cta-location reused`);
    locations.add(cta.location);
    const block = guideEndCtaHtml(slug);
    const tracked = `data-cta-location="insights_${cta.location}_end" data-lead-type="${cta.leadType}"`;
    assert.equal(block.split(tracked).length - 1, 2, `${slug}: both buttons must be tracked`);
    const wa = block.match(/href="(https:\/\/wa\.me\/[^"]+)"/)[1];
    assert.equal(decodeURIComponent(wa.slice(`${WHATSAPP}?text=`.length)), cta.wa, slug);
    const file = cta.href.endsWith('/') ? `${cta.href.slice(1)}index.html` : cta.href.slice(1);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${slug}: ${cta.href} does not exist`);
    assert.doesNotMatch(cta.heading + cta.text + cta.waLabel + cta.label, /[<>&"]/, `${slug}: copy must not need escaping`);
  }
});

// Joe's standing rule: no fees, track-record numbers, testimonials or promised reply times.
test('no prompt states a fee, a track record, a testimonial or a reply time', () => {
  for (const [slug, cta] of Object.entries(GUIDE_CTAS)) {
    const copy = [cta.heading, cta.text, cta.wa, cta.waLabel, cta.label].join(' ');
    assert.doesNotMatch(copy, /commission|\bfee\b|\d+\+|\$\d+M|testimonial|review|within \d+ (?:hours?|minutes?|days?)|24 hours/i, slug);
    assert.doesNotMatch(copy.replace(/30% MSR/g, ''), /\d%/, `${slug}: percentages other than the MSR rule`);
  }
});
