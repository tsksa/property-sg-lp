import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  aggregateGa4Window,
  buildReport,
  buildGa4ContactRequest,
  buildGa4LeadRequest,
  buildGa4SessionRequest,
  buildSearchAnalyticsRequest,
  calculateDateWindows,
  classifyContactMethod,
  classifyLeadType,
  createServiceAccountAccessToken,
  isBrandedQuery,
  main,
  normalizeGa4ResponseRows,
  normalizePagePath,
  normalizeResponseRows,
  parseGa4PropertyId,
  parseServiceAccount,
  publicErrorMessage,
  queryGa4Report,
  querySearchAnalytics,
  renderMarkdown,
  selectOpportunities,
  selectVisibilityWatchlist,
  serializeReport,
  verifyGa4CustomDimensions,
  writeReportArtifacts,
} from '../scripts/search-growth-report.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIRECTORY = path.join(TEST_DIRECTORY, 'fixtures/search-console');
const GA4_FIXTURE_DIRECTORY = path.join(TEST_DIRECTORY, 'fixtures/ga4');

async function fixture(name) {
  return JSON.parse(
    await readFile(path.join(FIXTURE_DIRECTORY, `${name}.json`), 'utf8'),
  );
}

async function ga4Fixture(name) {
  return JSON.parse(
    await readFile(path.join(GA4_FIXTURE_DIRECTORY, `${name}.json`), 'utf8'),
  );
}

function ga4Rows(payload, dimensionNames, metricNames) {
  return normalizeGa4ResponseRows(payload, dimensionNames, metricNames);
}

function row({
  query = 'synthetic query',
  page = 'https://example.test/page',
  clicks = 1,
  impressions = 100,
  ctr = clicks / impressions,
  position = 5,
} = {}) {
  return { query, page, clicks, impressions, ctr, position };
}

function response({ ok = true, status = 200, payload = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

function fixtureServiceAccountJson() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
  });
  return JSON.stringify({
    type: 'service_account',
    client_email: 'fixture@example.test',
    private_key: privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
  });
}

test('calculates adjacent inclusive 28-day windows from the Singapore run date', () => {
  assert.deepEqual(
    calculateDateWindows(new Date('2026-07-27T02:15:00.000Z')),
    {
      current: { startDate: '2026-06-27', endDate: '2026-07-24' },
      prior: { startDate: '2026-05-30', endDate: '2026-06-26' },
    },
  );
  assert.deepEqual(
    calculateDateWindows(new Date('2024-03-03T02:15:00.000Z')),
    {
      current: { startDate: '2024-02-02', endDate: '2024-02-29' },
      prior: { startDate: '2024-01-05', endDate: '2024-02-01' },
    },
  );
});

test('classifies only the specified brand substrings case-insensitively', () => {
  for (const query of [
    'Joe Tay property agent',
    'JOETAY reviews',
    'PropertySG valuation',
    'best Property SG agent',
  ]) {
    assert.equal(isBrandedQuery(query), true, query);
  }
  assert.equal(isBrandedQuery('property search singapore'), false);
  assert.equal(isBrandedQuery('joe property advice'), false);
});

test('builds finalized Singapore web requests and unfiltered global requests', () => {
  const window = { startDate: '2026-06-27', endDate: '2026-07-24' };
  assert.deepEqual(buildSearchAnalyticsRequest({ window }), {
    startDate: '2026-06-27',
    endDate: '2026-07-24',
    type: 'web',
    dataState: 'final',
    rowLimit: 25000,
    startRow: 0,
    dimensions: ['query', 'page'],
    dimensionFilterGroups: [
      {
        groupType: 'and',
        filters: [
          {
            dimension: 'country',
            operator: 'equals',
            expression: 'sgp',
          },
        ],
      },
    ],
  });
  const globalRequest = buildSearchAnalyticsRequest({
    window,
    dimensions: [],
    country: null,
    rowLimit: 1,
  });
  assert.equal('dimensions' in globalRequest, false);
  assert.equal('dimensionFilterGroups' in globalRequest, false);
  assert.equal(globalRequest.type, 'web');
  assert.equal(globalRequest.dataState, 'final');
});

test('requires a numeric GA4 property ID', () => {
  assert.equal(parseGa4PropertyId(' 123456789 '), '123456789');
  for (const value of [
    undefined,
    '',
    'G-ABC123',
    'GT-KVFDZD5V',
    'properties/123456789',
  ]) {
    assert.throws(() => parseGa4PropertyId(value), /GA4_PROPERTY_ID/);
  }
});

test('builds separate organic-only GA4 session, lead, and contact requests', () => {
  const window = { startDate: '2026-06-27', endDate: '2026-07-24' };
  const sessions = buildGa4SessionRequest({ window, offset: 4 });
  assert.deepEqual(sessions.dateRanges, [window]);
  assert.deepEqual(sessions.dimensions, [
    { name: 'landingPagePlusQueryString' },
  ]);
  assert.deepEqual(sessions.metrics, [
    { name: 'sessions' },
    { name: 'engagedSessions' },
  ]);
  assert.equal(
    sessions.dimensionFilter.andGroup.expressions[0].filter.fieldName,
    'sessionDefaultChannelGroup',
  );
  assert.equal(
    sessions.dimensionFilter.andGroup.expressions[0].filter.stringFilter
      .value,
    'Organic Search',
  );
  assert.equal(
    sessions.dimensionFilter.andGroup.expressions[1].filter.fieldName,
    'hostName',
  );
  assert.equal(
    sessions.dimensionFilter.andGroup.expressions[1].filter.stringFilter
      .value,
    'joetay.com',
  );
  assert.equal(sessions.offset, '4');

  const leads = buildGa4LeadRequest({ window });
  assert.deepEqual(leads.dimensions, [
    { name: 'landingPagePlusQueryString' },
    { name: 'customEvent:lead_type' },
  ]);
  assert.deepEqual(leads.metrics, [{ name: 'eventCount' }]);
  assert.equal(
    leads.dimensionFilter.andGroup.expressions[2].filter.stringFilter.value,
    'generate_lead',
  );

  const contacts = buildGa4ContactRequest({ window });
  assert.deepEqual(contacts.dimensions, [
    { name: 'landingPagePlusQueryString' },
    { name: 'customEvent:contact_method' },
  ]);
  assert.equal(
    contacts.dimensionFilter.andGroup.expressions[2].filter.stringFilter
      .value,
    'contact_click',
  );
  for (const request of [leads, contacts]) {
    assert.equal(
      request.dimensionFilter.andGroup.expressions[0].filter.stringFilter
        .value,
      'Organic Search',
    );
    assert.equal(
      request.dimensionFilter.andGroup.expressions[1].filter.fieldName,
      'hostName',
    );
    assert.equal(
      request.dimensionFilter.andGroup.expressions[1].filter.stringFilter
        .value,
      'joetay.com',
    );
  }
});

