import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

// Pulls the value of the site-wide (for = "/*") [[headers]] block only —
// the file has separate blocks for cache headers on /*.jpg etc, and this
// must not accidentally match one of those.
function siteWideHeaderBlock() {
  const blocks = toml.split(/\n(?=\[\[headers\]\])/);
  const wide = blocks.find((b) => /for\s*=\s*"\/\*"\s*$/m.test(b.split('\n[headers.values]')[0]));
  assert.ok(wide, 'expected a [[headers]] block with for = "/*" in netlify.toml');
  return wide;
}

test('the site-wide header block ships a report-only CSP', () => {
  const block = siteWideHeaderBlock();
  const match = block.match(/Content-Security-Policy-Report-Only\s*=\s*"([^"]+)"/);
  assert.ok(
    match,
    'netlify.toml is missing Content-Security-Policy-Report-Only on the "/*" header block — ' +
      'this is what silently regressed when the header line is deleted or the block is reworded',
  );
  const policy = match[1];

  // Every external host this site is known to load a script, style, font,
  // XHR/fetch target, or iframe from. If a new third-party integration is
  // added without updating this policy, THIS test won't catch that (it only
  // proves the policy as shipped is internally consistent) — but it does
  // stop the whole header from being silently dropped or truncated again.
  const mustAllow = [
    ['script-src', 'https://www.googletagmanager.com'], // GA4
    ['script-src', 'https://connect.facebook.net'], // Meta Pixel
    ['script-src', 'https://assets.calendly.com'], // Calendly inline widget
    ['script-src', 'https://unpkg.com'], // /autopilot/ (lucide icons)
    ['style-src', 'https://fonts.googleapis.com'],
    ['font-src', 'https://fonts.gstatic.com'],
    ['connect-src', 'https://data.gov.sg'], // /neighbour-prices/, /hdb-prices/ live queries
    ['connect-src', 'https://www.onemap.gov.sg'], // postal code lookup
    ['frame-src', 'https://my.matterport.com'], // virtual tours
    ['frame-src', 'https://tubear.co'], // virtual tours
    ['frame-src', 'https://*.synology.me'], // Newport showroom NAS tours
  ];
  for (const [directive, origin] of mustAllow) {
    const directiveValue = policy.split(';').find((d) => d.trim().startsWith(directive));
    assert.ok(directiveValue, `policy has no ${directive} directive`);
    assert.ok(
      directiveValue.includes(origin),
      `${directive} should allow ${origin} (got: ${directiveValue.trim()})`,
    );
  }

  // Report-only by construction (the enforcing `Content-Security-Policy`
  // header name is deliberately not used yet — see netlify.toml comment).
  assert.ok(
    !/(?<!-Report-Only)\s*Content-Security-Policy\s*=/.test(block.replace(match[0], '')),
    'an enforcing Content-Security-Policy header would risk breaking the site — ship Report-Only first',
  );
});

test('the CSP does not allow arbitrary third-party script origins', () => {
  const block = siteWideHeaderBlock();
  const match = block.match(/Content-Security-Policy-Report-Only\s*=\s*"([^"]+)"/);
  assert.ok(match);
  const policy = match[1];
  // The actual security value of this first pass: 'unsafe-inline' is
  // unavoidable on a build-less, inline-script-heavy site, but script-src
  // must still be restricted to 'self' + a known allow-list, not '*' or an
  // absent directive (which would fall through to default-src and, on many
  // real CSP proposals, get widened to '*' "to stop the noise").
  const scriptSrc = policy.match(/script-src\s+([^;]+)/);
  assert.ok(scriptSrc, 'policy must define script-src explicitly');
  assert.ok(!/[^-]\*/.test(scriptSrc[1]), 'script-src must not include a wildcard origin');
});
