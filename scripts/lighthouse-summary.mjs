import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const cell = value => String(value).replace(/[\r\n|<>]/g, ' ');

export function summariseReports(reports, url, config) {
  const expected = config.ci.collect.numberOfRuns;
  if (reports.length !== expected) throw new Error(`Expected ${expected} reports, found ${reports.length}`);
  const rows = reports.sort((a, b) => String(a.fetchTime).localeCompare(String(b.fetchTime))).map(report => {
    if (report.requestedUrl !== url || (report.finalDisplayedUrl || report.finalUrl) !== url) {
      throw new Error('Report URL does not match the audited production URL');
    }
    if (report.runtimeError) throw new Error(`Lighthouse runtime error: ${report.runtimeError.code}`);
    const row = {
      time: report.fetchTime,
      performance: report.categories?.performance?.score,
      lcp: report.audits?.['largest-contentful-paint']?.numericValue,
      tbt: report.audits?.['total-blocking-time']?.numericValue,
      cls: report.audits?.['cumulative-layout-shift']?.numericValue,
      benchmark: report.environment?.benchmarkIndex,
      version: report.lighthouseVersion,
      browser: report.environment?.hostUserAgent,
    };
    for (const key of ['performance', 'lcp', 'tbt', 'cls', 'benchmark']) {
      if (!Number.isFinite(row[key])) throw new Error(`Missing or invalid ${key} in ${row.time}`);
    }
    if (!Number.isFinite(Date.parse(row.time)) || !row.version || !row.browser || row.benchmark <= 0) {
      throw new Error('Missing or invalid audit environment metadata');
    }
    return row;
  });
  if (new Set(rows.map(row => row.time)).size !== expected) throw new Error('Duplicate audit runs');
  const tbtBudget = config.ci.assert.assertions['total-blocking-time'][1].maxNumericValue;
  const worstTbt = Math.max(...rows.map(row => row.tbt));
  const warnings = [];
  if (worstTbt > tbtBudget) warnings.push(`At least one run exceeded the ${tbtBudget} ms TBT budget (worst ${Math.round(worstTbt)} ms). Inspect its trace; a passing median does not erase this run.`);
  const benchmarks = rows.map(row => row.benchmark).filter(value => value > 0);
  const spread = Math.max(...benchmarks) / Math.min(...benchmarks);
  if (spread >= 1.5) warnings.push(`Runner CPU benchmark varied ${spread.toFixed(2)}x. This is a variability signal, not proof of a site regression.`);
  const lines = [
    `### Lighthouse: ${cell(url)}`,
    '',
    '| Run (UTC) | Performance | LCP (ms) | TBT (ms) | CLS | CPU benchmark |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(row => `| ${cell(row.time)} | ${Math.round(row.performance * 100)} | ${Math.round(row.lcp)} | ${Math.round(row.tbt)} | ${row.cls.toFixed(3)} | ${row.benchmark.toFixed(1)} |`),
    `| Median | ${Math.round(median(rows.map(row => row.performance)) * 100)} | ${Math.round(median(rows.map(row => row.lcp)))} | ${Math.round(median(rows.map(row => row.tbt)))} | ${median(rows.map(row => row.cls)).toFixed(3)} | ${median(rows.map(row => row.benchmark)).toFixed(1)} |`,
    '',
    ...warnings.map(warning => `**Warning:** ${warning}`),
    '',
    ...[...new Set(rows.map(row => `Lighthouse ${row.version}; ${row.browser}`))].map(value => cell(value)),
    '',
    'All runs remain in the artifacts, with timestamped Chrome traces and network logs. This audits the live URL at the recorded times; a push-triggered run is not deployment attestation.',
    '',
  ];
  return { markdown: lines.join('\n'), warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, url] = process.argv.slice(2);
    if (!directory || !url) throw new Error('Usage: node scripts/lighthouse-summary.mjs <report-dir> <url>');
    const reports = fs.readdirSync(directory).filter(name => /^lhr-.*\.json$/.test(name))
      .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.github/lighthouse-config.json'), 'utf8'));
    const { markdown, warnings } = summariseReports(reports, url, config);
    fs.writeFileSync(path.join(directory, 'run-summary.md'), markdown);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    process.stdout.write(markdown);
    if (process.env.GITHUB_ACTIONS === 'true') {
      for (const warning of warnings) console.log(`::warning::${warning}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
