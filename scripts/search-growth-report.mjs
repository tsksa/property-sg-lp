#!/usr/bin/env node

import { createSign } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const GOOGLE_READONLY_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
];
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SEARCH_ANALYTICS_BASE_URL =
  'https://www.googleapis.com/webmasters/v3/sites';
const GA4_DATA_BASE_URL = 'https://analyticsdata.googleapis.com/v1beta';
const GA4_HOST_NAME = 'joetay.com';
const REPORT_TIME_ZONE = 'Asia/Singapore';
const MAX_ROW_LIMIT = 25_000;
const MAX_GA4_ROW_LIMIT = 100_000;
const MAX_FETCH_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_BASE_DELAY_MS = 250;
const REQUIRED_GA4_CUSTOM_DIMENSIONS = [
  'customEvent:lead_type',
  'customEvent:contact_method',
];

const SELLER_OWNER_LEAD_TYPES = new Set([
  'seller_consult',
  'valuation',
  'landlord_consult',
  'final_cta_consultation',
]);
const GENERAL_CONSULTATION_LEAD_TYPES = new Set([
  'consultation',
  'calendly_booking',
]);
const NEW_LAUNCH_LEAD_TYPES = new Set(['new_launch_registration']);
const NURTURE_LEAD_TYPES = new Set(['newsletter_signup']);
const KNOWN_CONTACT_METHODS = new Map([
  ['phone_call', 'phoneCall'],
  ['whatsapp', 'whatsapp'],
  ['calendly', 'calendly'],
  ['email', 'email'],
]);

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

export function parseGa4PropertyId(value) {
  const propertyId = String(value ?? '').trim();
  if (!propertyId) {
    throw new ReportError(
      'Missing GA4_PROPERTY_ID. Add the numeric GA4 property ID as a GitHub Actions repository variable.',
    );
  }
  if (!/^\d+$/.test(propertyId)) {
    throw new ReportError(
      'GA4_PROPERTY_ID must be the numeric Google Analytics property ID, not a Google tag ID or properties/* resource name.',
    );
  }
  return propertyId;
}

function organicSearchFilter() {
  return {
    filter: {
      fieldName: 'sessionDefaultChannelGroup',
      stringFilter: {
        matchType: 'EXACT',
        value: 'Organic Search',
        caseSensitive: false,
      },
    },
  };
}

function ga4HostNameFilter() {
  return {
    filter: {
      fieldName: 'hostName',
      stringFilter: {
        matchType: 'EXACT',
        value: GA4_HOST_NAME,
        caseSensitive: false,
      },
    },
  };
}

export function buildGa4SessionRequest({
  window,
  rowLimit = MAX_GA4_ROW_LIMIT,
  offset = 0,
}) {
  return {
    dateRanges: [window],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
    dimensionFilter: {
      andGroup: {
        expressions: [organicSearchFilter(), ga4HostNameFilter()],
      },
    },
    limit: String(rowLimit),
    offset: String(offset),
  };
}

function buildGa4EventRequest({
  window,
  eventName,
  customDimension,
  rowLimit = MAX_GA4_ROW_LIMIT,
  offset = 0,
}) {
  return {
    dateRanges: [window],
    dimensions: [
      { name: 'landingPagePlusQueryString' },
      { name: customDimension },
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          organicSearchFilter(),
          ga4HostNameFilter(),
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: {
                matchType: 'EXACT',
                value: eventName,
                caseSensitive: true,
              },
            },
          },
        ],
      },
    },
    limit: String(rowLimit),
    offset: String(offset),
  };
}

export function buildGa4LeadRequest(options) {
  return buildGa4EventRequest({
    ...options,
    eventName: 'generate_lead',
    customDimension: 'customEvent:lead_type',
  });
}

export function buildGa4ContactRequest(options) {
  return buildGa4EventRequest({
    ...options,
    eventName: 'contact_click',
    customDimension: 'customEvent:contact_method',
  });
}

function ga4ApiErrorForStatus(status) {
  if (status === 401 || status === 403) {
    return new ReportError(
      `GA4 access was denied (HTTP ${status}). Enable the Google Analytics Data API and grant the service account Viewer access to the property in GA4_PROPERTY_ID.`,
    );
  }
  if (status === 404) {
    return new ReportError(
      'The GA4 property was not found (HTTP 404). Set GA4_PROPERTY_ID to the numeric property ID and grant the service account Viewer access.',
    );
  }
  return new ReportError(
    `The Google Analytics Data API request failed (HTTP ${status}). Check API availability and the repository configuration, then retry.`,
  );
}

function ga4ResponseShapeError() {
  return new ReportError(
    'GA4 returned an unexpected report shape. Check the configured property and custom dimensions, then retry; no report was produced.',
  );
}

function ga4MetricValue(value, metricName) {
  const rawValue = value?.value;
  if (
    (typeof rawValue !== 'string' && typeof rawValue !== 'number') ||
    String(rawValue).trim() === ''
  ) {
    throw ga4ResponseShapeError();
  }
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ReportError(
      `GA4 returned an invalid ${metricName} metric. Retry the workflow; no report was produced.`,
    );
  }
  return parsed;
}

