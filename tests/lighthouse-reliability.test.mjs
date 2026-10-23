import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { summariseReports } from '../scripts/lighthouse-summary.mjs';
import { checkCalibration, runCalibration, LIGHTHOUSE_VERSION } from '../scripts/check-lighthouse-calibration.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const config = JSON.parse(read('.github/lighthouse-config.json'));
const url = 'https://joetay.com/';
const report = (index, performance, tbt, benchmark) => ({
  requestedUrl: url, finalDisplayedUrl: url,
  fetchTime: `2026-10-23T00:00:0${index}.000Z`,
  lighthouseVersion: LIGHTHOUSE_VERSION,
  environment: { hostUserAgent: 'HeadlessChrome/156.0.0.0', benchmarkIndex: benchmark },
  categories: { performance: { score: performance } },
  audits: {
    'total-blocking-time': { numericValue: tbt },
    'largest-contentful-paint': { numericValue: 2200 },
    'cumulative-layout-shift': { numericValue: 0.004 },
  },
});
const runs = () => [report(1, 0.64, 2200, 1137), report(2, 0.98, 20, 2523.5), report(3, 0.98, 40, 2439)];

test('the report retains the slow run and exposes CPU variability beside the median', () => {
  const { markdown, warnings } = summariseReports(runs(), url, config);
  assert.match(markdown, /64 \| 2200 \| 2200/);
  assert.match(markdown, /Median \| 98 \| 2200 \| 40/);
  assert.match(markdown, /1137\.0/);
  assert.match(markdown, /HeadlessChrome\/156/);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /worst 2200 ms/);
  assert.match(warnings[1], /2\.22x/);
});

test('stable fast runs do not create variability warnings', () => {
  const rows = [report(1, 0.98, 20, 2450), report(2, 0.98, 40, 2500), report(3, 0.98, 30, 2470)];
  assert.deepEqual(summariseReports(rows, url, config).warnings, []);
});

test('missing, duplicated, failed and wrong-URL runs cannot produce a green summary', () => {
  assert.throws(() => summariseReports(runs().slice(0, 2), url, config), /Expected 3/);
  const duplicates = runs(); duplicates[2] = duplicates[1];
  assert.throws(() => summariseReports(duplicates, url, config), /Duplicate/);
  const wrong = runs(); wrong[0].finalDisplayedUrl = 'https://joetay.com/404.html';
  assert.throws(() => summariseReports(wrong, url, config), /URL/);
  const failed = runs(); failed[0].runtimeError = { code: 'NO_FCP' };
  assert.throws(() => summariseReports(failed, url, config), /NO_FCP/);
  const missing = runs(); delete missing[0].audits['total-blocking-time'].numericValue;
  assert.throws(() => summariseReports(missing, url, config), /tbt/);
  const unknownEnvironment = runs(); unknownEnvironment[0].environment.benchmarkIndex = 0;
  assert.throws(() => summariseReports(unknownEnvironment, url, config), /environment/);
});

const calibration = audit => ({
  lighthouseVersion: LIGHTHOUSE_VERSION,
  audits: {
    'network-requests': { details: { items: [{ url: 'http://127.0.0.1/poster.webp', statusCode: 200, resourceSize: 27902 }] } },
    'image-delivery-insight': audit,
  },
});

test('calibration requires a clean responsive image and a real oversized-image failure', () => {
  const good = calibration({ score: null, scoreDisplayMode: 'notApplicable' });
  const bad = calibration({ score: 0, scoreDisplayMode: 'metricSavings', details: { items: [{ url: 'http://127.0.0.1/poster.webp', wastedBytes: 25000 }] } });
  checkCalibration(good, false);
  checkCalibration(bad, true);
  assert.throws(() => checkCalibration(good, true), /oversized image must fail/);
  assert.throws(() => checkCalibration(bad, false), /responsive image must pass/);
  const unloaded = calibration({ score: null, scoreDisplayMode: 'notApplicable' });
  unloaded.audits['network-requests'].details.items = [];
  assert.throws(() => checkCalibration(unloaded, false), /actually load/);
  assert.throws(() => checkCalibration(calibration({ score: null, scoreDisplayMode: 'error' }), false), /must run/);
});

