// Generate deployment metadata from the final checkout, including squash merges.
// Do not commit this build output back to the repository.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const options = { cwd, encoding: 'utf8' };
// Netlify may supply a shallow checkout. Recover history before asking for dates;
// otherwise unchanged pages could incorrectly receive the checkout date.
if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], options).trim() === 'true') {
  execFileSync('git', ['fetch', '--unshallow', 'origin'], { ...options, stdio: 'inherit' });
}
for (const args of [[], ['--check']]) {
  execFileSync(process.execPath, ['scripts/refresh-sitemap-lastmod.mjs', ...args], {
    ...options, stdio: 'inherit',
  });
}
