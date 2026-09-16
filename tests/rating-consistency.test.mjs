import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// The bug this pins: the homepage showed "4.9★ Average Rating" in two places
// while its RealEstateAgent schema declared ratingValue 5 with reviewCount 7,
// and all seven Review entries on the page were 5/5. Nothing on the site
// produced 4.9. A visible star rating that contradicts the markup is exactly
// what Google's review-snippet guidelines treat as misleading, and it is the
// kind of number that drifts silently because it lives in prose.

function jsonLdBlocks(source) {
  return [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}

const blocks = jsonLdBlocks(html);
const rated = blocks.find((b) => b.aggregateRating);

test('the homepage declares an aggregate rating', () => {
  assert.ok(rated, 'no JSON-LD block on index.html carries an aggregateRating');
});

test('reviewCount equals the number of Review entries actually published', () => {
  const reviews = rated.review || [];
  assert.equal(
    Number(rated.aggregateRating.reviewCount),
    reviews.length,
    `aggregateRating.reviewCount is ${rated.aggregateRating.reviewCount} but ${reviews.length} Review entries are published`,
  );
});

test('every published review is within the declared rating scale', () => {
  const best = Number(rated.aggregateRating.bestRating || 5);
  const worst = Number(rated.aggregateRating.worstRating || 1);
  for (const review of rated.review || []) {
    const value = Number(review.reviewRating?.ratingValue);
    assert.ok(
      Number.isFinite(value) && value >= worst && value <= best,
      `review by ${review.author?.name} has ratingValue ${review.reviewRating?.ratingValue}, outside ${worst}–${best}`,
    );
  }
});

test('aggregateRating.ratingValue is the mean of the published reviews', () => {
  const values = (rated.review || []).map((r) => Number(r.reviewRating?.ratingValue));
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  assert.equal(
    Number(rated.aggregateRating.ratingValue).toFixed(1),
    mean.toFixed(1),
    `schema claims ${rated.aggregateRating.ratingValue} but the ${values.length} published reviews average ${mean.toFixed(2)}`,
  );
});

test('every visible star rating on the page matches the schema', () => {
  const declared = Number(rated.aggregateRating.ratingValue).toFixed(1);
  const shown = [...html.matchAll(/(\d(?:\.\d)?)\s*★/g)].map((m) => m[1]);
  assert.ok(shown.length > 0, 'expected at least one visible "N★" rating on the homepage');
  for (const value of shown) {
    assert.equal(
      Number(value).toFixed(1),
      declared,
      `visible rating "${value}★" contradicts the schema's ratingValue ${declared}`,
    );
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