export function normalizeGa4ResponseRows(
  response,
  dimensionNames,
  metricNames,
) {
  if (!Array.isArray(response?.dimensionHeaders)) {
    throw ga4ResponseShapeError();
  }
  if (!Array.isArray(response?.metricHeaders)) {
    throw ga4ResponseShapeError();
  }
  const returnedDimensions = response.dimensionHeaders.map(
    (header) => header?.name,
  );
  const returnedMetrics = response.metricHeaders.map(
    (header) => header?.name,
  );
  if (
    JSON.stringify(returnedDimensions) !== JSON.stringify(dimensionNames) ||
    JSON.stringify(returnedMetrics) !== JSON.stringify(metricNames)
  ) {
    throw ga4ResponseShapeError();
  }

  if (response.rows == null) return [];
  if (!Array.isArray(response.rows)) throw ga4ResponseShapeError();

  return response.rows.map((row) => {
    if (
      !Array.isArray(row?.dimensionValues) ||
      row.dimensionValues.length !== dimensionNames.length ||
      !Array.isArray(row?.metricValues) ||
      row.metricValues.length !== metricNames.length
    ) {
      throw ga4ResponseShapeError();
    }

    const dimensions = {};
    for (const [index, name] of dimensionNames.entries()) {
      const value = row.dimensionValues[index]?.value;
      if (typeof value !== 'string') throw ga4ResponseShapeError();
      dimensions[name] = value;
    }

    const metrics = {};
    for (const [index, name] of metricNames.entries()) {
      metrics[name] = ga4MetricValue(row.metricValues[index], name);
    }

    return { dimensions, metrics };
  });
}

export async function queryGa4Report({
  accessToken,
  propertyId,
  window,
  reportType,
  rowLimit = MAX_GA4_ROW_LIMIT,
  fetchImpl = globalThis.fetch,
  retryBaseDelayMs = RETRY_BASE_DELAY_MS,
}) {
  const definitions = {
    sessions: {
      dimensions: ['landingPagePlusQueryString'],
      metrics: ['sessions', 'engagedSessions'],
      buildRequest: buildGa4SessionRequest,
    },
    leads: {
      dimensions: [
        'landingPagePlusQueryString',
        'customEvent:lead_type',
      ],
      metrics: ['eventCount'],
      buildRequest: buildGa4LeadRequest,
    },
    contacts: {
      dimensions: [
        'landingPagePlusQueryString',
        'customEvent:contact_method',
      ],
      metrics: ['eventCount'],
      buildRequest: buildGa4ContactRequest,
    },
  };
  const definition = definitions[reportType];
  if (!definition) {
    throw new ReportError(`Unsupported GA4 report type: ${reportType}.`);
  }

  const endpoint =
    `${GA4_DATA_BASE_URL}/properties/${propertyId}:runReport`;
  const rows = [];
  let offset = 0;
  let expectedRowCount = null;

  while (true) {
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
          body: JSON.stringify(
            definition.buildRequest({ window, rowLimit, offset }),
          ),
        },
        { retryBaseDelayMs },
      );
    } catch {
      throw new ReportError(
        'The Google Analytics Data API could not be reached. Check API availability and retry; no report was produced.',
      );
    }

    if (!response.ok) throw ga4ApiErrorForStatus(response.status);

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ReportError(
        'GA4 returned an unreadable response. Retry the workflow; no report was produced.',
      );
    }

    const pageRows = normalizeGa4ResponseRows(
      payload,
      definition.dimensions,
      definition.metrics,
    );
    const rawRowCount = payload.rowCount;
    if (rawRowCount != null) {
      const rowCount = Number(rawRowCount);
      if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
        throw ga4ResponseShapeError();
      }
      if (
        expectedRowCount != null &&
        expectedRowCount !== rowCount
      ) {
        throw ga4ResponseShapeError();
      }
      expectedRowCount = rowCount;
    }

    rows.push(...pageRows);
    if (expectedRowCount != null) {
      if (rows.length > expectedRowCount) {
        throw ga4ResponseShapeError();
      }
      if (rows.length === expectedRowCount) break;
      if (pageRows.length === 0) {
        throw new ReportError(
          'GA4 pagination ended before the API returned its reported row count. Retry the workflow; no report was produced.',
        );
      }
    } else if (
      pageRows.length === 0 ||
      pageRows.length < rowLimit
    ) {
      break;
    }
    offset += pageRows.length;
  }

  return rows;
}

export async function verifyGa4CustomDimensions({
  accessToken,
  propertyId,
  fetchImpl = globalThis.fetch,
  retryBaseDelayMs = RETRY_BASE_DELAY_MS,
}) {
  const endpoint =
    `${GA4_DATA_BASE_URL}/properties/${propertyId}/metadata`;
  let response;
  try {
    response = await fetchWithRetry(
      fetchImpl,
      endpoint,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
      },
      { retryBaseDelayMs },
    );
  } catch {
    throw new ReportError(
      'GA4 metadata could not be reached. Check API availability and retry; no report was produced.',
    );
  }

  if (!response.ok) throw ga4ApiErrorForStatus(response.status);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ReportError(
      'GA4 metadata was unreadable. Retry the workflow; no report was produced.',
    );
  }
  if (!Array.isArray(payload?.dimensions)) {
    throw new ReportError(
      'GA4 metadata did not contain its dimension definitions. Check GA4_PROPERTY_ID and retry; no report was produced.',
    );
  }

  const available = new Set(
    payload.dimensions
      .filter((dimension) => dimension?.customDefinition === true)
      .map((dimension) => dimension.apiName),
  );
  const missing = REQUIRED_GA4_CUSTOM_DIMENSIONS.filter(
    (apiName) => !available.has(apiName),
  );
  if (missing.length > 0) {
    const parameterNames = missing.map((name) => name.split(':')[1]);
    throw new ReportError(
      `GA4 is missing event-scoped custom dimensions for: ${parameterNames.join(', ')}. In GA4 Admin → Data display → Custom definitions, create each dimension with Scope "Event" and an Event parameter matching the name exactly. Wait 24–48 hours, then rerun the workflow; no report was produced.`,
    );
  }
  return {
    requiredDimensions: [...REQUIRED_GA4_CUSTOM_DIMENSIONS],
  };
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
    scope: GOOGLE_READONLY_SCOPES.join(' '),
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

