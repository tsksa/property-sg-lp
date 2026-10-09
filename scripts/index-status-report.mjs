#!/usr/bin/env node

/**
 * Per-URL index status from Search Console's URL Inspection API (JOE-448).
 *
 * The page-indexing report in the Search Console UI only gives counts and a
 * 1,000-row sample per reason. This asks Google about every sitemap URL —
 * coverage state, last crawl time, Google-selected canonical — so the weekly
 * report shows which pages Google has never fetched and whether that is
 * shrinking. Read-only: the API cannot request indexing (that stays a manual
 * Search Console action), it only reports what Google already knows.
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  ReportError,
  createServiceAccountAccessToken,
  parseServiceAccount,
} from './search-growth-report.mjs';

const INSPECT_ENDPOINT =
  'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const SITEMAP_URL = new URL('../sitemap.xml', import.meta.url);
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
// The API allows 600 inspections a minute per property; stay well under it.
const DEFAULT_SPACING_MS = 150;

// Groups follow the site's URL structure, so a template-wide crawl problem
// (every town page, every district page) shows up as one line.
const GROUPS = [
  ['HDB town pages', /^\/hdb-prices\/[^/]+\/$/],
  ['HDB prices hub', /^\/hdb-prices\/$/],
  ['Condo district pages', /^\/condo-prices\/[^/]+\/$/],
  ['Condo prices hub', /^\/condo-prices\/$/],
  ['New launch pages', /^\/new-launches\/.+/],
  ['New launches hub', /^\/new-launches\/$/],
  ['Insights', /^\/insights\/.+/],
  ['Chinese pages', /^\/zh\//],
  ['Calculators', /calculator\/$/],
];

export function readSitemapUrls(sitemapXml) {
  const urls = new Set();
  for (const match of String(sitemapXml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    urls.add(match[1]);
  }
  return [...urls];
}

export function groupFor(url) {
  const { pathname } = new URL(url);
  for (const [name, pattern] of GROUPS) {
    if (pattern.test(pathname)) return name;
  }
  return 'Other pages';
}

// Collapse Google's coverage strings into the buckets that matter for crawl
// work. "Discovered" means Google knows the URL but has never fetched it.
export function bucketFor(result) {
  if (result.error) return 'error';
  const coverage = String(result.coverageState || '').toLowerCase();
  if (result.verdict === 'PASS' || coverage.startsWith('submitted and indexed') || coverage.startsWith('indexed')) {
    return 'indexed';
  }
  if (coverage.includes('discovered')) return 'discovered';
  if (coverage.includes('crawled')) return 'crawled';
  if (coverage.includes('unknown to google')) return 'unknown';
  return 'other';
}

export function normalizeInspection(url, payload) {
  const status = payload?.inspectionResult?.indexStatusResult;
  if (!status) {
    return { url, error: 'No indexStatusResult in the API response.' };
  }
  return {
    url,
    verdict: status.verdict ?? null,
    coverageState: status.coverageState ?? null,
    indexingState: status.indexingState ?? null,
    robotsTxtState: status.robotsTxtState ?? null,
    pageFetchState: status.pageFetchState ?? null,
    lastCrawlTime: status.lastCrawlTime ?? null,
    crawledAs: status.crawledAs ?? null,
    googleCanonical: status.googleCanonical ?? null,
    userCanonical: status.userCanonical ?? null,
    referringUrls: Array.isArray(status.referringUrls) ? status.referringUrls : [],
    sitemaps: Array.isArray(status.sitemap) ? status.sitemap : [],
  };
}

function inspectionErrorFor(status) {
  if (status === 401 || status === 403) {
    return `access denied (HTTP ${status})`;
  }
  if (status === 429) return 'quota exceeded (HTTP 429)';
  return `HTTP ${status}`;
}

export async function inspectUrl({
  accessToken,
  siteUrl,
  url,
  fetchImpl = globalThis.fetch,
  retryBaseDelayMs = RETRY_BASE_DELAY_MS,
}) {
  let lastError = 'request failed';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    timeout.unref?.();
    try {
      const response = await fetchImpl(INSPECT_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: 'en-US' }),
        signal: controller.signal,
      });
      if (response.ok) {
        let payload;
        try {
          payload = await response.json();
        } catch {
          return { url, error: 'unreadable API response' };
        }
        return normalizeInspection(url, payload);
      }
      lastError = inspectionErrorFor(response.status);
      const transient = response.status === 429 || response.status >= 500;
      if (!transient) break;
    } catch {
      lastError = 'request failed or timed out';
    } finally {
      globalThis.clearTimeout(timeout);
    }
    if (attempt < MAX_ATTEMPTS - 1) await delay(retryBaseDelayMs * 2 ** attempt);
  }
  return { url, error: lastError };
}

export function summarizeInspections(results, generatedAt) {
  const buckets = { indexed: 0, crawled: 0, discovered: 0, unknown: 0, other: 0, error: 0 };
  const groups = new Map();
  for (const result of results) {
    const bucket = bucketFor(result);
    buckets[bucket] += 1;
    const group = groupFor(result.url);
    if (!groups.has(group)) {
      groups.set(group, { group, total: 0, indexed: 0, crawled: 0, discovered: 0, unknown: 0, other: 0, error: 0 });
    }
    const row = groups.get(group);
    row.total += 1;
    row[bucket] += 1;
  }
  const neverCrawled = results
    .filter((result) => !result.error && !result.lastCrawlTime)
    .map((result) => result.url)
    .sort();
  const canonicalMismatches = results
    .filter(
      (result) =>
        result.googleCanonical &&
        result.userCanonical &&
        result.googleCanonical !== result.userCanonical,
    )
    .map((result) => ({
      url: result.url,
      userCanonical: result.userCanonical,
      googleCanonical: result.googleCanonical,
    }));
  return {
    generatedAt,
    totalUrls: results.length,
    buckets,
    groups: [...groups.values()].sort((a, b) => a.group.localeCompare(b.group)),
    neverCrawled,
    canonicalMismatches,
    results,
  };
}

function cell(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replace(/\s+/g, ' ');
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function renderIndexStatusMarkdown(summary) {
  const { buckets } = summary;
  const lines = [
    '## Index status of every sitemap URL (URL Inspection API)',
    '',
    `Checked ${summary.totalUrls} sitemap URLs on ${summary.generatedAt.slice(0, 10)}. "Discovered" means Google knows the URL but has never fetched it.`,
    '',
    '| Indexed | Crawled, not indexed | Discovered, never crawled | Unknown to Google | Other | Errors |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${buckets.indexed} | ${buckets.crawled} | ${buckets.discovered} | ${buckets.unknown} | ${buckets.other} | ${buckets.error} |`,
    '',
    '### By page group',
    '',
    '| Group | URLs | Indexed | Crawled, not indexed | Discovered | Unknown | Other | Errors |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summary.groups.map(
      (row) =>
        `| ${cell(row.group)} | ${row.total} | ${row.indexed} | ${row.crawled} | ${row.discovered} | ${row.unknown} | ${row.other} | ${row.error} |`,
    ),
    '',
    `### Never crawled (${summary.neverCrawled.length})`,
    '',
    ...(summary.neverCrawled.length
      ? summary.neverCrawled.map((url) => `- ${pathOf(url)}`)
      : ['- None']),
    '',
  ];
  if (summary.canonicalMismatches.length) {
    lines.push(
      `### Google chose a different canonical (${summary.canonicalMismatches.length})`,
      '',
      '| URL | Declared canonical | Google canonical |',
      '| --- | --- | --- |',
      ...summary.canonicalMismatches.map(
        (row) => `| ${cell(pathOf(row.url))} | ${cell(row.userCanonical)} | ${cell(row.googleCanonical)} |`,
      ),
      '',
    );
  }
  lines.push(
    '### Every URL',
    '',
    '| URL | Coverage | Last crawl | Crawled as |',
    '| --- | --- | --- | --- |',
    ...[...summary.results]
      .sort((a, b) => a.url.localeCompare(b.url))
      .map(
        (row) =>
          `| ${cell(pathOf(row.url))} | ${cell(row.error ? `Error: ${row.error}` : row.coverageState)} | ${cell(row.lastCrawlTime ? row.lastCrawlTime.slice(0, 10) : 'never')} | ${cell(row.crawledAs)} |`,
      ),
    '',
  );
  return `${lines.join('\n')}\n`;
}

async function writeAtomic(filePath, content) {
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, filePath);
}

function parseArguments(argv) {
  let outputDirectory = 'reports/index-status';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir' && argv[index + 1]) {
      outputDirectory = argv[index + 1];
      index += 1;
    } else {
      throw new ReportError(
        `Unknown or incomplete argument: ${argv[index]}. Supported option: --output-dir <path>.`,
      );
    }
  }
  return { outputDirectory };
}

export async function main({
  env = process.env,
  argv = process.argv.slice(2),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  sitemapXml = null,
  spacingMs = DEFAULT_SPACING_MS,
  retryBaseDelayMs = RETRY_BASE_DELAY_MS,
} = {}) {
  const { outputDirectory } = parseArguments(argv);
  const siteUrl = env.GSC_SITE_URL;
  if (!siteUrl) {
    throw new ReportError('Missing GSC_SITE_URL. Set it to the Search Console property identifier.');
  }
  const urls = readSitemapUrls(sitemapXml ?? (await readFile(SITEMAP_URL, 'utf8')));
  const credentials = parseServiceAccount(env.GSC_SERVICE_ACCOUNT_JSON);
  const accessToken = await createServiceAccountAccessToken(credentials, { fetchImpl, now });

  const results = [];
  for (const url of urls) {
    results.push(await inspectUrl({ accessToken, siteUrl, url, fetchImpl, retryBaseDelayMs }));
    if (spacingMs > 0) await delay(spacingMs);
  }
  // Every URL failing the same way is a configuration problem, not data.
  if (results.length && results.every((result) => result.error)) {
    throw new ReportError(
      `URL Inspection failed for every URL (${results[0].error}). Check that the service account has access to ${siteUrl} and the Search Console API is enabled.`,
    );
  }

  const summary = summarizeInspections(results, now.toISOString());
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const markdownPath = path.join(outputDirectory, 'index-status.md');
  const jsonPath = path.join(outputDirectory, 'index-status.json');
  await writeAtomic(markdownPath, renderIndexStatusMarkdown(summary));
  await writeAtomic(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `Inspected ${summary.totalUrls} URLs: ${summary.buckets.indexed} indexed, ${summary.buckets.discovered} discovered but never crawled, ${summary.buckets.error} errors.`,
  );
  return { summary, markdownPath, jsonPath };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(
      `::error::${error instanceof ReportError ? error.message : 'Unexpected index-status failure; no report was produced.'}`,
    );
    process.exitCode = 1;
  });
}
