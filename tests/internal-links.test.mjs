import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findBrokenLinks, findHtmlFiles, findRedirectHops } from '../scripts/check-internal-links.mjs';

// A typo'd href or a link left pointing at a deleted page should fail before a
// visitor or crawler hits the 404. This guards the two failure modes: a target that plainly
// doesn't exist, and a target that exists only via a forced 301 (still reaches
// the visitor, but every hop leaks link equity and crawl budget).

async function withFixtureSite(files, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'internal-links-test-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('the live site has zero broken internal links', () => {
  const broken = findBrokenLinks();
  assert.deepEqual(broken, [], `unexpected broken link(s): ${JSON.stringify(broken)}`);
});

test('the live site has zero links that hop through a forced redirect', () => {
  const hops = findRedirectHops();
  assert.deepEqual(hops, [], `unexpected redirect hop(s): ${JSON.stringify(hops)}`);
});

test('the guard catches a link to a page that does not exist', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="/">home</a> <a href="/missing-page.html">gone</a>',
    },
    (dir) => {
      const broken = findBrokenLinks(dir);
      assert.equal(broken.length, 1);
      assert.equal(broken[0].href, '/missing-page.html');
    },
  );
});

test('a link that resolved before a page was deleted now trips the guard', async () => {
  // Mirrors PR #313: a page gets removed but a link elsewhere still points at it.
  await withFixtureSite(
    {
      'index.html': '<a href="/new-launches/former-thomson-view.html">see project</a>',
      'new-launches/thomson-reserve.html': '<title>Thomson Reserve</title>',
    },
    (dir) => {
      const broken = findBrokenLinks(dir);
      assert.equal(broken.length, 1);
      assert.equal(broken[0].file, 'index.html');
      assert.equal(broken[0].href, '/new-launches/former-thomson-view.html');
    },
  );
});

test('directory links resolve against index.html, with or without the trailing slash', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="/hdb-prices/">towns</a> <a href="/hdb-prices">towns again</a>',
      'hdb-prices/index.html': '<title>HDB Prices</title>',
    },
    (dir) => {
      assert.deepEqual(findBrokenLinks(dir), []);
    },
  );
});

test('a fragment-only or hash-suffixed href is resolved against the base path, not treated as broken', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="/#book">book</a> <a href="/valuation.html#form">valuation</a>',
      'valuation.html': '<title>Valuation</title>',
    },
    (dir) => {
      assert.deepEqual(findBrokenLinks(dir), []);
    },
  );
});

test('a protocol-relative external href is not treated as a broken internal link', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="//example.com/partner">partner</a>',
    },
    (dir) => {
      assert.deepEqual(findBrokenLinks(dir), []);
    },
  );
});

test('relative links resolve from the directory containing the source page', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="/insights/guide.html">guide</a>',
      'insights/guide.html': '<a href="sibling.html">sibling</a>',
      'insights/sibling.html': '<a href="../index.html">home</a>',
    },
    (dir) => {
      assert.deepEqual(findBrokenLinks(dir), []);
    },
  );
});

test('the guard catches broken relative and single-quoted links', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="/insights/guide.html">guide</a>',
      'insights/guide.html': "<a href='missing-sibling.html'>missing</a>",
    },
    (dir) => {
      const broken = findBrokenLinks(dir);
      assert.deepEqual(broken, [{ file: 'insights/guide.html', href: 'missing-sibling.html' }]);
    },
  );
});

test('same-origin absolute links are checked while external and non-HTTP links are ignored', async () => {
  await withFixtureSite(
    {
      'index.html': [
        '<a href="https://joetay.com/missing.html">missing</a>',
        '<a href="https://example.com/missing.html">external</a>',
        '<a href="mailto:joe@joetay.com">email</a>',
        '<a href="tel:+6512345678">call</a>',
      ].join(' '),
    },
    (dir) => {
      const broken = findBrokenLinks(dir);
      assert.deepEqual(broken, [{ file: 'index.html', href: 'https://joetay.com/missing.html' }]);
    },
  );
});

test('Netlify pretty URLs resolve to their checked-in html file', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="/privacy-policy">privacy</a>',
      'privacy-policy.html': '<title>Privacy</title>',
    },
    (dir) => {
      assert.deepEqual(findBrokenLinks(dir), []);
    },
  );
});

test('the guard flags a link that hops through a forced redirect instead of the canonical target', async () => {
  await withFixtureSite(
    {
      'index.html': '<a href="/new-launches/former-thomson-view.html">see project</a>',
      'new-launches/thomson-reserve.html': '<title>Thomson Reserve</title>',
      _redirects:
        '# comment\n/new-launches/former-thomson-view.html /new-launches/thomson-reserve.html 301!\n',
    },
    (dir) => {
      const hops = findRedirectHops(dir);
      assert.equal(hops.length, 1);
      assert.equal(hops[0].href, '/new-launches/former-thomson-view.html');
    },
  );
});

test('links inside a page that is itself forcibly redirected are not reported as hops', async () => {
  await withFixtureSite(
    {
      'index.html': '<title>Home</title>',
      'legacy.html': '<a href="#main">skip</a> <a href="https://joetay.com/legacy.html">canonical</a>',
      _redirects: '/legacy.html /index.html 301!\n',
    },
    (dir) => {
      assert.deepEqual(findRedirectHops(dir), []);
    },
  );
});

test('scripts, tests, and dotfile directories are excluded from the crawl', async () => {
  await withFixtureSite(
    {
      'index.html': '<title>Home</title>',
      'scripts/check-internal-links.mjs': 'href="/does-not-exist.html"',
      'tests/fixture.html': '<title>should not be scanned</title>',
    },
    (dir) => {
      const pages = findHtmlFiles(dir);
      assert.deepEqual(pages, ['index.html']);
    },
  );
});
