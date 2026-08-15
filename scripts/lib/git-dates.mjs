import { execFileSync } from 'node:child_process';

// Git's default date formats (`%cs`, `%cd`, `%ci`) render using the commit's
// own recorded offset and ignore the `TZ` environment variable entirely — a
// commit made late at night in a positive-offset timezone rolls to the next
// calendar day hours before UTC does. `--date=format-local:...` is the one
// git date mode that actually converts using `TZ`, so pin `TZ=UTC0` on that
// call to get a UTC calendar date any caller can compare against
// `todayUTC()` without drift.

/** Committer date (YYYY-MM-DD, UTC) of the last commit touching `file`, or null. */
export function lastCommitDateUTC(file, { cwd } = {}) {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cd', '--date=format-local:%Y-%m-%d', '--', file],
      {
        cwd,
        env: { ...process.env, TZ: 'UTC0' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Today's date (YYYY-MM-DD, UTC). */
export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
