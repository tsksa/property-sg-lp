import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function serverFloor() {
  const server = read('netlify/functions/submit-lead.js');
  const match = server.match(/tOnForm\s*<\s*(\d+)/);
  assert.ok(match, 'could not find the server time-on-form floor');
  return Number(match[1]);
}

for (const page of ['sell/index.html', 'rent-out/index.html']) {
  test(`${page} never submits before submit-lead.js's time-on-form floor`, () => {
    const html = read(page);
    const match = html.match(/jtWaitForSpamFloor\(form,\s*_pageLoadedAt,\s*(\d+)/);
    assert.ok(match, `${page} has no queued client-side time-on-form gate`);
    assert.ok(
      Number(match[1]) >= serverFloor(),
      `${page} allows submission at ${match[1]}ms, before the server accepts it`,
    );
  });
}