test('normalizes page variants and keeps event classifications exact', () => {
  for (const value of [
    '/sell',
    '/sell/',
    '/sell/index.html',
    '/sell/?utm_source=google#hero',
    '//sell//index.html?ref=x',
    'https://example.test/sell/index.html?ref=x#hero',
  ]) {
    assert.equal(normalizePagePath(value), '/sell', value);
  }
  assert.equal(normalizePagePath('/'), '/');
  assert.equal(normalizePagePath('/Path/Index.html'), '/Path');
  assert.equal(normalizePagePath('(not set)'), null);
  assert.equal(normalizePagePath('(other)'), null);
  assert.equal(normalizePagePath('javascript:alert(1)'), null);

  const leadExpectations = new Map([
    ['seller_consult', 'sellerOwnerLeads'],
    ['valuation', 'sellerOwnerLeads'],
    ['landlord_consult', 'sellerOwnerLeads'],
    ['final_cta_consultation', 'sellerOwnerLeads'],
    ['consultation', 'generalConsultations'],
    ['calendly_booking', 'generalConsultations'],
    ['new_launch_registration', 'newLaunchLeads'],
    ['newsletter_signup', 'nurtureSignups'],
    ['unknown_type', 'unclassifiedLeads'],
    ['Seller_Consult', 'unclassifiedLeads'],
    [' seller_consult ', 'unclassifiedLeads'],
    ['', 'unclassifiedLeads'],
    ['(not set)', 'unclassifiedLeads'],
  ]);
  for (const [value, category] of leadExpectations) {
    assert.equal(classifyLeadType(value), category, value);
  }

  const contactExpectations = new Map([
    ['phone_call', 'phoneCall'],
    ['whatsapp', 'whatsapp'],
    ['calendly', 'calendly'],
    ['email', 'email'],
    ['Email', 'unclassified'],
    [' email ', 'unclassified'],
    ['unknown_method', 'unclassified'],
    ['', 'unclassified'],
  ]);
  for (const [value, category] of contactExpectations) {
    assert.equal(classifyContactMethod(value), category, value);
  }
});

test('verifies both event-scoped GA4 custom dimensions before reporting', async () => {
  const metadata = await ga4Fixture('metadata');
  let request;
  const result = await verifyGa4CustomDimensions({
    accessToken: 'fixture-token',
    propertyId: '123456789',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ payload: metadata });
    },
  });
  assert.equal(
    request.url,
    'https://analyticsdata.googleapis.com/v1beta/properties/123456789/metadata',
  );
  assert.equal(request.options.method, 'GET');
  assert.deepEqual(result.requiredDimensions, [
    'customEvent:lead_type',
    'customEvent:contact_method',
  ]);

  const missingContact = {
    ...metadata,
    dimensions: metadata.dimensions.filter(
      (dimension) =>
        dimension.apiName !== 'customEvent:contact_method',
    ),
  };
  await assert.rejects(
    verifyGa4CustomDimensions({
      accessToken: 'fixture-token',
      propertyId: '123456789',
      fetchImpl: async () => response({ payload: missingContact }),
    }),
    (error) => {
      const message = publicErrorMessage(error);
      return (
        message.includes('contact_method') &&
        message.includes('GA4 Admin') &&
        message.includes('Scope "Event"') &&
        message.includes('24–48 hours')
      );
    },
  );
});

