#!/usr/bin/env node

import { createSign } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SEARCH_ANALYTICS_BASE_URL =
  'https://www.googleapis.com/webmasters/v3/sites';
const REPORT_TIME_ZONE = 'Asia/Singapore';
const MAX_ROW_LIMIT = 25_000;
const MAX_FETCH_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_BASE_DELAY_MS = 250;

export const OPPORTUNITY_DEFINITIONS = [
  {
    id: 'click-decline',
    label:
      'Click decline: clicks fell at least 20% from a prior baseline of 5 clicks and 50 impressions.',
    recommendation:
      'Investigate the traffic decline against ranking, search-result, and content changes.',
  },
  {
    id: 'low-ctr',
    label:
      'Low CTR: position 1–10, at least 50 impressions, and click-through rate below 2%.',
    recommendation:
      'Improve the page title and meta description alignment for this query.',
  },
  {
    id: 'striking-distance',
    label: 'Striking distance: position 4–20 with at least 50 impressions.',
    recommendation:
      'Strengthen relevant page content and internal links for this query.',
  },
];

const DEFINITION_BY_ID = new Map(
  OPPORTUNITY_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export class ReportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReportError';
  }
}

function addUtcDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarDateInTimeZone(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new ReportError('The report run time must be a valid date.');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function calculateDateWindows(runAt = new Date()) {
  const runDate = calendarDateInTimeZone(runAt, REPORT_TIME_ZONE);
  const currentEnd = addUtcDays(runDate, -3);
  const currentStart = addUtcDays(currentEnd, -27);
  const priorEnd = addUtcDays(currentStart, -1);
  const priorStart = addUtcDays(priorEnd, -27);

  return {
    current: { startDate: currentStart, endDate: currentEnd },
    prior: { startDate: priorStart, endDate: priorEnd },
  };
}

export function isBrandedQuery(query) {
  const value = String(query ?? '').toLowerCase();
  return (
    value.includes('joe tay') ||
    value.includes('joetay') ||
    value.includes('propertysg') ||
    value.includes('property sg')
  );
}

function requireFiniteNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ReportError(
      `Search Console returned an invalid ${field} metric. Retry the workflow; no report was produced.`,
    );
  }
  return value;
}

export function normalizeResponseRows(response, dimensions = []) {
  if (response?.rows == null) return [];
  if (!Array.isArray(response.rows)) {
    throw new ReportError(
      'Search Console returned an unexpected rows payload. Retry the workflow; no report was produced.',
    );
  }

  return response.rows.map((row) => {
    const keys = Array.isArray(row.keys) ? row.keys : [];
    if (keys.length !== dimensions.length) {
      throw new ReportError(
        'Search Console returned an unexpected dimension shape. Check the configured property and retry.',
      );
    }

    for (const metric of ['clicks', 'impressions', 'ctr', 'position']) {
      if (row[metric] == null) {
        throw new ReportError(
          `Search Console returned a row without the required ${metric} metric. Retry the workflow; no report was produced.`,
        );
      }
    }

    const clicks = requireFiniteNumber(row.clicks, 'clicks');
    const impressions = requireFiniteNumber(row.impressions, 'impressions');
    const rawCtr = requireFiniteNumber(row.ctr, 'CTR');
    const rawPosition = requireFiniteNumber(row.position, 'position');
    if (
      clicks < 0 ||
      impressions < 0 ||
      rawCtr < 0 ||
      rawCtr > 1 ||
      rawPosition < 0
    ) {
      throw new ReportError(
        'Search Console returned an out-of-range metric. Retry the workflow; no report was produced.',
      );
    }

    return {
      query:
        dimensions.includes('query') ?
          String(keys[dimensions.indexOf('query')] ?? '').trim()
        : '',
      page:
        dimensions.includes('page') ?
          String(keys[dimensions.indexOf('page')] ?? '').trim()
        : '',
      clicks,
      impressions,
      ctr: rawCtr,
      position: rawPosition,
    };
  });
}

