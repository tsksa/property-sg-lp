import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// submit-lead.js silently discards anything under its time-on-form floor — it still
// returns HTTP 200 (deliberately, so bots can't tell), which js/estate-lead.js reads
// as success and shows "Got it." js/estate-lead.js shipped with no client-side gate
// at all, so any submit before the server floor — including a real visitor whose
// autofill fills name+phone in under a second — got told they succeeded while the
// lead was silently dropped on the floor (mirrors the bug fixed for
// new-launches/project-page-form.js). Assert the client never opens that window,
// whatever either threshold is set to.
test("estate-lead.js never lets a submit through before submit-lead.js's time-on-form floor", () => {
  const server = read('netlify/functions/submit-lead.js');
  const serverFloor = server.match(/tOnForm\s*<\s*(\d+)/);
  assert.ok(serverFloor, 'could not find the server time-on-form floor to compare against');

  const client = read('js/estate-lead.js');
  const clientGate = client.match(/Date\.now\(\)\s*-\s*loadedAt\s*<\s*(\d+)\)\s*return;/);
  assert.ok(clientGate, 'could not find a client time-on-form gate in js/estate-lead.js');

  assert.ok(
    Number(clientGate[1]) >= Number(serverFloor[1]),
    `client allows submit at ${clientGate[1]}ms but the server floor is ${serverFloor[1]}ms — ` +
      'a real submission in that gap gets shown "Got it" while the lead is silently dropped',
  );
});
