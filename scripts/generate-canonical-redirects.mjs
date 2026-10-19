// Keep Netlify's duplicate URL forms pointing at the sitemap's canonical URLs.
//
// With pretty_urls off (#448), Netlify serves the same file under several
// paths with a 200: /x for /x.html, and /x.html for a directory page /x/
// (JOE-448). Those become a single 301 to the canonical URL. Two forms are
// left to rel=canonical: /x/index.html is the physical file behind /x/, so a
// forced rule on it risks a loop (check-consistency rejects one), and the bare
// /x of a directory page cannot be matched apart from /x/ because Netlify
// ignores the trailing slash when matching rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const START = '# BEGIN canonical HTML aliases (generated)';
const END = '# END canonical HTML aliases';

const fileExists = (urlPath) => fs.existsSync(path.join(ROOT, urlPath.slice(1)));

export function canonicalAliasRules(xml, exists = fileExists) {
  const paths = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]))
    .filter((url) => url.origin === 'https://joetay.com')
    .map((url) => url.pathname))];
  const rules = [];
  for (const canonical of paths) {
    if (canonical.endsWith('.html')) {
      rules.push({ from: canonical.slice(0, -5), to: canonical });
    } else if (canonical === '/') {
      rules.push({ from: '/index', to: '/' });
    } else if (canonical.endsWith('/')) {
      // A real file at /x.html is its own page, never an alias of /x/.
      const html = `${canonical.slice(0, -1)}.html`;
      if (!exists(html)) rules.push({ from: html, to: canonical });
    }
  }
  return rules.sort((a, b) => a.from.localeCompare(b.from));
}

export function updateRedirects(existing, xml, exists = fileExists) {
  const block = [START, ...canonicalAliasRules(xml, exists).map(({ from, to }) => `${from} ${to} 301!`), END].join('\n');
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start === -1 && end === -1) return existing.trimEnd() + '\n\n' + block + '\n';
  if (start === -1 || end < start) throw new Error('Incomplete canonical redirect block');
  return existing.slice(0, start) + block + existing.slice(end + END.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(ROOT, '_redirects');
  const before = fs.readFileSync(file, 'utf8');
  const after = updateRedirects(before, fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'));
  if (process.argv.includes('--check')) {
    if (before !== after) {
      console.error('Canonical redirects are stale. Run node scripts/generate-canonical-redirects.mjs');
      process.exitCode = 1;
    }
  } else if (before !== after) {
    fs.writeFileSync(file, after);
  }
}