export function buildSearchAnalyticsRequest({
  window,
  dimensions = ['query', 'page'],
  country = 'sgp',
  rowLimit = MAX_ROW_LIMIT,
  startRow = 0,
}) {
  const request = {
    startDate: window.startDate,
    endDate: window.endDate,
    type: 'web',
    dataState: 'final',
    rowLimit,
    startRow,
  };

  if (dimensions.length > 0) request.dimensions = dimensions;
  if (country) {
    request.dimensionFilterGroups = [
      {
        groupType: 'and',
        filters: [
          {
            dimension: 'country',
            operator: 'equals',
            expression: country,
          },
        ],
      },
    ];
  }

  return request;
}

function apiErrorForStatus(status) {
  if (status === 401 || status === 403) {
    return new ReportError(
      `Search Console access was denied (HTTP ${status}). Enable the Search Console API and grant the dedicated service account read access to the property in GSC_SITE_URL.`,
    );
  }
  if (status === 404) {
    return new ReportError(
      'The Search Console property was not found (HTTP 404). Set GSC_SITE_URL to the exact URL-prefix or sc-domain property identifier.',
    );
  }
  return new ReportError(
    `The Search Console API request failed (HTTP ${status}). Check API availability and the repository configuration, then retry.`,
  );
}

async function fetchWithRetry(
  fetchImpl,
  url,
  options,
  {
    attempts = MAX_FETCH_ATTEMPTS,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    retryBaseDelayMs = RETRY_BASE_DELAY_MS,
  } = {},
) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      requestTimeoutMs,
    );
    timeout.unref?.();

    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
      });
      const transient =
        response.status === 429 ||
        (response.status >= 500 && response.status <= 599);
      if (!transient || attempt === attempts - 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    } finally {
      globalThis.clearTimeout(timeout);
    }

    await delay(retryBaseDelayMs * 2 ** attempt);
  }

  throw lastError;
}

