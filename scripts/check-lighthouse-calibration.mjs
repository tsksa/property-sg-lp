// Exercise the same Lighthouse version and mobile settings as CI against known
// good/bad image sizes. A green live-page audit alone cannot prove the gate works.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LIGHTHOUSE_VERSION = '12.6.1';

export function checkCalibration(report, oversized) {
  assert.equal(report.lighthouseVersion, LIGHTHOUSE_VERSION);
  assert.ok(!report.runtimeError, 'Lighthouse must complete the calibration');
  assert.ok(report.audits['network-requests']?.details?.items.some(item =>
    item.url.endsWith('/poster.webp') && item.statusCode === 200 && item.resourceSize > 0),
  'the fixture image must actually load');
  const audit = report.audits['image-delivery-insight'];
  assert.ok(audit && audit.scoreDisplayMode !== 'error', 'image-delivery audit must run');
  if (oversized) {
    assert.ok(typeof audit.score === 'number' && audit.score < 0.9, 'a genuinely oversized image must fail the existing 0.9 gate');
    assert.ok(audit.details.items.some(item => item.url.endsWith('/poster.webp') && item.wastedBytes > 12288), 'failure must identify the oversized fixture');
  } else {
    assert.ok(audit.score === 1 || audit.scoreDisplayMode === 'notApplicable', 'the responsive image must pass');
  }
}

function runCommand(args, timeout, label) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, { stdio: 'inherit', timeout });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${label} failed: ${signal || code}`)));
  });
}

export async function runCalibration(outputDirectory, run = runCommand) {
  const output = path.resolve(outputDirectory);
  await fs.mkdir(output, { recursive: true });
  // Populate npm's cache before starting any timed browser audit. A cold runner
  // gets a separate download budget; offline audits cannot spend time fetching.
  await run(['--yes', `lighthouse@${LIGHTHOUSE_VERSION}`, '--version'], 300_000, 'Lighthouse setup');
  const config = JSON.parse(await fs.readFile(path.join(ROOT, '.github/lighthouse-config.json'), 'utf8'));
  const flags = { ...config.ci.collect.settings, onlyAudits: ['image-delivery-insight', 'network-requests'] };
  flags.chromeFlags = `${flags.chromeFlags} --headless`;
  // Keep calibration traces next to their explicit report filenames.
  const flagsPath = path.join(output, 'flags.json');
  await fs.writeFile(flagsPath, JSON.stringify(flags));
  const poster = await fs.readFile(path.join(ROOT, 'assets/motion/joetay-hdb-walkthrough-mobile-poster.webp'));
  const server = http.createServer((request, response) => {
    if (request.url === '/poster.webp') {
      response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
      response.end(poster);
      return;
    }
    if (!['/correct.html', '/oversized.html'].includes(request.url)) {
      response.writeHead(404); response.end(); return;
    }
    const width = request.url === '/correct.html' ? 360 : 120;
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Image sizing calibration</title><body style="margin:0"><img src="poster.webp" srcset="poster.webp 720w" sizes="${width}px" alt="HDB seller walkthrough" width="720" height="1280" style="width:${width}px;height:auto"></body></html>`);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    for (const name of ['correct', 'oversized']) {
      const reportPath = path.join(output, `${name}.json`);
      const url = `http://127.0.0.1:${server.address().port}/${name}.html`;
      await run(['--offline', '--yes', `lighthouse@${LIGHTHOUSE_VERSION}`, url, '--cli-flags-path', flagsPath, '--output=json', '--output-path', reportPath, '--quiet'], 120_000, `Calibration ${name}`);
      checkCalibration(JSON.parse(await fs.readFile(reportPath, 'utf8')), name === 'oversized');
      console.log(`Calibration ${name}: expected result confirmed`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/check-lighthouse-calibration.mjs <output-dir>');
  await runCalibration(output);
}