/**
 * Top current rows by impressions, ignoring the opportunity thresholds.
 *
 * Every opportunity bucket requires at least 50 impressions on a single
 * query/page. A site early in its indexing never clears that, so the report
 * reads "empty" while telling you nothing about where you actually rank —
 * which is the one thing worth knowing at that stage. This always shows it.
 */
export function selectVisibilitySnapshot(currentRows, limit = 15) {
  return [...currentRows]
    .filter((row) => !isBrandedQuery(row.query))
    .sort(
      (left, right) =>
        right.impressions - left.impressions ||
        compareText(left.query, right.query),
    )
    .slice(0, limit)
    .map((row) => ({
      query: row.query,
      page: row.page,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
    }));
}

// Exploratory observations are deliberately separate from the >=50-impression
// opportunity buckets. A sparse query is a watch item, not a stable ranking win.
export function selectVisibilityWatchlist(currentRows) {
  return selectVisibilitySnapshot(currentRows, Infinity)
    .filter((row) => row.impressions > 0)
    .map((row) => ({
      ...row,
      confidence: row.impressions < 50 ? 'low-volume' : '50+ impressions',
      nearTop20: row.position != null && row.position > 20 && row.position <= 50,
    }));
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

export function normalizePagePath(value) {
  const rawValue = String(value ?? '').trim();
  if (
    !rawValue ||
    rawValue.toLowerCase() === '(not set)' ||
    rawValue.toLowerCase() === '(not assigned)' ||
    rawValue.toLowerCase() === '(other)' ||
    rawValue.toLowerCase() === '(data not available)'
  ) {
    return null;
  }

  let pathname;
  if (/^https?:\/\//i.test(rawValue)) {
    try {
      pathname = new URL(rawValue).pathname;
    } catch {
      return null;
    }
  } else {
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawValue)) return null;
    [pathname] = rawValue.split(/[?#]/, 1);
  }

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/index\.html$/i, '') || '/';
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname || '/';
}

function safeDimensionBucket(value) {
  const rawValue = String(value ?? '');
  const normalized = rawValue.trim();
  const sentinel = normalized.toLowerCase();
  if (
    !normalized ||
    sentinel === '(not set)' ||
    sentinel === '(not assigned)' ||
    sentinel === '(other)' ||
    sentinel === '(data not available)'
  ) {
    return sentinel || '(not set)';
  }
  if (rawValue !== normalized) return '[invalid value]';
  return /^[a-zA-Z0-9_-]{1,64}$/.test(normalized) ?
      normalized
    : '[invalid value]';
}

export function classifyLeadType(value) {
  const leadType = typeof value === 'string' ? value : '';
  if (SELLER_OWNER_LEAD_TYPES.has(leadType)) return 'sellerOwnerLeads';
  if (GENERAL_CONSULTATION_LEAD_TYPES.has(leadType)) {
    return 'generalConsultations';
  }
  if (NEW_LAUNCH_LEAD_TYPES.has(leadType)) return 'newLaunchLeads';
  if (NURTURE_LEAD_TYPES.has(leadType)) return 'nurtureSignups';
  return 'unclassifiedLeads';
}

export function classifyContactMethod(value) {
  return (
    KNOWN_CONTACT_METHODS.get(
      typeof value === 'string' ? value : '',
    ) || 'unclassified'
  );
}

function createGa4Accumulator() {
  return {
    hasSessionData: false,
    hasLeadData: false,
    hasContactData: false,
    organicSessions: 0,
    engagedSessions: 0,
    sellerOwnerLeads: 0,
    generalConsultations: 0,
    newLaunchLeads: 0,
    nurtureSignups: 0,
    unclassifiedLeads: 0,
    contactIntent: {
      phoneCall: 0,
      whatsapp: 0,
      calendly: 0,
      email: 0,
      unclassified: 0,
    },
    unclassifiedLeadTypes: new Map(),
    unclassifiedContactMethods: new Map(),
  };
}

function ga4AggregateCount(value, metricName) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ReportError(
      `GA4 returned an invalid ${metricName} metric. Retry the workflow; no report was produced.`,
    );
  }
  return value;
}

function addBucketCount(buckets, value, count) {
  const bucket = safeDimensionBucket(value);
  buckets.set(bucket, (buckets.get(bucket) || 0) + count);
}