test('normalizes and paginates GA4 reports using response headers and rowCount', async () => {
  const requests = [];
  const rows = await queryGa4Report({
    accessToken: 'fixture-token',
    propertyId: '123456789',
    window: { startDate: '2026-06-27', endDate: '2026-07-24' },
    reportType: 'sessions',
    rowLimit: 1,
    fetchImpl: async (url, options) => {
      const request = JSON.parse(options.body);
      requests.push({ url, request });
      const landingPage = request.offset === '0' ? '/first' : '/second';
      return response({
        payload: {
          dimensionHeaders: [
            { name: 'landingPagePlusQueryString' },
          ],
          metricHeaders: [
            { name: 'sessions', type: 'TYPE_INTEGER' },
            { name: 'engagedSessions', type: 'TYPE_INTEGER' },
          ],
          rows: [
            {
              dimensionValues: [{ value: landingPage }],
              metricValues: [{ value: '2' }, { value: '1' }],
            },
          ],
          rowCount: 2,
        },
      });
    },
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    requests.map(({ request }) => request.offset),
    ['0', '1'],
  );
  assert.ok(
    requests.every(({ url }) =>
      url.endsWith('/properties/123456789:runReport'),
    ),
  );
  assert.deepEqual(rows[0], {
    dimensions: { landingPagePlusQueryString: '/first' },
    metrics: { sessions: 2, engagedSessions: 1 },
  });

  let partialPage = 0;
  await assert.rejects(
    queryGa4Report({
      accessToken: 'fixture-token',
      propertyId: '123456789',
      window: {
        startDate: '2026-06-27',
        endDate: '2026-07-24',
      },
      reportType: 'sessions',
      rowLimit: 1,
      fetchImpl: async () => {
        partialPage += 1;
        return response({
          payload: {
            dimensionHeaders: [
              { name: 'landingPagePlusQueryString' },
            ],
            metricHeaders: [
              { name: 'sessions', type: 'TYPE_INTEGER' },
              { name: 'engagedSessions', type: 'TYPE_INTEGER' },
            ],
            ...(partialPage === 1 ?
              {
                rows: [
                  {
                    dimensionValues: [{ value: '/only-row' }],
                    metricValues: [
                      { value: '2' },
                      { value: '1' },
                    ],
                  },
                ],
              }
            : {}),
            rowCount: 2,
          },
        });
      },
    }),
    /pagination ended before/,
  );

  assert.throws(
    () =>
      normalizeGa4ResponseRows(
        {
          dimensionHeaders: [
            { name: 'landingPagePlusQueryString' },
          ],
          metricHeaders: [
            { name: 'sessions' },
            { name: 'engagedSessions' },
          ],
          rows: [
            {
              dimensionValues: [{ value: '/' }],
              metricValues: [{ value: 'NaN' }, { value: '0' }],
            },
          ],
        },
        ['landingPagePlusQueryString'],
        ['sessions', 'engagedSessions'],
      ),
    /invalid sessions metric/,
  );
});

test('normalizes omitted rows as an empty valid response', () => {
  assert.deepEqual(normalizeResponseRows({}, ['query', 'page']), []);
});

test('rejects malformed or out-of-range metrics instead of reporting zeroes', () => {
  assert.throws(
    () =>
      normalizeResponseRows(
        {
          rows: [
            {
              keys: ['query', 'https://example.test/'],
              clicks: 1,
              impressions: 10,
              ctr: 0.1
            },
          ],
        },
        ['query', 'page'],
      ),
    /required position metric/,
  );
  assert.throws(
    () =>
      normalizeResponseRows(
        {
          rows: [
            {
              keys: ['query', 'https://example.test/'],
              clicks: 1,
              impressions: 10,
              ctr: 1.1,
              position: 1
            },
          ],
        },
        ['query', 'page'],
      ),
    /out-of-range metric/,
  );
  for (const malformedClicks of ['1', false, [], '']) {
    assert.throws(
      () =>
        normalizeResponseRows(
          {
            rows: [
              {
                keys: ['query', 'https://example.test/'],
                clicks: malformedClicks,
                impressions: 10,
                ctr: 0.1,
                position: 1,
              },
            ],
          },
          ['query', 'page'],
        ),
      /invalid clicks metric/,
    );
  }
});

test('enforces every opportunity threshold boundary', () => {
  const striking = selectOpportunities([
    row({ query: 'position four', position: 4, impressions: 50, ctr: 0.1 }),
    row({ query: 'position twenty', position: 20, impressions: 50, ctr: 0.1 }),
    row({ query: 'position too low', position: 3.999, impressions: 50, ctr: 0.1 }),
    row({ query: 'position too high', position: 20.001, impressions: 50, ctr: 0.1 }),
    row({ query: 'not enough impressions', position: 10, impressions: 49, ctr: 0.1 }),
  ], []);
  assert.deepEqual(
    striking.map((item) => item.query),
    ['position four', 'position twenty'],
  );

  const lowCtr = selectOpportunities([
    row({ query: 'low ctr one', position: 1, impressions: 50, ctr: 0.019999 }),
    row({ query: 'low ctr ten', position: 10, impressions: 50, ctr: 0.019999 }),
    row({ query: 'exact ctr cutoff', position: 3, impressions: 50, ctr: 0.02 }),
    row({ query: 'outside ctr position', position: 20.001, impressions: 50, ctr: 0.01 }),
  ], []);
  assert.deepEqual(
    lowCtr.map((item) => item.query),
    ['low ctr one', 'low ctr ten'],
  );

  const decline = selectOpportunities(
    [
      row({ query: 'exact decline', clicks: 4, impressions: 60, position: 2 }),
      row({ query: 'not enough decline', clicks: 4.01, impressions: 60, position: 2 }),
      row({
        query: 'low baseline clicks',
        clicks: 0,
        impressions: 0,
        ctr: null,
        position: null,
      }),
      row({
        query: 'low baseline impressions',
        clicks: 0,
        impressions: 0,
        ctr: null,
        position: null,
      }),
    ],
    [
      row({ query: 'exact decline', clicks: 5, impressions: 50, position: 2 }),
      row({ query: 'not enough decline', clicks: 5, impressions: 50, position: 2 }),
      row({ query: 'low baseline clicks', clicks: 4, impressions: 50, position: 2 }),
      row({ query: 'low baseline impressions', clicks: 5, impressions: 49, position: 2 }),
      row({ query: 'prior only decline', clicks: 6, impressions: 60, position: 7 }),
    ],
  );
  assert.deepEqual(
    decline.map((item) => item.query),
    ['prior only decline', 'exact decline'],
  );
});

test('joins on exact query and page, deduplicates overlapping groups, and is stable', () => {
  const current = [
    row({
      query: 'same query',
      page: 'https://example.test/a',
      clicks: 1,
      impressions: 200,
      ctr: 0.005,
      position: 5,
    }),
    row({
      query: 'same query',
      page: 'https://example.test/b',
      clicks: 2,
      impressions: 100,
      ctr: 0.02,
      position: 8,
    }),
  ];
  const prior = [
    row({
      query: 'same query',
      page: 'https://example.test/a',
      clicks: 10,
      impressions: 200,
      ctr: 0.05,
      position: 5,
    }),
  ];
  const forward = selectOpportunities(current, prior);
  const reversed = selectOpportunities([...current].reverse(), [...prior].reverse());
  assert.deepEqual(forward, reversed);
  assert.equal(forward.length, 2);
  assert.equal(forward[0].group, 'click-decline');
  assert.deepEqual(forward[0].matchedGroups, [
    'click-decline',
    'low-ctr',
    'striking-distance',
  ]);
  assert.match(forward[0].recommendation, /Investigate the traffic decline/);
  assert.equal(new Set(forward.map((item) => item.page)).size, 2);
});

test('sorts before truncating the ranked output to ten rows', () => {
  const current = Array.from({ length: 12 }, (_, index) =>
    row({
      query: `query-${String(index).padStart(2, '0')}`,
      impressions: 50 + index,
      position: 12,
      ctr: 0.1,
    }),
  );
  const opportunities = selectOpportunities(current, []);
  assert.equal(opportunities.length, 10);
  assert.equal(opportunities[0].query, 'query-11');
  assert.equal(opportunities.at(-1).query, 'query-02');
  assert.deepEqual(
    opportunities.map((item) => item.rank),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
});

test('builds matching JSON and Markdown report structures from sanitized fixtures', async () => {
  const currentRows = normalizeResponseRows(
    await fixture('current-singapore'),
    ['query', 'page'],
  );
  const priorRows = normalizeResponseRows(
    await fixture('prior-singapore'),
    ['query', 'page'],
  );
  const sessionDimensions = ['landingPagePlusQueryString'];
  const sessionMetrics = ['sessions', 'engagedSessions'];
  const leadDimensions = [
    'landingPagePlusQueryString',
    'customEvent:lead_type',
  ];
  const contactDimensions = [
    'landingPagePlusQueryString',
    'customEvent:contact_method',
  ];
  const report = buildReport({
    siteUrl: 'sc-domain:example.test',
    ga4PropertyId: '123456789',
    windows: calculateDateWindows(new Date('2026-07-27T02:15:00.000Z')),
    generatedAt: '2026-07-27T02:16:00.000Z',
    currentRows,
    priorRows,
    currentSingaporeTotalRows: normalizeResponseRows(
      await fixture('current-singapore-total'),
      [],
    ),
    priorSingaporeTotalRows: normalizeResponseRows(
      await fixture('prior-singapore-total'),
      [],
    ),
    currentGlobalTotalRows: normalizeResponseRows(
      await fixture('current-global-total'),
      [],
    ),
    priorGlobalTotalRows: normalizeResponseRows(
      await fixture('prior-global-total'),
      [],
    ),
    currentGa4SessionRows: ga4Rows(
      await ga4Fixture('current-sessions'),
      sessionDimensions,
      sessionMetrics,
    ),
    priorGa4SessionRows: ga4Rows(
      await ga4Fixture('prior-sessions'),
      sessionDimensions,
      sessionMetrics,
    ),
    currentGa4LeadRows: ga4Rows(
      await ga4Fixture('current-leads'),
      leadDimensions,
      ['eventCount'],
    ),
    priorGa4LeadRows: ga4Rows(
      await ga4Fixture('prior-leads'),
      leadDimensions,
      ['eventCount'],
    ),
    currentGa4ContactRows: ga4Rows(
      await ga4Fixture('current-contacts'),
      contactDimensions,
      ['eventCount'],
    ),
    priorGa4ContactRows: ga4Rows(
      await ga4Fixture('prior-contacts'),
      contactDimensions,
      ['eventCount'],
    ),
  });

  assert.equal(report.schemaVersion, 2);
  assert.equal(report.status, 'opportunities');
  assert.equal(report.ga4.hostName, 'joetay.com');
  assert.equal(report.totals.singapore.current.clicks, 50);
  assert.equal(report.totals.global.prior.impressions, 1800);
  assert.equal(report.totals.singaporeBranded.current.clicks, 30);
  assert.equal(
    report.opportunities.some((item) => isBrandedQuery(item.query)),
    false,
  );
  assert.deepEqual(
    report.opportunities.map((item) => item.query),
    [
      'vanished seller query',
      'hdb resale timeline',
      'sell hdb singapore',
      'hdb agent fees',
      'hdb valuation guide',
    ],
  );
  assert.deepEqual(
    report.opportunities.map((item) => item.group),
    [
      'click-decline',
      'click-decline',
      'click-decline',
      'low-ctr',
      'striking-distance',
    ],
  );

  const sellOpportunities = report.opportunities.filter(
    (item) => item.ga4.normalizedPath === '/sell',
  );
  assert.equal(sellOpportunities.length, 2);
  assert.deepEqual(
    sellOpportunities[0].ga4,
    sellOpportunities[1].ga4,
  );
  const sellGa4 = sellOpportunities[0].ga4;
  assert.equal(sellGa4.current.organicSessions, 120);
  assert.equal(sellGa4.prior.organicSessions, 100);
  assert.equal(sellGa4.current.engagedSessions, 72);
  assert.equal(sellGa4.current.sellerOwnerLeads, 5);
  assert.equal(sellGa4.current.generalConsultations, 3);
  assert.equal(sellGa4.current.newLaunchLeads, 2);
  assert.equal(sellGa4.current.nurtureSignups, 1);
  assert.equal(sellGa4.current.unclassifiedLeads, 4);
  assert.equal(sellGa4.current.totalLeads, 15);
  assert.deepEqual(sellGa4.current.contactIntent, {
    phoneCall: 2,
    whatsapp: 3,
    calendly: 1,
    email: 1,
    unclassified: 2,
    total: 9,
  });
  assert.equal(sellGa4.delta.organicSessions, 20);
  assert.equal(sellGa4.delta.engagedSessions, 22);
  assert.equal(sellGa4.delta.sellerOwnerLeads, 4);
  assert.equal(sellGa4.delta.contactIntent.total, 7);
  assert.equal(sellGa4.current.rates.engagementRate, 0.6);
  assert.equal(sellGa4.current.rates.totalLeadRate, 0.125);
  assert.equal(sellGa4.current.rates.contactIntentRate, 0.075);
  assert.deepEqual(sellGa4.current.unclassifiedLeadTypes, [
    { value: '(not set)', count: 1 },
    { value: 'mystery_type', count: 3 },
  ]);
  assert.deepEqual(sellGa4.current.unclassifiedContactMethods, [
    { value: 'fax', count: 2 },
  ]);

  const valuation = report.opportunities.find(
    (item) => item.query === 'hdb valuation guide',
  );
  assert.equal(valuation.ga4.current.sellerOwnerLeads, 20);
  assert.equal(valuation.ga4.prior.organicSessions, 0);
  assert.equal(valuation.ga4.prior.rates.sellerOwnerLeadRate, null);
  assert.equal(valuation.ga4.delta.rates.sellerOwnerLeadRate, null);
  assert.deepEqual(
    report.ga4.unmatchedSearchConsolePages.map((item) => ({
      path: item.normalizedPath,
      periods: item.missingPeriods,
    })),
    [{ path: '/insights/timeline', periods: ['current'] }],
  );
  assert.deepEqual(
    report.ga4.unmatchedLandingPages.map(
      (item) => item.normalizedPath,
    ),
    ['/ga4-only', '/new-launches/example', '/other'],
  );
  assert.equal(report.ga4.invalidLandingPageRows.current.length, 3);
  assert.equal(report.ga4.invalidLandingPageRows.prior.length, 1);
  assert.deepEqual(
    report.ga4.invalidLandingPageRows.current.map(
      (item) => item.landingPage,
    ),
    ['(other)', '(not set)', '(not set)'],
  );
  assert.equal(
    report.ga4.invalidLandingPageRows.prior[0].landingPage,
    '(data not available)',
  );

  const markdown = renderMarkdown(report);
  const json = serializeReport(report);
  assert.match(markdown, /# Weekly Search Console organic-growth report/);
  assert.match(markdown, /2026-06-27/);
  assert.match(markdown, /Singapore branded queries/);
  assert.match(markdown, /Global property total/);
  assert.match(markdown, /vanished seller query/);
  assert.match(markdown, /GA4 organic lead quality/);
  assert.match(markdown, /Seller\/owner lead events/);
  assert.match(markdown, /mystery_type/);
  assert.match(markdown, /\/ga4-only/);
  assert.doesNotMatch(markdown, /Infinity|NaN/);
  assert.doesNotMatch(json, /Infinity|NaN/);
  assert.deepEqual(JSON.parse(json), report);
  const opportunityLines = markdown
    .split('\n')
    .filter((line) => /^\| \d+ \|/.test(line));
  assert.equal(opportunityLines.length, report.opportunities.length);
  for (const [index, opportunity] of report.opportunities.entries()) {
    const cells = opportunityLines[index]
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    assert.equal(cells[0], String(opportunity.rank));
    assert.equal(cells[1], opportunity.group);
    assert.equal(cells[2], opportunity.query);
    assert.equal(cells[3], opportunity.page);
    assert.equal(cells[4], String(opportunity.current.clicks));
    assert.equal(cells[5], String(opportunity.prior.clicks));
    assert.equal(cells[6], String(opportunity.current.impressions));
    assert.equal(cells[10], opportunity.recommendation);
  }

  const outputDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'search-growth-report-test-'),
  );
  const paths = await writeReportArtifacts(report, outputDirectory);
  assert.equal(await readFile(paths.markdownPath, 'utf8'), markdown);
  assert.equal(await readFile(paths.jsonPath, 'utf8'), json);
});

test('main produces aggregate Search Console and GA4 artifacts from injected fixtures', async () => {
  const outputDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'search-growth-main-success-'),
  );
  const fixtures = {
    metadata: await ga4Fixture('metadata'),
    currentSearch: await fixture('current-singapore'),
    priorSearch: await fixture('prior-singapore'),
    currentSingaporeTotal: await fixture('current-singapore-total'),
    priorSingaporeTotal: await fixture('prior-singapore-total'),
    currentGlobalTotal: await fixture('current-global-total'),
    priorGlobalTotal: await fixture('prior-global-total'),
    currentSessions: await ga4Fixture('current-sessions'),
    priorSessions: await ga4Fixture('prior-sessions'),
    currentLeads: await ga4Fixture('current-leads'),
    priorLeads: await ga4Fixture('prior-leads'),
    currentContacts: await ga4Fixture('current-contacts'),
    priorContacts: await ga4Fixture('prior-contacts'),
  };
  const requestedUrls = [];
  const fetchImpl = async (url, options = {}) => {
    requestedUrls.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      return response({
        payload: { access_token: 'fixture-access-token' },
      });
    }
    if (url.endsWith('/properties/123456789/metadata')) {
      return response({ payload: fixtures.metadata });
    }
    if (url.includes('webmasters/v3/sites')) {
      const request = JSON.parse(options.body);
      const isCurrent = request.startDate === '2026-06-27';
      if (request.dimensions) {
        return response({
          payload:
            request.startRow > 0 ?
              {}
            : isCurrent ?
              fixtures.currentSearch
            : fixtures.priorSearch,
        });
      }
      const isSingapore = Boolean(request.dimensionFilterGroups);
      return response({
        payload:
          isSingapore ?
            isCurrent ?
              fixtures.currentSingaporeTotal
            : fixtures.priorSingaporeTotal
          : isCurrent ?
            fixtures.currentGlobalTotal
          : fixtures.priorGlobalTotal,
      });
    }
    if (url.includes('analyticsdata.googleapis.com')) {
      const request = JSON.parse(options.body);
      const isCurrent =
        request.dateRanges[0].startDate === '2026-06-27';
      const dimensions = request.dimensions.map(({ name }) => name);
      if (dimensions.includes('customEvent:lead_type')) {
        return response({
          payload:
            isCurrent ? fixtures.currentLeads : fixtures.priorLeads,
        });
      }
      if (dimensions.includes('customEvent:contact_method')) {
        return response({
          payload:
            isCurrent ?
              fixtures.currentContacts
            : fixtures.priorContacts,
        });
      }
      return response({
        payload:
          isCurrent ?
            fixtures.currentSessions
          : fixtures.priorSessions,
      });
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  };

  const { report, paths } = await main({
    env: {
      GSC_SERVICE_ACCOUNT_JSON: fixtureServiceAccountJson(),
      GSC_SITE_URL: 'sc-domain:example.test',
      GA4_PROPERTY_ID: '123456789',
    },
    argv: ['--output-dir', outputDirectory],
    now: new Date('2026-07-27T02:15:00.000Z'),
    fetchImpl,
  });

  assert.equal(report.generatedAt, '2026-07-27T02:15:00.000Z');
  assert.equal(report.ga4.propertyId, '123456789');
  assert.equal(report.opportunities[0].ga4.current.organicSessions, 120);
  assert.ok(
    requestedUrls.some((url) => url.includes('webmasters/v3/sites')),
  );
  assert.equal(
    requestedUrls.filter((url) => url.includes(':runReport')).length,
    6,
  );
  const markdown = await readFile(paths.markdownPath, 'utf8');
  const json = await readFile(paths.jsonPath, 'utf8');
  assert.deepEqual(JSON.parse(json), report);
  assert.match(markdown, /GA4 organic lead quality/);
  for (const sensitiveValue of [
    'fixture-access-token',
    'fixture@example.test',
    'private_key',
    'BEGIN PRIVATE KEY',
  ]) {
    assert.doesNotMatch(markdown, new RegExp(sensitiveValue));
    assert.doesNotMatch(json, new RegExp(sensitiveValue));
  }
});

