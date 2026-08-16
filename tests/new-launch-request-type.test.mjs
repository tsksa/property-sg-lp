import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The 5 remaining hand-built new-launch pages (ARCHITECTURE.md: "five hand-built pages carry
// inline handlers") each have exactly one lead form and no `request_type` form
// field, so `form.request_type` is always undefined and the JS's fallback value
// is what Joe actually sees as the WhatsApp "Request:" line (submit-lead.js maps
// vvip → "VVIP Preview registration", interest → "Register interest"). Found
// 2026-08-17: 5 pages frame their form as "Ask about X" / "This form is the
// secondary contact option" / "Send enquiry →" — a generic enquiry — but all
// hardcoded (or defaulted to) 'vvip', so Joe's notification called each one a
// VVIP registration regardless of what the visitor actually asked for. The sixth
// hand-built page, former-thomson-view, was the only genuine VVIP-preview page;
// it was deleted after its URL became a permanent redirect to Thomson Reserve.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NL_DIR = path.join(ROOT, 'new-launches');

const GENERIC_ENQUIRY_PAGES = [
  'dunearn-house.html',
  'narra-residences.html',
  'river-modern.html',
  'vela-bay.html',
  'newport-residences.html',
];

function requestTypeSent(html) {
  const m = html.match(/request_type:\s*(?:form\.request_type\s*\?\s*form\.request_type\.value\s*:\s*)?'([a-z]+)'/);
  return m ? m[1] : null;
}

test('generic-enquiry hand-built new-launch pages send request_type=interest, not vvip', () => {
  for (const file of GENERIC_ENQUIRY_PAGES) {
    const html = fs.readFileSync(path.join(NL_DIR, file), 'utf8');
    assert.match(html, /This form is the secondary contact option/, `${file} no longer reads as a generic-enquiry page — re-check whether it still belongs in this test's page list`);
    assert.equal(requestTypeSent(html), 'interest', `${file} should send request_type: 'interest' to match its "secondary contact option" framing`);
  }
});

test('a hand-built page may send request_type=vvip only when its copy promises a VVIP preview', () => {
  for (const file of fs.readdirSync(NL_DIR)) {
    if (!file.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(NL_DIR, file), 'utf8');
    if (requestTypeSent(html) !== 'vvip') continue;
    assert.match(html, /Register for VVIP Preview/, `${file} no longer reads as a VVIP-preview page — re-check whether it still belongs in this test's page list`);
  }
});

test('no hand-built new-launch page whose form is a "secondary contact option" claims a VVIP request', () => {
  // General form of the same invariant, independent of the specific page list
  // above, so a future hand-built page copy-pasting the same form card doesn't
  // reintroduce the mislabel.
  for (const file of fs.readdirSync(NL_DIR)) {
    if (!file.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(NL_DIR, file), 'utf8');
    if (!/This form is the secondary contact option/.test(html)) continue;
    assert.notEqual(requestTypeSent(html), 'vvip', `${file}'s form is a generic secondary contact option but sends request_type: 'vvip'`);
  }
});