function bucketEntries(buckets) {
  return [...buckets.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([value, count]) => ({ value, count }));
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function finalizeGa4Metrics(accumulator) {
  if (
    accumulator.hasSessionData &&
    accumulator.engagedSessions > accumulator.organicSessions
  ) {
    throw new ReportError(
      'GA4 returned more engaged sessions than organic sessions for a landing page. Retry the workflow; no report was produced.',
    );
  }
  const totalLeads =
    accumulator.sellerOwnerLeads +
    accumulator.generalConsultations +
    accumulator.newLaunchLeads +
    accumulator.nurtureSignups +
    accumulator.unclassifiedLeads;
  const totalContactIntent = Object.values(
    accumulator.contactIntent,
  ).reduce((total, count) => total + count, 0);
  const sessions = accumulator.organicSessions;

  return {
    hasSessionData: accumulator.hasSessionData,
    hasLeadData: accumulator.hasLeadData,
    hasContactData: accumulator.hasContactData,
    organicSessions: sessions,
    engagedSessions: accumulator.engagedSessions,
    sellerOwnerLeads: accumulator.sellerOwnerLeads,
    generalConsultations: accumulator.generalConsultations,
    newLaunchLeads: accumulator.newLaunchLeads,
    nurtureSignups: accumulator.nurtureSignups,
    unclassifiedLeads: accumulator.unclassifiedLeads,
    totalLeads,
    contactIntent: {
      ...accumulator.contactIntent,
      total: totalContactIntent,
    },
    rates: {
      engagementRate: safeRate(accumulator.engagedSessions, sessions),
      sellerOwnerLeadRate: safeRate(
        accumulator.sellerOwnerLeads,
        sessions,
      ),
      generalConsultationRate: safeRate(
        accumulator.generalConsultations,
        sessions,
      ),
      newLaunchLeadRate: safeRate(accumulator.newLaunchLeads, sessions),
      nurtureSignupRate: safeRate(accumulator.nurtureSignups, sessions),
      unclassifiedLeadRate: safeRate(
        accumulator.unclassifiedLeads,
        sessions,
      ),
      totalLeadRate: safeRate(totalLeads, sessions),
      contactIntentRate: safeRate(totalContactIntent, sessions),
    },
    unclassifiedLeadTypes: bucketEntries(
      accumulator.unclassifiedLeadTypes,
    ),
    unclassifiedContactMethods: bucketEntries(
      accumulator.unclassifiedContactMethods,
    ),
  };
}

function emptyGa4Metrics() {
  return finalizeGa4Metrics(createGa4Accumulator());
}

function invalidLandingPageLabel(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const unavailable = (
      !normalized ||
      normalized === '(not set)' ||
      normalized === '(not assigned)' ||
      normalized === '(other)' ||
      normalized === '(data not available)'
  );
  return unavailable ? normalized || '(not set)' : '[invalid landing page]';
}

export function aggregateGa4Window({
  sessionRows = [],
  leadRows = [],
  contactRows = [],
} = {}) {
  const accumulators = new Map();
  const invalidLandingPageRows = [];
  const accumulatorFor = (normalizedPath) => {
    if (!accumulators.has(normalizedPath)) {
      accumulators.set(normalizedPath, createGa4Accumulator());
    }
    return accumulators.get(normalizedPath);
  };

  for (const row of sessionRows) {
    const landingPage =
      row?.dimensions?.landingPagePlusQueryString;
    const normalizedPath = normalizePagePath(landingPage);
    const organicSessions = ga4AggregateCount(
      row?.metrics?.sessions,
      'sessions',
    );
    const engagedSessions = ga4AggregateCount(
      row?.metrics?.engagedSessions,
      'engagedSessions',
    );
    if (!normalizedPath) {
      invalidLandingPageRows.push({
        source: 'sessions',
        landingPage: invalidLandingPageLabel(landingPage),
        organicSessions,
        engagedSessions,
      });
      continue;
    }
    const accumulator = accumulatorFor(normalizedPath);
    accumulator.hasSessionData = true;
    accumulator.organicSessions += organicSessions;
    accumulator.engagedSessions += engagedSessions;
  }

  for (const row of leadRows) {
    const landingPage =
      row?.dimensions?.landingPagePlusQueryString;
    const leadType = row?.dimensions?.['customEvent:lead_type'];
    const normalizedPath = normalizePagePath(landingPage);
    const eventCount = ga4AggregateCount(
      row?.metrics?.eventCount,
      'eventCount',
    );
    const category = classifyLeadType(leadType);
    if (!normalizedPath) {
      invalidLandingPageRows.push({
        source: 'generate_lead',
        landingPage: invalidLandingPageLabel(landingPage),
        leadType: safeDimensionBucket(leadType),
        eventCount,
      });
      continue;
    }
    const accumulator = accumulatorFor(normalizedPath);
    accumulator.hasLeadData = true;
    accumulator[category] += eventCount;
    if (category === 'unclassifiedLeads') {
      addBucketCount(
        accumulator.unclassifiedLeadTypes,
        leadType,
        eventCount,
      );
    }
  }

  for (const row of contactRows) {
    const landingPage =
      row?.dimensions?.landingPagePlusQueryString;
    const contactMethod =
      row?.dimensions?.['customEvent:contact_method'];
    const normalizedPath = normalizePagePath(landingPage);
    const eventCount = ga4AggregateCount(
      row?.metrics?.eventCount,
      'eventCount',
    );
    const category = classifyContactMethod(contactMethod);
    if (!normalizedPath) {
      invalidLandingPageRows.push({
        source: 'contact_click',
        landingPage: invalidLandingPageLabel(landingPage),
        contactMethod: safeDimensionBucket(contactMethod),
        eventCount,
      });
      continue;
    }
    const accumulator = accumulatorFor(normalizedPath);
    accumulator.hasContactData = true;
    accumulator.contactIntent[category] += eventCount;
    if (category === 'unclassified') {
      addBucketCount(
        accumulator.unclassifiedContactMethods,
        contactMethod,
        eventCount,
      );
    }
  }

  const byPath = new Map(
    [...accumulators.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([normalizedPath, accumulator]) => [
        normalizedPath,
        finalizeGa4Metrics(accumulator),
      ]),
  );
  invalidLandingPageRows.sort((left, right) =>
    compareText(JSON.stringify(left), JSON.stringify(right)),
  );
  return { byPath, invalidLandingPageRows };
}

function ga4MetricsDelta(current, prior) {
  const scalarFields = [
    'organicSessions',
    'engagedSessions',
    'sellerOwnerLeads',
    'generalConsultations',
    'newLaunchLeads',
    'nurtureSignups',
    'unclassifiedLeads',
    'totalLeads',
  ];
  const scalars = Object.fromEntries(
    scalarFields.map((field) => [field, current[field] - prior[field]]),
  );
  const contactIntent = Object.fromEntries(
    ['phoneCall', 'whatsapp', 'calendly', 'email', 'unclassified', 'total']
      .map((field) => [
        field,
        current.contactIntent[field] - prior.contactIntent[field],
      ]),
  );
  const rates = Object.fromEntries(
    Object.keys(current.rates).map((field) => [
      field,
      current.rates[field] == null || prior.rates[field] == null ?
        null
      : current.rates[field] - prior.rates[field],
    ]),
  );
  return { ...scalars, contactIntent, rates };
}

function joinGa4ToOpportunities(
  opportunities,
  currentGa4,
  priorGa4,
) {
  return opportunities.map((opportunity) => {
    const normalizedPath = normalizePagePath(opportunity.page);
    const currentMatched =
      normalizedPath != null && currentGa4.byPath.has(normalizedPath);
    const priorMatched =
      normalizedPath != null && priorGa4.byPath.has(normalizedPath);
    const current =
      currentGa4.byPath.get(normalizedPath) || emptyGa4Metrics();
    const prior =
      priorGa4.byPath.get(normalizedPath) || emptyGa4Metrics();
    return {
      ...opportunity,
      ga4: {
        normalizedPath,
        matched: {
          current: currentMatched,
          prior: priorMatched,
        },
        current,
        prior,
        delta: ga4MetricsDelta(current, prior),
      },
    };
  });
}

function unmatchedGa4LandingPages(opportunities, currentGa4, priorGa4) {
  const opportunityPaths = new Set(
    opportunities
      .map((opportunity) => opportunity.ga4.normalizedPath)
      .filter(Boolean),
  );
  const allPaths = new Set([
    ...currentGa4.byPath.keys(),
    ...priorGa4.byPath.keys(),
  ]);
  return [...allPaths]
    .filter((normalizedPath) => !opportunityPaths.has(normalizedPath))
    .sort(compareText)
    .map((normalizedPath) => {
      const current =
        currentGa4.byPath.get(normalizedPath) || emptyGa4Metrics();
      const prior =
        priorGa4.byPath.get(normalizedPath) || emptyGa4Metrics();
      return {
        normalizedPath,
        current,
        prior,
        delta: ga4MetricsDelta(current, prior),
      };
    });
}

export function buildReport({
  siteUrl,
  ga4PropertyId,
  windows,
  generatedAt,
  currentRows,
  priorRows,
  currentSingaporeTotalRows,
  priorSingaporeTotalRows,
  currentGlobalTotalRows,
  priorGlobalTotalRows,
  currentGa4SessionRows = [],
  priorGa4SessionRows = [],
  currentGa4LeadRows = [],
  priorGa4LeadRows = [],
  currentGa4ContactRows = [],
  priorGa4ContactRows = [],
}) {
  const currentGa4 = aggregateGa4Window({
    sessionRows: currentGa4SessionRows,
    leadRows: currentGa4LeadRows,
    contactRows: currentGa4ContactRows,
  });
  const priorGa4 = aggregateGa4Window({
    sessionRows: priorGa4SessionRows,
    leadRows: priorGa4LeadRows,
    contactRows: priorGa4ContactRows,
  });
  const opportunities = joinGa4ToOpportunities(
    selectOpportunities(currentRows, priorRows),
    currentGa4,
    priorGa4,
  );
  const visibilitySnapshot = selectVisibilitySnapshot(currentRows);
  const visibilityWatchlist = selectVisibilityWatchlist(currentRows);
  const unmatchedSearchConsolePages = opportunities
    .filter(
      (opportunity) =>
        !opportunity.ga4.matched.current ||
        !opportunity.ga4.matched.prior,
    )
    .map((opportunity) => ({
      rank: opportunity.rank,
      page: opportunity.page,
      normalizedPath: opportunity.ga4.normalizedPath,
      missingPeriods: [
        ...(!opportunity.ga4.matched.current ? ['current'] : []),
        ...(!opportunity.ga4.matched.prior ? ['prior'] : []),
      ],
    }));
  return {
    schemaVersion: 2,
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
    ga4: {
      propertyId: ga4PropertyId,
      channelGroup: 'Organic Search',
      hostName: GA4_HOST_NAME,
      requiredCustomDimensions: [
        ...REQUIRED_GA4_CUSTOM_DIMENSIONS,
      ],
      unmatchedSearchConsolePages,
      unmatchedLandingPages: unmatchedGa4LandingPages(
        opportunities,
        currentGa4,
        priorGa4,
      ),
      // Independent of Search Console thresholds: zero ranked opportunities
      // must not hide sessions, lead submissions or contact intent.
      landingPages: unmatchedGa4LandingPages([], currentGa4, priorGa4)
        .sort((left, right) =>
          right.current.organicSessions - left.current.organicSessions ||
          compareText(left.normalizedPath, right.normalizedPath)),
      invalidLandingPageRows: {
        current: currentGa4.invalidLandingPageRows,
        prior: priorGa4.invalidLandingPageRows,
      },
      sourceNote:
        'GA4 metrics are aggregate Organic Search signals for hostName joetay.com, joined to Search Console rows by normalized landing-page path. Contact intent is not counted as a completed lead.',
    },
    opportunityDefinitions: OPPORTUNITY_DEFINITIONS,
    opportunities,
    visibilitySnapshot,
    visibilityWatchlist,
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
    .replace(/`/g, '&#96;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;');
}

function totalsRow(label, current, prior) {
  return `| ${label} | ${formatInteger(current.clicks)} | ${formatInteger(prior.clicks)} | ${formatInteger(current.impressions)} | ${formatInteger(prior.impressions)} | ${formatPercent(current.ctr)} | ${formatPercent(prior.ctr)} |`;
}

function formatSignedInteger(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${formatInteger(value)}`;
}

function ga4MetricRow({
  label,
  current,
  prior,
  delta,
  currentRate = null,
  priorRate = null,
  rateDelta = null,
}) {
  return `| ${label} | ${formatInteger(current)} | ${formatInteger(prior)} | ${formatSignedInteger(delta)} | ${formatPercent(currentRate)} | ${formatPercent(priorRate)} | ${formatPercent(rateDelta)} |`;
}

function formatBucketCounts(entries) {
  if (entries.length === 0) return 'none';
  return entries
    .map(
      ({ value, count }) =>
        `\`${escapeMarkdownCell(value)}\`=${formatInteger(count)}`,
    )
    .join(', ');
}

function appendGa4Opportunity(lines, opportunity) {
  const { current, prior, delta, matched, normalizedPath } =
    opportunity.ga4;
  lines.push(
    `### ${opportunity.rank}. ${escapeMarkdownCell(opportunity.query)}`,
    '',
    `Path: \`${escapeMarkdownCell(normalizedPath)}\`  `,
    `GA4 row present: current **${matched.current ? 'yes' : 'no'}**, prior **${matched.prior ? 'yes' : 'no'}**`,
    '',
    '| Metric | Current | Prior | Delta | Current rate | Prior rate | Rate change |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ga4MetricRow({
      label: 'Organic sessions',
      current: current.organicSessions,
      prior: prior.organicSessions,
      delta: delta.organicSessions,
    }),
    ga4MetricRow({
      label: 'Engaged sessions',
      current: current.engagedSessions,
      prior: prior.engagedSessions,
      delta: delta.engagedSessions,
      currentRate: current.rates.engagementRate,
      priorRate: prior.rates.engagementRate,
      rateDelta: delta.rates.engagementRate,
    }),
    ga4MetricRow({
      label: 'Seller/owner lead events',
      current: current.sellerOwnerLeads,
      prior: prior.sellerOwnerLeads,
      delta: delta.sellerOwnerLeads,
      currentRate: current.rates.sellerOwnerLeadRate,
      priorRate: prior.rates.sellerOwnerLeadRate,
      rateDelta: delta.rates.sellerOwnerLeadRate,
    }),
    ga4MetricRow({
      label: 'General consultation events',
      current: current.generalConsultations,
      prior: prior.generalConsultations,
      delta: delta.generalConsultations,
      currentRate: current.rates.generalConsultationRate,
      priorRate: prior.rates.generalConsultationRate,
      rateDelta: delta.rates.generalConsultationRate,
    }),
    ga4MetricRow({
      label: 'New-launch registration events',
      current: current.newLaunchLeads,
      prior: prior.newLaunchLeads,
      delta: delta.newLaunchLeads,
      currentRate: current.rates.newLaunchLeadRate,
      priorRate: prior.rates.newLaunchLeadRate,
      rateDelta: delta.rates.newLaunchLeadRate,
    }),
    ga4MetricRow({
      label: 'Nurture signup events',
      current: current.nurtureSignups,
      prior: prior.nurtureSignups,
      delta: delta.nurtureSignups,
      currentRate: current.rates.nurtureSignupRate,
      priorRate: prior.rates.nurtureSignupRate,
      rateDelta: delta.rates.nurtureSignupRate,
    }),
    ga4MetricRow({
      label: 'Unclassified lead events',
      current: current.unclassifiedLeads,
      prior: prior.unclassifiedLeads,
      delta: delta.unclassifiedLeads,
      currentRate: current.rates.unclassifiedLeadRate,
      priorRate: prior.rates.unclassifiedLeadRate,
      rateDelta: delta.rates.unclassifiedLeadRate,
    }),
    ga4MetricRow({
      label: 'Completed lead events total',
      current: current.totalLeads,
      prior: prior.totalLeads,
      delta: delta.totalLeads,
      currentRate: current.rates.totalLeadRate,
      priorRate: prior.rates.totalLeadRate,
      rateDelta: delta.rates.totalLeadRate,
    }),
    ga4MetricRow({
      label: 'Contact-intent events total',
      current: current.contactIntent.total,
      prior: prior.contactIntent.total,
      delta: delta.contactIntent.total,
      currentRate: current.rates.contactIntentRate,
      priorRate: prior.rates.contactIntentRate,
      rateDelta: delta.rates.contactIntentRate,
    }),
    '',
    `Contact intent current/prior — phone: ${formatInteger(current.contactIntent.phoneCall)}/${formatInteger(prior.contactIntent.phoneCall)}; WhatsApp: ${formatInteger(current.contactIntent.whatsapp)}/${formatInteger(prior.contactIntent.whatsapp)}; Calendly: ${formatInteger(current.contactIntent.calendly)}/${formatInteger(prior.contactIntent.calendly)}; email: ${formatInteger(current.contactIntent.email)}/${formatInteger(prior.contactIntent.email)}; unclassified: ${formatInteger(current.contactIntent.unclassified)}/${formatInteger(prior.contactIntent.unclassified)}.`,
  );

  if (
    current.unclassifiedLeadTypes.length > 0 ||
    prior.unclassifiedLeadTypes.length > 0
  ) {
    lines.push(
      `Unclassified lead types — current: ${formatBucketCounts(current.unclassifiedLeadTypes)}; prior: ${formatBucketCounts(prior.unclassifiedLeadTypes)}.`,
    );
  }
  if (
    current.unclassifiedContactMethods.length > 0 ||
    prior.unclassifiedContactMethods.length > 0
  ) {
    lines.push(
      `Unclassified contact methods — current: ${formatBucketCounts(current.unclassifiedContactMethods)}; prior: ${formatBucketCounts(prior.unclassifiedContactMethods)}.`,
    );
  }
  lines.push('');
}

function invalidGa4RowDetail(row) {
  if (row.source === 'sessions') {
    return `sessions=${formatInteger(row.organicSessions)}, engaged=${formatInteger(row.engagedSessions)}`;
  }
  if (row.source === 'generate_lead') {
    return `lead_type=${escapeMarkdownCell(row.leadType)}, events=${formatInteger(row.eventCount)}`;
  }
  return `contact_method=${escapeMarkdownCell(row.contactMethod)}, events=${formatInteger(row.eventCount)}`;
}

export function renderMarkdown(report) {
  const lines = [
    '# Weekly Search Console organic-growth report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Property: \`${report.siteUrl}\`  `,
    `GA4 property: \`${report.ga4.propertyId}\`  `,
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
    '## Visibility snapshot',
    '',
    'Top non-branded rows by impressions, with no threshold applied. The opportunity buckets below all require 50+ impressions on a single query, so early on this table is the only place the real ranking picture shows up.',
    '',
  ];
  if (report.visibilitySnapshot && report.visibilitySnapshot.length) {
    lines.push(
      '| Query | Page | Impressions | Clicks | Avg position |',
      '|---|---|---:|---:|---:|',
      ...report.visibilitySnapshot.map(
        (row) =>
          `| ${escapeMarkdownCell(row.query || '—')} | ${escapeMarkdownCell(row.page || '—')} | ${formatInteger(row.impressions)} | ${formatInteger(row.clicks)} | ${row.position == null ? '—' : row.position.toFixed(1)} |`,
      ),
      '',
    );
  } else {
    lines.push('**No non-branded query/page rows were returned for this window. This does not prove the site had no search visibility; Search Console omits some queries.**', '');
  }
  const nearTop20 = (report.visibilityWatchlist || [])
    .filter((row) => row.nearTop20)
    .sort((left, right) => left.position - right.position || right.impressions - left.impressions || compareText(left.query, right.query));
  lines.push(
    '## Top-20 watchlist: average positions above 20 through 50',
    '',
    'Exploratory query/page observations, not guaranteed rankings or keyword search volumes. Low-volume means fewer than 50 impressions; the ranked-opportunity thresholds remain unchanged. The JSON visibilityWatchlist includes all returned non-branded rows with impressions, across all positions.',
    '',
  );
  if (nearTop20.length) {
    lines.push(
      '| Query | Page | Impressions | Clicks | Avg position | Evidence |',
      '|---|---|---:|---:|---:|---|',
      ...nearTop20.slice(0, 100).map((row) =>
        `| ${escapeMarkdownCell(row.query)} | ${escapeMarkdownCell(row.page)} | ${formatInteger(row.impressions)} | ${formatInteger(row.clicks)} | ${formatPosition(row.position)} | ${row.confidence} |`),
      '',
    );
    if (nearTop20.length > 100) lines.push(`Showing 100 of ${nearTop20.length} watch items; see the JSON artifact for all rows.`, '');
  } else {
    lines.push('No returned non-branded rows in this position range. Other positions remain in the JSON watchlist.', '');
  }
  lines.push(
    '## Ranked opportunities',
    '',
  );

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

  lines.push(
    '## GA4 organic lead quality',
    '',
    'GA4 is filtered to Organic Search and uses the same date windows. Lead and contact rates are event counts per organic session, not unique-user conversion rates. Contact intent is never counted as a completed lead.',
    '',
  );
  lines.push('### All organic landing pages, independent of ranking thresholds', '');
  const landingPages = report.ga4.landingPages || [];
  if (landingPages.length) {
    lines.push(
      '| Landing page | Current sessions | Prior sessions | Current engaged sessions | Current lead submissions | Prior lead submissions | Current contact intent |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...landingPages.slice(0, 100).map((row) =>
        `| ${escapeMarkdownCell(row.normalizedPath)} | ${formatInteger(row.current.organicSessions)} | ${formatInteger(row.prior.organicSessions)} | ${formatInteger(row.current.engagedSessions)} | ${formatInteger(row.current.totalLeads)} | ${formatInteger(row.prior.totalLeads)} | ${formatInteger(row.current.contactIntent.total)} |`),
      '',
      'Lead submissions and contact clicks are event counts, not verified qualified customers. Full current/prior metrics and lead-type breakdowns are in JSON ga4.landingPages. GA4 Organic Search is not restricted to Singapore; do not equate these sessions with Singapore Search Console clicks.',
      '',
    );
    if (landingPages.length > 100) lines.push(`Showing 100 of ${landingPages.length} landing pages; see the JSON artifact for all rows.`, '');
  } else {
    lines.push('No reportable organic landing-page rows were returned by GA4. Check tracking coverage and the invalid-path diagnostics; this is not inferred from Search Console opportunity counts.', '');
  }
  lines.push('### Ranked-opportunity enrichment', '');
  if (report.opportunities.length === 0) {
    lines.push(
      'No ranked Search Console opportunity rows were available to enrich.',
      '',
    );
  } else {
    for (const opportunity of report.opportunities) {
      appendGa4Opportunity(lines, opportunity);
    }
  }

  lines.push(
    '## Page-join diagnostics',
    '',
    '### Search Console opportunities without matching GA4 rows',
    '',
  );
  if (report.ga4.unmatchedSearchConsolePages.length === 0) {
    lines.push('All ranked opportunity paths matched both GA4 windows.', '');
  } else {
    lines.push(
      '| Rank | Page | Normalized path | Missing GA4 periods |',
      '|---:|---|---|---|',
    );
    for (const row of report.ga4.unmatchedSearchConsolePages) {
      lines.push(
        `| #${row.rank} | ${escapeMarkdownCell(row.page)} | ${escapeMarkdownCell(row.normalizedPath)} | ${row.missingPeriods.join(', ')} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    '### GA4 landing pages without ranked Search Console opportunities',
    '',
  );
  if (report.ga4.unmatchedLandingPages.length === 0) {
    lines.push('No unmatched normalized GA4 landing pages.', '');
  } else {
    lines.push(
      '| Normalized path | Current sessions | Prior sessions | Current leads | Prior leads | Current contact intent | Prior contact intent |',
      '|---|---:|---:|---:|---:|---:|---:|',
    );
    for (const row of report.ga4.unmatchedLandingPages) {
      lines.push(
        `| ${escapeMarkdownCell(row.normalizedPath)} | ${formatInteger(row.current.organicSessions)} | ${formatInteger(row.prior.organicSessions)} | ${formatInteger(row.current.totalLeads)} | ${formatInteger(row.prior.totalLeads)} | ${formatInteger(row.current.contactIntent.total)} | ${formatInteger(row.prior.contactIntent.total)} |`,
      );
    }
    lines.push('');
  }

  lines.push('### GA4 rows without a reportable landing path', '');
  const invalidRows = [
    ...report.ga4.invalidLandingPageRows.current.map((row) => ({
      period: 'Current',
      ...row,
    })),
    ...report.ga4.invalidLandingPageRows.prior.map((row) => ({
      period: 'Prior',
      ...row,
    })),
  ];
  if (invalidRows.length === 0) {
    lines.push('No GA4 rows had an invalid or unavailable landing path.', '');
  } else {
    lines.push(
      '| Period | Source | Landing page | Aggregate detail |',
      '|---|---|---|---|',
    );
    for (const row of invalidRows) {
      lines.push(
        `| ${row.period} | ${escapeMarkdownCell(row.source)} | ${escapeMarkdownCell(row.landingPage)} | ${invalidGa4RowDetail(row)} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    `_${report.sourceNote}_`,
    '',
    `_${report.ga4.sourceNote}_`,
    '',
  );
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
  const ga4PropertyId = parseGa4PropertyId(env.GA4_PROPERTY_ID);
  const windows = calculateDateWindows(now);
  const accessToken = await createServiceAccountAccessToken(credentials, {
    fetchImpl,
    now,
  });
  await verifyGa4CustomDimensions({
    accessToken,
    propertyId: ga4PropertyId,
    fetchImpl,
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
  const ga4SessionQuery = (window) =>
    queryGa4Report({
      accessToken,
      propertyId: ga4PropertyId,
      window,
      reportType: 'sessions',
      fetchImpl,
    });
  const ga4LeadQuery = (window) =>
    queryGa4Report({
      accessToken,
      propertyId: ga4PropertyId,
      window,
      reportType: 'leads',
      fetchImpl,
    });
  const ga4ContactQuery = (window) =>
    queryGa4Report({
      accessToken,
      propertyId: ga4PropertyId,
      window,
      reportType: 'contacts',
      fetchImpl,
    });

  const [
    currentRows,
    priorRows,
    currentSingaporeTotalRows,
    priorSingaporeTotalRows,
    currentGlobalTotalRows,
    priorGlobalTotalRows,
    currentGa4SessionRows,
    priorGa4SessionRows,
    currentGa4LeadRows,
    priorGa4LeadRows,
    currentGa4ContactRows,
    priorGa4ContactRows,
  ] = await Promise.all([
    detailQuery(windows.current),
    detailQuery(windows.prior),
    singaporeTotalQuery(windows.current),
    singaporeTotalQuery(windows.prior),
    globalTotalQuery(windows.current),
    globalTotalQuery(windows.prior),
    ga4SessionQuery(windows.current),
    ga4SessionQuery(windows.prior),
    ga4LeadQuery(windows.current),
    ga4LeadQuery(windows.prior),
    ga4ContactQuery(windows.current),
    ga4ContactQuery(windows.prior),
  ]);

  const report = buildReport({
    siteUrl,
    ga4PropertyId,
    windows,
    generatedAt: now.toISOString(),
    currentRows,
    priorRows,
    currentSingaporeTotalRows,
    priorSingaporeTotalRows,
    currentGlobalTotalRows,
    priorGlobalTotalRows,
    currentGa4SessionRows,
    priorGa4SessionRows,
    currentGa4LeadRows,
    priorGa4LeadRows,
    currentGa4ContactRows,
    priorGa4ContactRows,
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