test('escapes Markdown cells and emits a successful explicit empty state', () => {
  const report = buildReport({
    siteUrl: 'sc-domain:example.test',
    ga4PropertyId: '123456789',
    windows: calculateDateWindows(new Date('2026-07-27T02:15:00.000Z')),
    generatedAt: '2026-07-27T02:16:00.000Z',
    currentRows: [],
    priorRows: [],
    currentSingaporeTotalRows: [],
    priorSingaporeTotalRows: [],
    currentGlobalTotalRows: [],
    priorGlobalTotalRows: [],
  });
  assert.equal(report.status, 'empty');
  assert.deepEqual(report.opportunities, []);
  assert.match(renderMarkdown(report), /No qualifying non-branded Singapore/);

  const populated = buildReport({
    siteUrl: 'sc-domain:example.test',
    ga4PropertyId: '123456789',
    windows: report.windows,
    generatedAt: report.generatedAt,
    currentRows: [
      row({
        query: 'query \\| with\nline',
        page: 'https://example.test/a|b',
        clicks: 1,
        impressions: 100,
        ctr: 0.01,
        position: 5,
      }),
    ],
    priorRows: [],
    currentSingaporeTotalRows: [],
    priorSingaporeTotalRows: [],
    currentGlobalTotalRows: [],
    priorGlobalTotalRows: [],
  });
  const markdown = renderMarkdown(populated);
  assert.match(markdown, /query &#92;&#124; with line/);
  assert.match(markdown, /a&#124;b/);
});

test('full visibility watchlist retains sparse rows and flags the precise top-20 watch range', () => {
  const rows = [20, 20.1, 24.1, 50, 50.1, null].map((position, index) => row({ query: `query ${index}`, position, impressions: 9, clicks: 0 }));
  const watchlist = selectVisibilityWatchlist([
    ...rows,
    row({ query: 'joe tay', impressions: 90 }),
    row({ query: 'zero impressions', impressions: 0 }),
  ]);
  assert.equal(watchlist.length, 6);
  assert.deepEqual(watchlist.filter(item => item.nearTop20).map(item => item.position), [20.1, 24.1, 50]);
  assert.ok(watchlist.every(item => item.confidence === 'low-volume'));
  assert.equal(selectVisibilityWatchlist(Array.from({ length: 40 }, (_, i) => row({ query: `q${i}` }))).length, 40);
  assert.equal(selectVisibilityWatchlist([row({ impressions: 50 })])[0].confidence, '50+ impressions');
});

test('organic landing pages remain visible when no query meets the opportunity threshold', async () => {
  const report = buildReport({
    siteUrl: 'sc-domain:example.test', ga4PropertyId: '123456789',
    windows: calculateDateWindows(new Date('2026-08-26T02:00:00Z')),
    generatedAt: '2026-08-26T02:00:00Z',
    currentRows: [row({ query: 'loan | comparison', impressions: 9, clicks: 0, position: 24.1 })],
    priorRows: [], currentSingaporeTotalRows: [], priorSingaporeTotalRows: [],
    currentGlobalTotalRows: [], priorGlobalTotalRows: [],
    currentGa4SessionRows: ga4Rows(await ga4Fixture('current-sessions'), ['landingPagePlusQueryString'], ['sessions', 'engagedSessions']),
    currentGa4LeadRows: ga4Rows(await ga4Fixture('current-leads'), ['landingPagePlusQueryString', 'customEvent:lead_type'], ['eventCount']),
    currentGa4ContactRows: ga4Rows(await ga4Fixture('current-contacts'), ['landingPagePlusQueryString', 'customEvent:contact_method'], ['eventCount']),
  });
  assert.equal(report.status, 'empty');
  assert.equal(report.opportunities.length, 0);
  assert.ok(report.ga4.landingPages.length > 0);
  assert.ok(report.ga4.landingPages.some(item => item.current.organicSessions > 0));
  assert.ok(report.ga4.landingPages.some(item => item.current.contactIntent.total > 0));
  const markdown = renderMarkdown(report);
  assert.match(markdown, /All organic landing pages, independent of ranking thresholds/);
  assert.match(markdown, /loan &#124; comparison/);
  assert.match(markdown, /low-volume/);
  assert.match(markdown, /not restricted to Singapore/);
  assert.match(markdown, /No ranked Search Console opportunity rows were available to enrich/);
  assert.doesNotMatch(markdown, /No reportable organic landing-page rows/);
});

test('paginates query/page requests until an empty page and does not paginate totals', async () => {
  const starts = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    starts.push(request.startRow);
    return response({
      payload:
        request.startRow === 0 ?
          {
            rows: [
              { keys: ['a', 'https://example.test/a'], clicks: 1, impressions: 10, ctr: 0.1, position: 1 },
            ],
          }
        : {},
    });
  };
  const rows = await querySearchAnalytics({
    accessToken: 'token',
    siteUrl: 'sc-domain:example.test',
    window: { startDate: '2026-06-27', endDate: '2026-07-24' },
    rowLimit: 2,
    fetchImpl,
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(starts, [0, 2]);

  starts.length = 0;
  await querySearchAnalytics({
    accessToken: 'token',
    siteUrl: 'sc-domain:example.test',
    window: { startDate: '2026-06-27', endDate: '2026-07-24' },
    dimensions: [],
    country: null,
    rowLimit: 1,
    fetchImpl: async (_url, options) => {
      starts.push(JSON.parse(options.body).startRow);
      return response({
        payload: {
          rows: [{ clicks: 1, impressions: 10, ctr: 0.1, position: 1 }],
        },
      });
    },
  });
  assert.deepEqual(starts, [0]);
});

test('creates a standards-based service-account JWT without exposing key data', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
  });
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  let tokenRequest;
  const accessToken = await createServiceAccountAccessToken(
    {
      clientEmail: 'fixture@example.test',
      privateKey: privateKeyPem,
      privateKeyId: 'fixture-key-id',
      tokenUri: 'https://oauth2.googleapis.com/token',
    },
    {
      now: new Date('2026-07-27T02:15:00.000Z'),
      fetchImpl: async (url, options) => {
        tokenRequest = { url, options };
        return response({ payload: { access_token: 'fixture-access-token' } });
      },
    },
  );
  assert.equal(accessToken, 'fixture-access-token');
  const form = new URLSearchParams(tokenRequest.options.body);
  assert.equal(
    form.get('grant_type'),
    'urn:ietf:params:oauth:grant-type:jwt-bearer',
  );
  const [encodedHeader, encodedClaims] = form.get('assertion').split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString());
  assert.deepEqual(header, {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'fixture-key-id',
  });
  assert.equal(claims.iss, 'fixture@example.test');
  assert.equal(
    claims.scope,
    'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly',
  );
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(form.get('assertion').includes(privateKeyPem), false);
});