export async function querySearchAnalytics({
  accessToken,
  siteUrl,
  window,
  dimensions = ['query', 'page'],
  country = 'sgp',
  rowLimit = MAX_ROW_LIMIT,
  fetchImpl = globalThis.fetch,
  retryBaseDelayMs = RETRY_BASE_DELAY_MS,
}) {
  const endpoint = `${SEARCH_ANALYTICS_BASE_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows = [];
  let startRow = 0;

  while (true) {
    const body = buildSearchAnalyticsRequest({
      window,
      dimensions,
      country,
      rowLimit,
      startRow,
    });

    let response;
    try {
      response = await fetchWithRetry(
        fetchImpl,
        endpoint,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        { retryBaseDelayMs },
      );
    } catch {
      throw new ReportError(
        'The Search Console API could not be reached. Check API availability and retry; no report was produced.',
      );
    }

    if (!response.ok) throw apiErrorForStatus(response.status);

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ReportError(
        'Search Console returned an unreadable response. Retry the workflow; no report was produced.',
      );
    }

    const pageRows = normalizeResponseRows(payload, dimensions);
    rows.push(...pageRows);

    if (dimensions.length === 0 || pageRows.length === 0) break;
    startRow += rowLimit;
  }

  return rows;
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export function parseServiceAccount(rawValue) {
  if (!rawValue) {
    throw new ReportError(
      'Missing GSC_SERVICE_ACCOUNT_JSON. Add the dedicated service-account JSON as a GitHub Actions secret.',
    );
  }

  let credentials;
  try {
    credentials = JSON.parse(rawValue);
  } catch {
    throw new ReportError(
      'GSC_SERVICE_ACCOUNT_JSON must contain valid service-account JSON. Replace the GitHub secret and retry.',
    );
  }

  if (
    credentials?.type !== 'service_account' ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new ReportError(
      'GSC_SERVICE_ACCOUNT_JSON is missing required service-account fields. Replace it with a dedicated JSON key.',
    );
  }

  return {
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    privateKeyId: credentials.private_key_id || undefined,
    tokenUri: DEFAULT_TOKEN_URI,
  };
}

export async function createServiceAccountAccessToken(
  credentials,
  {
    fetchImpl = globalThis.fetch,
    now = new Date(),
    retryBaseDelayMs = RETRY_BASE_DELAY_MS,
  } = {},
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(credentials.privateKeyId ? { kid: credentials.privateKeyId } : {}),
  };
  const claims = {
    iss: credentials.clientEmail,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: DEFAULT_TOKEN_URI,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const unsignedJwt = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(claims))}`;

  let signature;
  try {
    signature = createSign('RSA-SHA256')
      .update(unsignedJwt)
      .end()
      .sign(credentials.privateKey, 'base64url');
  } catch {
    throw new ReportError(
      'The private key in GSC_SERVICE_ACCOUNT_JSON could not sign an OAuth request. Replace the GitHub secret with an active JSON key.',
    );
  }

  let response;
  try {
    response = await fetchWithRetry(
      fetchImpl,
      DEFAULT_TOKEN_URI,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${unsignedJwt}.${signature}`,
        }),
      },
      { retryBaseDelayMs },
    );
  } catch {
    throw new ReportError(
      'Google OAuth could not be reached. Check API availability and retry; no report was produced.',
    );
  }

  if (!response.ok) {
    throw new ReportError(
      `Service-account authentication failed (HTTP ${response.status}). Verify GSC_SERVICE_ACCOUNT_JSON contains an active key.`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ReportError(
      'Google OAuth returned an unreadable response. Retry the workflow; no report was produced.',
    );
  }

  if (!payload.access_token) {
    throw new ReportError(
      'Google OAuth did not return an access token. Verify the dedicated service-account key.',
    );
  }
  return payload.access_token;
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function rowKey(row) {
  return JSON.stringify([row.query, row.page]);
}

function indexRows(rows, periodName) {
  const index = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    if (index.has(key)) {
      throw new ReportError(
        `Search Console returned a duplicate query/page row for the ${periodName} period. Retry the workflow; no report was produced.`,
      );
    }
    index.set(key, row);
  }
  return index;
}

function emptyMetrics() {
  return {
    clicks: 0,
    impressions: 0,
    ctr: null,
    position: null,
  };
}

function opportunityFor(current, prior) {
  const matchedGroups = [];
  const declineRate =
    prior.clicks > 0 ? (prior.clicks - current.clicks) / prior.clicks : null;

  if (
    prior.clicks >= 5 &&
    prior.impressions >= 50 &&
    declineRate >= 0.2 - Number.EPSILON
  ) {
    matchedGroups.push('click-decline');
  }
  if (
    current.position != null &&
    current.position >= 1 &&
    current.position <= 10 &&
    current.impressions >= 50 &&
    current.ctr != null &&
    current.ctr < 0.02
  ) {
    matchedGroups.push('low-ctr');
  }
  if (
    current.position != null &&
    current.position >= 4 &&
    current.position <= 20 &&
    current.impressions >= 50
  ) {
    matchedGroups.push('striking-distance');
  }

  if (matchedGroups.length === 0) return null;
  const group = matchedGroups[0];

  return {
    group,
    matchedGroups,
    query: current.query || prior.query,
    page: current.page || prior.page,
    current,
    prior,
    clickDelta: current.clicks - prior.clicks,
    clickChangePct:
      prior.clicks > 0 ? (current.clicks - prior.clicks) / prior.clicks : null,
    recommendation: DEFINITION_BY_ID.get(group).recommendation,
  };
}

function compareOpportunities(left, right) {
  const groupOrder = new Map([
    ['click-decline', 0],
    ['low-ctr', 1],
    ['striking-distance', 2],
  ]);
  const groupDifference =
    groupOrder.get(left.group) - groupOrder.get(right.group);
  if (groupDifference !== 0) return groupDifference;

  if (left.group === 'click-decline') {
    const lostClicksLeft = left.prior.clicks - left.current.clicks;
    const lostClicksRight = right.prior.clicks - right.current.clicks;
    if (lostClicksLeft !== lostClicksRight) {
      return lostClicksRight - lostClicksLeft;
    }
    if (left.clickChangePct !== right.clickChangePct) {
      return left.clickChangePct - right.clickChangePct;
    }
    if (left.prior.clicks !== right.prior.clicks) {
      return right.prior.clicks - left.prior.clicks;
    }
  } else if (left.group === 'low-ctr') {
    if (left.current.impressions !== right.current.impressions) {
      return right.current.impressions - left.current.impressions;
    }
    if (left.current.ctr !== right.current.ctr) {
      return left.current.ctr - right.current.ctr;
    }
    if (left.current.position !== right.current.position) {
      return left.current.position - right.current.position;
    }
  } else {
    if (left.current.impressions !== right.current.impressions) {
      return right.current.impressions - left.current.impressions;
    }
    if (left.current.position !== right.current.position) {
      return left.current.position - right.current.position;
    }
    if (left.current.clicks !== right.current.clicks) {
      return right.current.clicks - left.current.clicks;
    }
  }

  return (
    compareText(left.query, right.query) ||
    compareText(left.page, right.page)
  );
}

export function selectOpportunities(currentRows, priorRows, limit = 10) {
  const currentIndex = indexRows(currentRows, 'current');
  const priorIndex = indexRows(priorRows, 'prior');
  const keys = new Set([...currentIndex.keys(), ...priorIndex.keys()]);
  const opportunities = [];

  for (const key of keys) {
    const currentRow = currentIndex.get(key);
    const priorRow = priorIndex.get(key);
    const identity = currentRow || priorRow;
    if (isBrandedQuery(identity.query)) continue;

    const current = currentRow ?
      { ...currentRow }
    : { query: identity.query, page: identity.page, ...emptyMetrics() };
    const prior = priorRow ?
      { ...priorRow }
    : { query: identity.query, page: identity.page, ...emptyMetrics() };
    const opportunity = opportunityFor(current, prior);
    if (opportunity) opportunities.push(opportunity);
  }

  return opportunities
    .sort(compareOpportunities)
    .slice(0, limit)
    .map((opportunity, index) => ({ rank: index + 1, ...opportunity }));
}

export function summarizeRows(rows) {
  const clicks = rows.reduce((total, row) => total + row.clicks, 0);
  const impressions = rows.reduce(
    (total, row) => total + row.impressions,
    0,
  );
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
  };
}

export function buildReport({
  siteUrl,
  windows,
  generatedAt,
  currentRows,
  priorRows,
  currentSingaporeTotalRows,
  priorSingaporeTotalRows,
  currentGlobalTotalRows,
  priorGlobalTotalRows,
}) {
  const opportunities = selectOpportunities(currentRows, priorRows);
  return {
    schemaVersion: 1,
    status: opportunities.length > 0 ? 'opportunities' : 'empty',
    generatedAt,
    siteUrl,
    searchType: 'web',
    opportunityCountry: 'SGP',
    windows,
    totals: {
      singapore: {
        current: summarizeRows(currentSingaporeTotalRows),
        prior: summarizeRows(priorSingaporeTotalRows),
      },
      global: {
        current: summarizeRows(currentGlobalTotalRows),
        prior: summarizeRows(priorGlobalTotalRows),
      },
      singaporeBranded: {
        current: summarizeRows(currentRows.filter((row) => isBrandedQuery(row.query))),
        prior: summarizeRows(priorRows.filter((row) => isBrandedQuery(row.query))),
      },
    },
    opportunityDefinitions: OPPORTUNITY_DEFINITIONS,
    opportunities,
    emptyStateMessage:
      opportunities.length === 0 ?
        'No qualifying non-branded Singapore query/page opportunities were found for this window.'
      : null,
    sourceNote:
      'Search Analytics returns its top rows and does not guarantee every query. Rankings are deterministic within the rows returned.',
  };
}

function formatInteger(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatPosition(value) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(1);
}

function escapeMarkdownCell(value) {
  return String(value ?? '—')
    .replace(/\r?\n/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/\\/g, '&#92;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;');
}

function totalsRow(label, current, prior) {
  return `| ${label} | ${formatInteger(current.clicks)} | ${formatInteger(prior.clicks)} | ${formatInteger(current.impressions)} | ${formatInteger(prior.impressions)} | ${formatPercent(current.ctr)} | ${formatPercent(prior.ctr)} |`;
}

export function renderMarkdown(report) {
  const lines = [
    '# Weekly Search Console organic-growth report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Property: \`${report.siteUrl}\`  `,
    'Opportunity scope: Google web search, Singapore, non-branded queries',
    '',
    '## Date windows',
    '',
    '| Period | Start | End |',
    '|---|---:|---:|',
    `| Current | ${report.windows.current.startDate} | ${report.windows.current.endDate} |`,
    `| Prior | ${report.windows.prior.startDate} | ${report.windows.prior.endDate} |`,
    '',
    '## Traffic summaries',
    '',
    '| Segment | Current clicks | Prior clicks | Current impressions | Prior impressions | Current CTR | Prior CTR |',
    '|---|---:|---:|---:|---:|---:|---:|',
    totalsRow(
      'Singapore web total',
      report.totals.singapore.current,
      report.totals.singapore.prior,
    ),
    totalsRow(
      'Singapore branded queries',
      report.totals.singaporeBranded.current,
      report.totals.singaporeBranded.prior,
    ),
    totalsRow(
      'Global property total',
      report.totals.global.current,
      report.totals.global.prior,
    ),
    '',
    '## Opportunity definitions',
    '',
    ...report.opportunityDefinitions.map(
      (definition) => `- **${definition.id}:** ${definition.label}`,
    ),
    '',
    'When one query/page matches multiple definitions, the report assigns one recommendation using this priority: click decline, low CTR, then striking distance.',
    '',
    '## Ranked opportunities',
    '',
  ];

  if (report.opportunities.length === 0) {
    lines.push(`**${report.emptyStateMessage}**`, '');
  } else {
    lines.push(
      '| Rank | Group | Query | Page | Current clicks | Prior clicks | Current impressions | Current CTR | Current position | Click change | Recommendation |',
      '|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|',
    );
    for (const opportunity of report.opportunities) {
      lines.push(
        `| ${opportunity.rank} | ${escapeMarkdownCell(opportunity.group)} | ${escapeMarkdownCell(opportunity.query)} | ${escapeMarkdownCell(opportunity.page)} | ${formatInteger(opportunity.current.clicks)} | ${formatInteger(opportunity.prior.clicks)} | ${formatInteger(opportunity.current.impressions)} | ${formatPercent(opportunity.current.ctr)} | ${formatPosition(opportunity.current.position)} | ${formatPercent(opportunity.clickChangePct)} | ${escapeMarkdownCell(opportunity.recommendation)} |`,
      );
    }
    lines.push('');
  }

  lines.push(`_${report.sourceNote}_`, '');
  return `${lines.join('\n')}\n`;
}

export function serializeReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function writeReportArtifacts(report, outputDirectory) {
  const markdown = renderMarkdown(report);
  const json = serializeReport(report);
  const absoluteDirectory = path.resolve(outputDirectory);
  const markdownPath = path.join(
    absoluteDirectory,
    'search-growth-report.md',
  );
  const jsonPath = path.join(absoluteDirectory, 'search-growth-report.json');
  const markdownTemporaryPath = `${markdownPath}.tmp`;
  const jsonTemporaryPath = `${jsonPath}.tmp`;

  await mkdir(absoluteDirectory, { recursive: true });
  await Promise.all([
    writeFile(markdownTemporaryPath, markdown, 'utf8'),
    writeFile(jsonTemporaryPath, json, 'utf8'),
  ]);
  let markdownPublished = false;
  try {
    await rename(markdownTemporaryPath, markdownPath);
    markdownPublished = true;
    await rename(jsonTemporaryPath, jsonPath);
  } catch {
    await Promise.allSettled([
      markdownPublished ? rm(markdownPath, { force: true }) : Promise.resolve(),
      rm(markdownTemporaryPath, { force: true }),
      rm(jsonTemporaryPath, { force: true }),
    ]);
    throw new ReportError(
      'The Markdown and JSON artifacts could not be published together. No report was produced.',
    );
  }

  return { markdownPath, jsonPath };
}

export function publicErrorMessage(error) {
  if (error instanceof ReportError) return error.message;
  return 'Unexpected report failure. Inspect the workflow step and retry; no report was produced.';
}

function parseArguments(argv) {
  let outputDirectory = 'reports/search-growth';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir') {
      outputDirectory = argv[index + 1];
      index += 1;
    } else {
      throw new ReportError(
        `Unknown argument: ${argv[index]}. Supported option: --output-dir <path>.`,
      );
    }
  }
  if (!outputDirectory) {
    throw new ReportError('--output-dir requires a path.');
  }
  return { outputDirectory };
}

