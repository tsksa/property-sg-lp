// Keep Netlify's extensionless aliases aligned with the sitemap's .html URLs.
// Directory URLs retain their existing trailing-slash behavior.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const START = '# BEGIN canonical HTML aliases (generated)';
const END = '# END canonical HTML aliases';

export function canonicalAliasRules(xml) {
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]))
    .filter((url) => url.origin === 'https://joetay.com' && url.pathname.endsWith('.html'))
    .map((url) => url.pathname);
  return [...new Set(paths)].sort().map((canonical) => ({
    from: canonical.slice(0, -5), to: canonical,
  }));
}

export function updateRedirects(existing, xml) {
  const block = [START, ...canonicalAliasRules(xml).map(({ from, to }) => `${from} ${to} 301!`), END].join('\n');
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