test('configuration and API failures are actionable and secret-safe', async () => {
  const secretMarker = 'DO-NOT-PRINT-THIS-PRIVATE-KEY';
  for (const rawValue of [
    undefined,
    `{not-json-${secretMarker}`,
    JSON.stringify({ type: 'service_account', private_key: secretMarker }),
  ]) {
    assert.throws(
      () => parseServiceAccount(rawValue),
      (error) =>
        !publicErrorMessage(error).includes(secretMarker) &&
        /GSC_SERVICE_ACCOUNT_JSON/.test(publicErrorMessage(error)),
    );
  }

  for (const status of [403, 404, 500]) {
    await assert.rejects(
      querySearchAnalytics({
        accessToken: secretMarker,
        siteUrl: 'sc-domain:example.test',
        window: { startDate: '2026-06-27', endDate: '2026-07-24' },
        fetchImpl: async () =>
          response({
            ok: false,
            status,
            payload: { error: { message: secretMarker } },
          }),
        retryBaseDelayMs: 0,
      }),
      (error) => {
        const message = publicErrorMessage(error);
        return (
          !message.includes(secretMarker) &&
          message.includes(`HTTP ${status}`)
        );
      },
    );
    await assert.rejects(
      queryGa4Report({
        accessToken: secretMarker,
        propertyId: '123456789',
        window: {
          startDate: '2026-06-27',
          endDate: '2026-07-24',
        },
        reportType: 'sessions',
        fetchImpl: async () =>
          response({
            ok: false,
            status,
            payload: { error: { message: secretMarker } },
          }),
        retryBaseDelayMs: 0,
      }),
      (error) => {
        const message = publicErrorMessage(error);
        return (
          !message.includes(secretMarker) &&
          message.includes(`HTTP ${status}`)
        );
      },
    );
  }
});