function parseSiteUrl(value) {
  if (!value) {
    throw new ReportError(
      'Missing GSC_SITE_URL. Add the exact Search Console URL-prefix or sc-domain identifier as a GitHub Actions repository variable.',
    );
  }
  if (!/^https?:\/\/.+/i.test(value) && !value.startsWith('sc-domain:')) {
    throw new ReportError(
      'GSC_SITE_URL must be an exact URL-prefix or sc-domain Search Console property identifier.',
    );
  }
  return value;
}

export async function main({
  env = process.env,
  argv = process.argv.slice(2),
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  const { outputDirectory } = parseArguments(argv);
  const credentials = parseServiceAccount(env.GSC_SERVICE_ACCOUNT_JSON);
  const siteUrl = parseSiteUrl(env.GSC_SITE_URL);
  const windows = calculateDateWindows(now);
  const accessToken = await createServiceAccountAccessToken(credentials, {
    fetchImpl,
    now,
  });

  const detailQuery = (window) =>
    querySearchAnalytics({
      accessToken,
      siteUrl,
      window,
      dimensions: ['query', 'page'],
      country: 'sgp',
      fetchImpl,
    });
  const singaporeTotalQuery = (window) =>
    querySearchAnalytics({
      accessToken,
      siteUrl,
      window,
      dimensions: [],
      country: 'sgp',
      rowLimit: 1,
      fetchImpl,
    });
  const globalTotalQuery = (window) =>
    querySearchAnalytics({
      accessToken,
      siteUrl,
      window,
      dimensions: [],
      country: null,
      rowLimit: 1,
      fetchImpl,
    });

  const [
    currentRows,
    priorRows,
    currentSingaporeTotalRows,
    priorSingaporeTotalRows,
    currentGlobalTotalRows,
    priorGlobalTotalRows,
  ] = await Promise.all([
    detailQuery(windows.current),
    detailQuery(windows.prior),
    singaporeTotalQuery(windows.current),
    singaporeTotalQuery(windows.prior),
    globalTotalQuery(windows.current),
    globalTotalQuery(windows.prior),
  ]);

  const report = buildReport({
    siteUrl,
    windows,
    generatedAt: new Date().toISOString(),
    currentRows,
    priorRows,
    currentSingaporeTotalRows,
    priorSingaporeTotalRows,
    currentGlobalTotalRows,
    priorGlobalTotalRows,
  });
  const paths = await writeReportArtifacts(report, outputDirectory);
  console.log(
    `Generated ${report.status} report with ${report.opportunities.length} opportunity row(s).`,
  );
  console.log(`Markdown: ${paths.markdownPath}`);
  console.log(`JSON: ${paths.jsonPath}`);
  return { report, paths };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(`::error::${publicErrorMessage(error)}`);
    process.exitCode = 1;
  });
}
