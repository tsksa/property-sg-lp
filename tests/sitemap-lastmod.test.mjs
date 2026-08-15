import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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
  const today = new Date().toISOString().slice(0, 10);
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

  const offenders = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block[1].match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if (loc && lastmod && lastmod > today) offenders.push(`${loc} → ${lastmod}`);
  }

  assert.deepEqual(offenders, [], `sitemap.xml has lastmod values after ${today} (UTC)`);
});