test('main fails the GA4 metadata gate before report queries or artifacts', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'search-growth-metadata-failure-'),
  );
  const outputDirectory = path.join(temporaryDirectory, 'report');
  const metadata = await ga4Fixture('metadata');
  const requestedUrls = [];

  await assert.rejects(
    main({
      env: {
        GSC_SERVICE_ACCOUNT_JSON: fixtureServiceAccountJson(),
        GSC_SITE_URL: 'sc-domain:example.test',
        GA4_PROPERTY_ID: '123456789',
      },
      argv: ['--output-dir', outputDirectory],
      now: new Date('2026-07-27T02:15:00.000Z'),
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        if (url === 'https://oauth2.googleapis.com/token') {
          return response({
            payload: { access_token: 'fixture-access-token' },
          });
        }
        if (url.endsWith('/properties/123456789/metadata')) {
          return response({
            payload: {
              ...metadata,
              dimensions: metadata.dimensions.filter(
                (dimension) =>
                  dimension.apiName !==
                  'customEvent:contact_method',
              ),
            },
          });
        }
        throw new Error(`Unexpected request after metadata: ${url}`);
      },
    }),
    /contact_method/,
  );
  assert.equal(
    requestedUrls.some(
      (url) =>
        url.includes(':runReport') ||
        url.includes('webmasters/v3/sites'),
    ),
    false,
  );
  await assert.rejects(
    readFile(path.join(outputDirectory, 'search-growth-report.md'), 'utf8'),
    { code: 'ENOENT' },
  );
  await assert.rejects(
    readFile(path.join(outputDirectory, 'search-growth-report.json'), 'utf8'),
    { code: 'ENOENT' },
  );
});