test('mobile density is aligned without dropping image, accessibility or performance budgets', () => {
  const { settings, numberOfRuns } = config.ci.collect;
  assert.equal(numberOfRuns, 3);
  assert.equal(settings.screenEmulation.deviceScaleFactor, 1.75);
  assert.equal(settings.chromeFlags, `--force-device-scale-factor=${settings.screenEmulation.deviceScaleFactor}`);
  assert.equal(settings.saveAssets, true);
  assert.equal(config.ci.assert.preset, 'lighthouse:no-pwa');
  assert.deepEqual(config.ci.assert.assertions['image-delivery-insight'], ['error', { minScore: 0.9 }]);
  assert.deepEqual(config.ci.assert.assertions['categories:performance'], ['warn', { minScore: 0.85, aggregationMethod: 'median' }]);
  assert.deepEqual(config.ci.assert.assertions['total-blocking-time'], ['warn', { maxNumericValue: 600, aggregationMethod: 'median' }]);
  assert.deepEqual(config.ci.assert.assertions['categories:accessibility'], ['error', { minScore: 0.9 }]);
});

test('workflow preserves diagnostics on failure and uses distinct artifacts per page', () => {
  const workflow = read('.github/workflows/lighthouse.yml');
  assert.match(workflow, /uses: treosh\/lighthouse-ci-action@3e7e23fb74242897f95c0ba9cabad3d0227b9b18/);
  assert.match(workflow, /runs: 3/);
  assert.match(workflow, /node scripts\/check-lighthouse-calibration\.mjs/);
  assert.match(workflow, /Report every run[\s\S]*?if: always\(\)[\s\S]*?node scripts\/lighthouse-summary\.mjs/);
  assert.match(workflow, /Preserve reports[\s\S]*?if: always\(\)/);
  assert.match(workflow, /name: lighthouse-\$\{\{ matrix\.page \}\}/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /\.\/\*\.trace\.json/);
  assert.match(workflow, /\.\/\*\.devtoolslog\.json/);
});


test('calibration completes setup before launching independently bounded offline audits', async t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-calibration-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const calls = [];
  let setupStarted;
  const started = new Promise(resolve => { setupStarted = resolve; });
  let finishSetup;
  const setup = new Promise(resolve => { finishSetup = resolve; });
  const pending = runCalibration(output, async (args, timeout, label) => {
    calls.push({ args, timeout, label });
    if (label === 'Lighthouse setup') {
      setupStarted();
      await setup;
      return;
    }
    assert.ok(args.includes('--offline'), 'browser audits must not download packages');
    assert.equal(timeout, 120_000);
    const response = await fetch(args.find(arg => arg.startsWith('http://')));
    assert.equal(response.status, 200, 'the fixture server must be running');
    const oversized = label === 'Calibration oversized';
    const audit = oversized
      ? { score: 0, details: { items: [{ url: 'http://127.0.0.1/poster.webp', wastedBytes: 25000 }] } }
      : { score: null, scoreDisplayMode: 'notApplicable' };
    fs.writeFileSync(args[args.indexOf('--output-path') + 1], JSON.stringify(calibration(audit)));
  });
  // Keep setup pending while checking that no audit has started.
  await started;
  assert.equal(calls.length, 1, 'no browser audit may start while setup is pending');
  assert.deepEqual(calls[0], {
    args: ['--yes', `lighthouse@${LIGHTHOUSE_VERSION}`, '--version'],
    timeout: 300_000, label: 'Lighthouse setup',
  });
  finishSetup();
  await pending;
  assert.deepEqual(calls.map(call => call.label), ['Lighthouse setup', 'Calibration correct', 'Calibration oversized']);
});

test('failed Lighthouse setup stops calibration without launching browser audits', async t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-calibration-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  let calls = 0;
  await assert.rejects(runCalibration(output, async () => {
    calls += 1;
    throw new Error('Lighthouse setup failed: SIGTERM');
  }), /Lighthouse setup failed: SIGTERM/);
  assert.equal(calls, 1);
  assert.deepEqual(fs.readdirSync(output), []);
});
