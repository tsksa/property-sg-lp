import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  bucketFor,
  groupFor,
  inspectUrl,
  main,
  normalizeInspection,
  readSitemapUrls,
  renderIndexStatusMarkdown,
  summarizeInspections,
} from '../scripts/index-status-report.mjs';

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://joetay.com/</loc></url>
  <url><loc>https://joetay.com/hdb-prices/bedok/</loc></url>
  <url><loc>https://joetay.com/condo-prices/d15/</loc></url>
  <url><loc>https://joetay.com/hdb-prices/bedok/</loc></url>
</urlset>`;

function inspection(indexStatusResult) {
  return { inspectionResult: { indexStatusResult } };
}

function serviceAccountJson() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    type: 'service_account',
    client_email: 'index-status@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('reads each sitemap URL once, keeping full URLs', () => {
  assert.deepEqual(readSitemapUrls(SITEMAP), [
    'https://joetay.com/',
    'https://joetay.com/hdb-prices/bedok/',
    'https://joetay.com/condo-prices/d15/',
  ]);
});

test('groups URLs by site section', () => {
  assert.equal(groupFor('https://joetay.com/hdb-prices/bedok/'), 'HDB town pages');
  assert.equal(groupFor('https://joetay.com/hdb-prices/'), 'HDB prices hub');
  assert.equal(groupFor('https://joetay.com/condo-prices/d15/'), 'Condo district pages');
  assert.equal(groupFor('https://joetay.com/new-launches/chuan-grove.html'), 'New launch pages');
  assert.equal(groupFor('https://joetay.com/new-launches/'), 'New launches hub');
  assert.equal(groupFor('https://joetay.com/bto-calculator/'), 'Calculators');
  assert.equal(groupFor('https://joetay.com/sell/'), 'Other pages');
});

test('buckets Google coverage states', () => {
  assert.equal(bucketFor({ verdict: 'PASS', coverageState: 'Submitted and indexed' }), 'indexed');
  assert.equal(bucketFor({ verdict: 'PASS', coverageState: 'Indexed, not submitted in sitemap' }), 'indexed');
  assert.equal(bucketFor({ verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed' }), 'discovered');
  assert.equal(bucketFor({ verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed' }), 'crawled');
  assert.equal(bucketFor({ verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google' }), 'unknown');
  assert.equal(bucketFor({ verdict: 'NEUTRAL', coverageState: 'Page with redirect' }), 'other');
  assert.equal(bucketFor({ error: 'HTTP 500' }), 'error');
});

test('normalizes an inspection result and tolerates missing fields', () => {
  const row = normalizeInspection(
    'https://joetay.com/hdb-prices/bedok/',
    inspection({
      verdict: 'NEUTRAL',
      coverageState: 'Discovered - currently not indexed',
      sitemap: ['https://joetay.com/sitemap.xml'],
    }),
  );
  assert.equal(row.coverageState, 'Discovered - currently not indexed');
  assert.equal(row.lastCrawlTime, null);
  assert.deepEqual(row.referringUrls, []);
  assert.deepEqual(row.sitemaps, ['https://joetay.com/sitemap.xml']);
  assert.ok(normalizeInspection('https://joetay.com/', {}).error);
});

test('records a per-URL error instead of failing the whole run', async () => {
  let calls = 0;
  const result = await inspectUrl({
    accessToken: 'token',
    siteUrl: 'sc-domain:joetay.com',
    url: 'https://joetay.com/',
    retryBaseDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(403, { error: { message: 'denied' } });
    },
  });
  assert.equal(calls, 1, 'a 403 is not retried');
  assert.match(result.error, /access denied/);
});

test('retries transient failures', async () => {
  let calls = 0;
  const result = await inspectUrl({
    accessToken: 'token',
    siteUrl: 'sc-domain:joetay.com',
    url: 'https://joetay.com/',
    retryBaseDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return calls < 2
        ? jsonResponse(503, {})
        : jsonResponse(200, inspection({ verdict: 'PASS', coverageState: 'Submitted and indexed' }));
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.verdict, 'PASS');
});

test('summary lists never-crawled URLs, groups and canonical disagreements', () => {
  const summary = summarizeInspections(
    [
      { url: 'https://joetay.com/', verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: '2026-10-01T00:00:00Z', googleCanonical: 'https://joetay.com/', userCanonical: 'https://joetay.com/' },
      { url: 'https://joetay.com/hdb-prices/bedok/', verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed', lastCrawlTime: null },
      { url: 'https://joetay.com/hdb-prices/yishun/', verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed', lastCrawlTime: '2026-09-30T00:00:00Z', googleCanonical: 'https://joetay.com/hdb-prices/yishun', userCanonical: 'https://joetay.com/hdb-prices/yishun/' },
      { url: 'https://joetay.com/sell/', error: 'HTTP 500' },
    ],
    '2026-10-09T00:00:00.000Z',
  );
  assert.deepEqual(summary.buckets, { indexed: 1, crawled: 1, discovered: 1, unknown: 0, other: 0, error: 1 });
  assert.deepEqual(summary.neverCrawled, ['https://joetay.com/hdb-prices/bedok/']);
  const towns = summary.groups.find((row) => row.group === 'HDB town pages');
  assert.equal(towns.total, 2);
  assert.equal(towns.discovered, 1);
  assert.equal(summary.canonicalMismatches.length, 1);

  const markdown = renderIndexStatusMarkdown(summary);
  assert.match(markdown, /Never crawled \(1\)/);
  assert.match(markdown, /- \/hdb-prices\/bedok\//);
  assert.match(markdown, /Google chose a different canonical \(1\)/);
  assert.match(markdown, /\| \/sell\/ \| Error: HTTP 500 \|/);
});

test('main inspects every sitemap URL and writes Markdown and JSON', async () => {
  const outputDirectory = path.join(await mkdtemp(path.join(os.tmpdir(), 'index-status-')), 'out');
  const inspected = [];
  const fetchImpl = async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return jsonResponse(200, { access_token: 'token' });
    }
    const body = JSON.parse(options.body);
    assert.equal(body.siteUrl, 'sc-domain:joetay.com');
    assert.equal(options.headers.authorization, 'Bearer token');
    inspected.push(body.inspectionUrl);
    return jsonResponse(
      200,
      body.inspectionUrl.endsWith('/bedok/')
        ? inspection({ verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed' })
        : inspection({ verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: '2026-10-01T00:00:00Z' }),
    );
  };
  const { summary, markdownPath, jsonPath } = await main({
    env: { GSC_SITE_URL: 'sc-domain:joetay.com', GSC_SERVICE_ACCOUNT_JSON: serviceAccountJson() },
    argv: ['--output-dir', outputDirectory],
    fetchImpl,
    now: new Date('2026-10-09T02:00:00Z'),
    sitemapXml: SITEMAP,
    spacingMs: 0,
    retryBaseDelayMs: 0,
  });
  assert.equal(inspected.length, 3);
  assert.equal(summary.buckets.discovered, 1);
  assert.match(await readFile(markdownPath, 'utf8'), /Never crawled \(1\)/);
  assert.equal(JSON.parse(await readFile(jsonPath, 'utf8')).totalUrls, 3);
});

test('main fails loudly when every inspection is denied', async () => {
  const outputDirectory = path.join(await mkdtemp(path.join(os.tmpdir(), 'index-status-')), 'out');
  const fetchImpl = async (url) =>
    String(url).includes('oauth2.googleapis.com')
      ? jsonResponse(200, { access_token: 'token' })
      : jsonResponse(403, {});
  await assert.rejects(
    main({
      env: { GSC_SITE_URL: 'sc-domain:joetay.com', GSC_SERVICE_ACCOUNT_JSON: serviceAccountJson() },
      argv: ['--output-dir', outputDirectory],
      fetchImpl,
      sitemapXml: SITEMAP,
      spacingMs: 0,
      retryBaseDelayMs: 0,
    }),
    /URL Inspection failed for every URL \(access denied/,
  );
});
