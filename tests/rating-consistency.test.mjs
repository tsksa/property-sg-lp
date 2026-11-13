import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// The bug this pins: the homepage showed "4.9★ Average Rating" in two places
// while every review published on the page was 5/5. Nothing on the site
// produced 4.9. A headline rating that contradicts the reviews beside it is
// misleading, and it is the kind of number that drifts silently because it
// lives in prose.
//
// The reviews were also marked up as schema.org AggregateRating / Review on the
// RealEstateAgent entity. That markup was removed (AUDIT.md A2): the reviews
// were written on PropertyGuru and FindPropertyAgent, not collected here, and
// Google does not show stars for a business's markup about itself. The visible
// review cards are now the source of truth these tests check against.

const cards = [...html.matchAll(/<div class="testi-card[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/g)].map((m) => m[1]);
const cardRatings = cards.map((card) => Number(card.match(/class="testi-rating">([\d.]+)</)?.[1]));

test('the homepage publishes review cards, each with a rating', () => {
  assert.ok(cards.length > 0, 'no review cards found on index.html');
  for (const [i, value] of cardRatings.entries()) {
    assert.ok(Number.isFinite(value) && value >= 1 && value <= 5, `review card ${i + 1} has no rating between 1 and 5`);
  }
});

test('the stated review count equals the number of review cards published', () => {
  const stated = html.match(/from (\d+) reviews/);
  assert.ok(stated, 'expected a visible "from N reviews" count on the homepage');
  assert.equal(Number(stated[1]), cards.length, `the page says ${stated[1]} reviews but publishes ${cards.length} review cards`);
});

test('every headline star rating on the page is the mean of the published reviews', () => {
  const mean = (cardRatings.reduce((sum, v) => sum + v, 0) / cardRatings.length).toFixed(1);
  const shown = [...html.matchAll(/(\d(?:\.\d)?)\s*★/g)].map((m) => m[1]);
  assert.ok(shown.length > 0, 'expected at least one visible "N★" rating on the homepage');
  for (const value of shown) {
    assert.equal(Number(value).toFixed(1), mean, `visible rating "${value}★" contradicts the published reviews, which average ${mean}`);
  }
});

test('the homepage does not mark up third-party reviews as its own rating', () => {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const block = JSON.parse(m[1]);
    assert.equal(block.aggregateRating, undefined, 'aggregateRating is back in the homepage JSON-LD');
    assert.equal(block.review, undefined, 'review markup is back in the homepage JSON-LD');
  }
});

test('favicon.ico exists at the web root so /favicon.ico does not 404', () => {
  const file = path.join(ROOT, 'favicon.ico');
  assert.ok(fs.existsSync(file), 'favicon.ico is missing — browsers and Google request it on every page');
  // ICO header: reserved 0x0000, type 0x0001, then the image count.
  const header = fs.readFileSync(file).subarray(0, 6);
  assert.equal(header.readUInt16LE(0), 0, 'favicon.ico is not a valid ICO (reserved field)');
  assert.equal(header.readUInt16LE(2), 1, 'favicon.ico is not a valid ICO (type field)');
  assert.ok(header.readUInt16LE(4) >= 1, 'favicon.ico contains no images');
});