test('malformed GA4 data fails main without publishing final artifacts', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'search-growth-ga4-failure-'),
  );
  const outputDirectory = path.join(temporaryDirectory, 'report');
  const metadata = await ga4Fixture('metadata');

  await assert.rejects(
    main({
      env: {
        GSC_SERVICE_ACCOUNT_JSON: fixtureServiceAccountJson(),
        GSC_SITE_URL: 'sc-domain:example.test',
        GA4_PROPERTY_ID: '123456789',
      },
      argv: ['--output-dir', outputDirectory],
      now: new Date('2026-07-27T02:15:00.000Z'),
      fetchImpl: async (url, options = {}) => {
        if (url === 'https://oauth2.googleapis.com/token') {
          return response({
            payload: { access_token: 'fixture-access-token' },
          });
        }
        if (url.endsWith('/properties/123456789/metadata')) {
          return response({ payload: metadata });
        }
        if (url.includes('webmasters/v3/sites')) {
          return response({ payload: {} });
        }
        if (url.includes('analyticsdata.googleapis.com')) {
          const request = JSON.parse(options.body);
          const sessionReport = request.metrics.some(
            ({ name }) => name === 'sessions',
          );
          return response({
            payload: {
              dimensionHeaders: request.dimensions,
              metricHeaders: request.metrics.map((metric) => ({
                ...metric,
                type: 'TYPE_INTEGER',
              })),
              ...(sessionReport ?
                {
                  rows: [
                    {
                      dimensionValues: [{ value: '/' }],
                      metricValues: [
                        { value: 'NaN' },
                        { value: '0' },
                      ],
                    },
                  ],
                  rowCount: 1,
                }
              : { rowCount: 0 }),
            },
          });
        }
        throw new Error(`Unexpected fixture URL: ${url}`);
      },
    }),
    /invalid sessions metric/,
  );
  await assert.rejects(
    readFile(path.join(outputDirectory, 'search-growth-report.md'), 'utf8'),
    { code: 'ENOENT' },
  );
  await assert.rejects(
    readFile(path.join(outputDirectory, 'search-growth-report.json'), 'utf8'),
    { code: 'ENOENT' },
  );
});

