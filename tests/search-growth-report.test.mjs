import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildReport,
  buildSearchAnalyticsRequest,
  calculateDateWindows,
  createServiceAccountAccessToken,
  isBrandedQuery,
  main,
  normalizeResponseRows,
  parseServiceAccount,
  publicErrorMessage,
  querySearchAnalytics,
  renderMarkdown,
  selectOpportunities,
  serializeReport,
  writeReportArtifacts,
} from '../scripts/search-growth-report.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIRECTORY = path.join(TEST_DIRECTORY, 'fixtures/search-console');

async function fixture(name) {
  return JSON.parse(
    await readFile(path.join(FIXTURE_DIRECTORY, `${name}.json`), 'utf8'),
  );
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
  const report = buildReport({
    siteUrl: 'sc-domain:example.test',
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
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, 'opportunities');
  assert.equal(report.totals.singapore.current.clicks, 50);
  assert.equal(report.totals.global.prior.impressions, 1800);
  assert.equal(report.totals.singaporeBranded.current.clicks, 30);
  assert.equal(
    report.opportunities.some((item) => isBrandedQuery(item.query)),
    false,
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

  const markdown = renderMarkdown(report);
  const json = serializeReport(report);
  assert.match(markdown, /# Weekly Search Console organic-growth report/);
  assert.match(markdown, /2026-06-27/);
  assert.match(markdown, /Singapore branded queries/);
  assert.match(markdown, /Global property total/);
  assert.match(markdown, /vanished seller query/);
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

test('escapes Markdown cells and emits a successful explicit empty state', () => {
  const report = buildReport({
    siteUrl: 'sc-domain:example.test',
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

  const populated = {
    ...report,
    status: 'opportunities',
    emptyStateMessage: null,
    opportunities: [
      {
        rank: 1,
        group: 'striking-distance',
        query: 'query \\| with\nline',
        page: 'https://example.test/a|b',
        current: row(),
        prior: row({ clicks: 0 }),
        clickChangePct: null,
        recommendation: 'Strengthen content.',
      },
    ],
  };
  const markdown = renderMarkdown(populated);
  assert.match(markdown, /query &#92;&#124; with line/);
  assert.match(markdown, /a&#124;b/);
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
    'https://www.googleapis.com/auth/webmasters.readonly',
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
  }
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

  await assert.rejects(
    main({
      env: {
        GSC_SERVICE_ACCOUNT_JSON: credentials,
        GSC_SITE_URL: 'sc-domain:example.test',
      },
      argv: ['--output-dir', outputDirectory],
      now: new Date('2026-07-27T02:15:00.000Z'),
      fetchImpl: async (url, options) => {
        if (url === 'https://oauth2.googleapis.com/token') {
          return response({
            payload: { access_token: 'fixture-access-token' },
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
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /search-growth-report\.md/);
  assert.match(workflow, /search-growth-report\.json/);
  assert.match(workflow, /retention-days:\s*90/);
});
