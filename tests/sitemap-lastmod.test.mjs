import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'refresh-sitemap-lastmod.mjs');

function runCheck(env = {}) {
  try {
    return {
      code: 0,
      out: execFileSync('node', [SCRIPT, '--check'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      }),
    };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

// The bug this pins: lastCommitDate used `--format=%cs`, which renders the date
// in the offset the COMMIT recorded, while TODAY comes from toISOString() and is
// UTC. Every commit made from Singapore (+0800) between 16:00 and 24:00 UTC then
// read as "tomorrow" against a TODAY of "today", so --check failed for a third of
// every day — and it did, on main, which auto-deploys.
//
// Running the check under a deliberately hostile TZ is the cheapest reproduction:
// if any date in the pipeline is resolved in local time rather than UTC, the two
// runs disagree and one of them fails.
test('lastmod check is timezone-independent', () => {
  const utc = runCheck({ TZ: 'UTC' });
  const singapore = runCheck({ TZ: 'Asia/Singapore' });
  const honolulu = runCheck({ TZ: 'Pacific/Honolulu' });

  assert.equal(utc.code, 0, `check failed under TZ=UTC:\n${utc.out}`);
  assert.equal(
    singapore.code,
    0,
    `check passed under TZ=UTC but failed under TZ=Asia/Singapore — a date is being resolved in local time:\n${singapore.out}`,
  );
  assert.equal(
    honolulu.code,
    0,
    `check passed under TZ=UTC but failed under TZ=Pacific/Honolulu — a date is being resolved in local time:\n${honolulu.out}`,
  );
});

// A lastmod dated after today cannot be true. The script tolerates lastmod newer
// than the last commit (a regenerated-but-uncommitted file is legitimately newer),
// and that early return meant a future date was never corrected on later runs.
// Six such entries — including the homepage — reached main that way.
test('no lastmod is dated in the future', () => {
  // The script allows the later of the UTC and Singapore dates (insights
  // articles are dated in SGT), so this guard uses the same bound.
  const now = new Date();
  const utcToday = now.toISOString().slice(0, 10);
  const sgtToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const today = sgtToday > utcToday ? sgtToday : utcToday;
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

  const offenders = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block[1].match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if (loc && lastmod && lastmod > today) offenders.push(`${loc} → ${lastmod}`);
  }

  assert.deepEqual(offenders, [], `sitemap.xml has lastmod values after ${today}`);
});

// --- Declared dateModified is authoritative -------------------------------
//
// These run the real script against a throwaway repo (one insights article and
// a one-entry sitemap) so the live sitemap is never touched. A preload module
// pins Date to a fixed instant, which is how the SGT/UTC boundary is exercised.

function makeFixture({ dateModified, lastmod }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-lastmod-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'insights'));
  fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'refresh-sitemap-lastmod.mjs'));
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Fixture',
    datePublished: '2026-01-01',
    dateModified,
  };
  fs.writeFileSync(
    path.join(dir, 'insights', 'fixture.html'),
    `<!doctype html><script type="application/ld+json">${JSON.stringify(article)}</script>\n`,
  );
  fs.writeFileSync(
    path.join(dir, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      '  <url>\n    <loc>https://joetay.com/insights/fixture.html</loc>\n' +
      `    <lastmod>${lastmod}</lastmod>\n  </url>\n</urlset>\n`,
  );
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'ignore', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'fixture');
  return dir;
}

function writeClock(dir, iso) {
  const file = path.join(dir, 'fake-clock.mjs');
  fs.writeFileSync(
    file,
    `const RealDate = Date;
const FIXED = RealDate.parse(${JSON.stringify(iso)});
class FakeDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED])); }
  static now() { return FIXED; }
}
globalThis.Date = FakeDate;
`,
  );
  return file;
}

function runIn(dir, args, { clock } = {}) {
  const nodeArgs = clock ? ['--import', writeClock(dir, clock)] : [];
  try {
    return {
      code: 0,
      out: execFileSync('node', [...nodeArgs, path.join(dir, 'scripts', 'refresh-sitemap-lastmod.mjs'), ...args], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const fixtureLastmod = (dir) =>
  fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8').match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];

test('a lastmod newer than the declared dateModified is lowered to it', (t) => {
  const dir = makeFixture({ dateModified: '2026-09-15', lastmod: '2026-10-01' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = '2026-10-30T04:00:00Z';

  const check = runIn(dir, ['--check'], { clock });
  assert.equal(check.code, 1, `--check should reject lastmod != declared dateModified:\n${check.out}`);

  const write = runIn(dir, [], { clock });
  assert.equal(write.code, 0, write.out);
  assert.equal(fixtureLastmod(dir), '2026-09-15');
  assert.equal(runIn(dir, ['--check'], { clock }).code, 0);
});

test('a dateModified that is today in Singapore but tomorrow in UTC is accepted', (t) => {
  // 2026-10-30T20:00Z is 2026-10-31 04:00 SGT.
  const dir = makeFixture({ dateModified: '2026-10-31', lastmod: '2026-10-20' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = '2026-10-30T20:00:00Z';

  const write = runIn(dir, [], { clock });
  assert.equal(write.code, 0, write.out);
  assert.equal(fixtureLastmod(dir), '2026-10-31');

  const check = runIn(dir, ['--check'], { clock });
  assert.equal(check.code, 0, `SGT-dated lastmod was rejected as future-dated:\n${check.out}`);
});