test('malformed API data fails main without publishing final artifacts', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
  });
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'search-growth-main-failure-'),
  );
  const outputDirectory = path.join(temporaryDirectory, 'report');
  const credentials = JSON.stringify({
    type: 'service_account',
    client_email: 'fixture@example.test',
    private_key: privateKeyPem,
    token_uri: 'https://malicious.example.test/token',
  });
  const metadata = await ga4Fixture('metadata');

  await assert.rejects(
    main({
      env: {
        GSC_SERVICE_ACCOUNT_JSON: credentials,
        GSC_SITE_URL: 'sc-domain:example.test',
        GA4_PROPERTY_ID: '123456789',
      },
      argv: ['--output-dir', outputDirectory],
      now: new Date('2026-07-27T02:15:00.000Z'),
      fetchImpl: async (url, options) => {
        if (url === 'https://oauth2.googleapis.com/token') {
          return response({
            payload: { access_token: 'fixture-access-token' },
          });
        }
        if (url.endsWith('/properties/123456789/metadata')) {
          return response({ payload: metadata });
        }
        if (url.includes('analyticsdata.googleapis.com')) {
          const ga4Request = JSON.parse(options.body);
          return response({
            payload: {
              dimensionHeaders: ga4Request.dimensions,
              metricHeaders: ga4Request.metrics.map((metric) => ({
                ...metric,
                type: 'TYPE_INTEGER',
              })),
              rowCount: 0,
            },
          });
        }
        const request = JSON.parse(options.body);
        if (!request.dimensions) {
          return response({
            payload: {
              rows: [
                {
                  clicks: 1,
                  impressions: 10,
                  ctr: 0.1,
                  position: 1,
                },
              ],
            },
          });
        }
        return response({
          payload: {
            rows: [
              {
                keys: ['query', 'https://example.test/'],
                clicks: 1,
                impressions: 10,
                ctr: 0.1,
              },
            ],
          },
        });
      },
    }),
    /required position metric/,
  );
  await assert.rejects(
    readFile(path.join(outputDirectory, 'search-growth-report.md'), 'utf8'),
    { code: 'ENOENT' },
  );
  await assert.rejects(
    readFile(path.join(outputDirectory, 'search-growth-report.json'), 'utf8'),
    { code: 'ENOENT' },
  );
});

test('workflow preserves the schedule, credentials, summary, and artifact contract', async () => {
  const workflow = await readFile(
    path.join(TEST_DIRECTORY, '../.github/workflows/search-growth-report.yml'),
    'utf8',
  );
  assert.match(workflow, /cron:\s*["']15 10 \* \* 1["']/);
  assert.match(workflow, /timezone:\s*["']Asia\/Singapore["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /secrets\.GSC_SERVICE_ACCOUNT_JSON/);
  assert.match(workflow, /vars\.GSC_SITE_URL/);
  assert.match(workflow, /vars\.GA4_PROPERTY_ID/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /search-growth-report\.md/);
  assert.match(workflow, /search-growth-report\.json/);
  assert.match(workflow, /retention-days:\s*90/);

  const readme = await readFile(
    path.join(TEST_DIRECTORY, '../README.md'),
    'utf8',
  );
  assert.match(readme, /Google Analytics Data API/);
  assert.match(readme, /Viewer/);
  assert.match(readme, /scope \*\*Event\*\*.*`lead_type`/);
  assert.match(readme, /scope \*\*Event\*\*.*`contact_method`/);
  assert.match(readme, /24–48 hours/);
  assert.match(readme, /GA4_PROPERTY_ID/);
  assert.match(readme, /hostName.*joetay\.com/);
  assert.match(readme, /Run workflow/);
});
