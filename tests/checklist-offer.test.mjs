import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const client = read('assets/checklist-offer.js');

// AUDIT.md C1: the Seller's Checklist was offered only in the homepage exit
// popup. It is now offered inline on the seller guides and the town pages.
const SELLER_GUIDES = [
  'how-to-sell-hdb-flat-singapore',
  'how-long-to-sell-hdb-singapore-2026',
  'selling-hdb-after-mop-singapore',
  'hdb-valuation-explained',
  'property-agent-commission-singapore',
  'sell-hdb-first-or-buy-condo-first',
];

test('every seller guide carries one checklist slot above its closing call to action', () => {
  for (const guide of SELLER_GUIDES) {
    const html = read(`insights/${guide}.html`);
    assert.equal(html.split('<div data-jt-checklist></div>').length - 1, 1, `${guide}: expected one slot`);
    assert.ok(html.includes('<script src="/assets/checklist-offer.js" defer></script>'), `${guide}: script not loaded`);
    // The form posts to submit-lead, so the page needs the honeypot and reCAPTCHA helper.
    assert.ok(html.includes('<script src="/js/recaptcha-helper.js" defer></script>'), `${guide}: reCAPTCHA helper not loaded`);
    assert.ok(html.indexOf('data-jt-checklist') < html.indexOf('<div class="article-cta">'), `${guide}: slot should precede the closing CTA`);
  }
});

test('town pages get the offer from the lead script, with no change to their HTML', () => {
  const lead = read('js/estate-lead.js');
  assert.match(lead, /document\.querySelector\('\.est-sell'\)/);
  assert.match(lead, /setAttribute\('data-jt-checklist', ''\)/);
  assert.match(lead, /checklistScript\.src = '\/assets\/checklist-offer\.js'/);
  assert.ok(!read('hdb-prices/yishun/index.html').includes('data-jt-checklist'));
});

test('the email route sends what the homepage exit popup sends', () => {
  const homepage = read('index.html');
  for (const field of ["lead_type:'newsletter_signup'", "lead_magnet:'seller_checklist_2026'"]) {
    assert.ok(homepage.includes(field), `homepage exit popup no longer sends ${field}`);
  }
  assert.match(client, /lead_type: 'newsletter_signup'/);
  assert.match(client, /lead_magnet: 'seller_checklist_2026'/);
  assert.match(client, /source_widget: 'inline_checklist'/);
  assert.match(client, /email_address: address/);
  assert.match(client, /newsletter_opt_in: 1/);
  // The monthly email is disclosed next to the form, in the popup's own words.
  assert.ok(homepage.includes('one market update email per month (unsubscribe anytime)'));
  assert.ok(client.includes('one market update email per month (unsubscribe anytime)'));
  assert.ok(fs.existsSync(path.join(ROOT, 'downloads/seller-checklist-2026.html')));
  assert.match(client, /CHECKLIST_URL = '\/downloads\/seller-checklist-2026\.html'/);
});

test('the offer never reports success for a submit the server would silently drop', () => {
  const serverFloor = read('netlify/functions/submit-lead.js').match(/tOnForm\s*<\s*(\d+)/);
  const clientGate = client.match(/Date\.now\(\) - loadedAt < (\d+)\) return;/);
  assert.ok(serverFloor && clientGate);
  assert.ok(Number(clientGate[1]) >= Number(serverFloor[1]));
  assert.match(client, /if \(honeypot\.value\) return;/);
  assert.match(client, /result\.ok !== true\) throw new Error/);
});

test('there is always a WhatsApp route, on the number the site footer shows', () => {
  const number = read('scripts/lib/site-footer.mjs').match(/https:\/\/wa\.me\/(\d+)/)[1];
  assert.ok(client.includes(`https://wa.me/${number}?text=`));
  assert.match(client, /'data-cta-location': 'inline_checklist'/);
});
