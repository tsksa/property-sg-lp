import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const script = read('assets/home-motion.js');
function harness({ mobile = false, reduced = false } = {}) {
  function element(extra = {}) {
    const events = {};
    return Object.defineProperties({ hidden: false, textContent: '', addEventListener(name, fn) { (events[name] ||= []).push(fn); },
      emit(name) { for (const fn of events[name] || []) fn(); } }, Object.getOwnPropertyDescriptors(extra));
  }
  let source = null;
  const loads = [];
  const video = element({ hidden: true, paused: true, ended: false, currentTime: 0, rejectPlay: false, muted: false, volume: 1,
    children: [], appendChild(child) { this.children.push(child); },
    get src() { return source; }, set src(value) { source = value; },
    getAttribute() { return source; }, removeAttribute() { source = null; },
    load() { loads.push(source); for (const child of this.children) child.track.mode = child.default ? 'showing' : 'disabled'; },
    play() { if (this.rejectPlay) return Promise.reject(new Error('blocked')); this.paused = false; this.ended = false; this.emit('play'); return Promise.resolve(); },
    pause() { if (!this.paused) { this.paused = true; this.emit('pause'); } },
  });
  const nodes = { video, picture: element(), '[data-motion-toggle]': element(), '[data-motion-lookup]': element(), '[data-motion-status]': element(), '[data-motion-controls]': element({ hidden: true }) };
  const narrow = element({ matches: mobile });
  const reduce = element({ matches: reduced });
  const document = element({ hidden: false, createElement(tagName) { assert.equal(tagName, 'track'); return { track: { mode: 'disabled' } }; }, querySelector: () => ({ querySelector: (key) => nodes[key] }) });
  vm.runInNewContext(script, { document, window: { matchMedia: (query) => query.includes('640') ? narrow : reduce } });
  return { video, loads, nodes, narrow, reduce, document, click: () => nodes['[data-motion-toggle]'].emit('click') };
}

test('homepage film never requests media or captions until explicit playback, including reduced motion', async () => {
  for (const mobile of [false, true]) for (const reduced of [false, true]) {
    const h = harness({ mobile, reduced });
    assert.equal(h.video.src, null);
    assert.equal(h.video.children.length, 0, 'no caption track URL before Play');
    assert.equal(h.video.hidden, true);
    assert.equal(h.nodes.picture.hidden, false);
    assert.ok(h.loads.every((src) => src === null));
    assert.equal(h.nodes['[data-motion-controls]'].hidden, false);
    h.click();
    await Promise.resolve();
    assert.equal(h.video.src, `/assets/motion/joetay-hdb-walkthrough-${mobile ? 'mobile' : 'desktop'}.mp4`);
    assert.equal(h.video.paused, false);
    assert.equal(h.video.muted, false, 'the first user-initiated playback is audible');
    assert.equal(h.video.children.length, 1);
    assert.equal(h.video.children[0].src, '/assets/motion/joetay-hdb-walkthrough-en.vtt');
    assert.equal(h.video.children[0].kind, 'captions');
    assert.equal(h.video.children[0].srclang, 'en');
    assert.equal(h.video.children[0].default, true);
    assert.equal(h.video.children[0].track.mode, 'showing');
    assert.equal(h.video.hidden, false);
    assert.equal(h.nodes.picture.hidden, true);
  }
});

test('one control plays, pauses, resumes and replays at the end without new downloads', () => {
  const h = harness();
  h.click();
  assert.equal(h.nodes['[data-motion-toggle]'].textContent, 'Pause walkthrough');
  h.video.currentTime = 10;
  h.click();
  assert.equal(h.video.paused, true);
  assert.equal(h.nodes['[data-motion-toggle]'].textContent, 'Play walkthrough');
  h.click();
  assert.equal(h.video.currentTime, 10, 'Play resumes a paused walkthrough');
  assert.equal(h.video.paused, false);
  h.video.currentTime = 30; h.video.ended = true; h.video.paused = true; h.video.emit('ended');
  assert.equal(h.nodes['[data-motion-toggle]'].textContent, 'Replay walkthrough');
  h.click();
  assert.equal(h.video.currentTime, 0, 'the same control restarts a finished walkthrough');
  assert.equal(h.video.paused, false);
  assert.equal(h.loads.filter(Boolean).length, 1);
});

test('failed playback keeps the poster and transcript available and retry works', async () => {
  const h = harness();
  h.video.rejectPlay = true;
  h.click();
  await Promise.resolve();
  assert.equal(h.video.hidden, true);
  assert.equal(h.nodes.picture.hidden, false);
  assert.match(h.nodes['[data-motion-status]'].textContent, /could not start/);
  h.video.rejectPlay = false;
  h.click();
  h.video.emit('error');
  assert.equal(h.video.src, null);
  assert.equal(h.nodes.picture.hidden, false);
  assert.match(h.nodes['[data-motion-status]'].textContent, /unavailable/);
  h.click();
  assert.equal(h.video.hidden, false);
});

test('viewport, reduced-motion and background changes stop playback without autoplay', () => {
  const h = harness();
  h.click();
  h.narrow.matches = true; h.narrow.emit('change');
  assert.equal(h.video.paused, true);
  assert.equal(h.video.src, null);
  assert.equal(h.nodes.picture.hidden, false);
  h.click();
  assert.match(h.video.src, /walkthrough-mobile\.mp4$/);
  h.reduce.matches = true; h.reduce.emit('change');
  assert.equal(h.video.paused, true);
  assert.equal(h.nodes.picture.hidden, false);
  h.click();
  h.document.hidden = true; h.document.emit('visibilitychange');
  assert.equal(h.video.paused, true);
});

test('a stale play rejection cannot hide newer playback after a format change', async () => {
  const h = harness();
  let rejectOld;
  const normalPlay = h.video.play;
  h.video.play = function () {
    normalPlay.call(this);
    return new Promise((resolve, reject) => { rejectOld = reject; });
  };
  h.click();
  h.narrow.matches = true; h.narrow.emit('change');
  h.video.play = normalPlay;
  h.click();
  rejectOld(new Error('old source aborted'));
  await Promise.resolve();
  assert.match(h.video.src, /walkthrough-mobile\.mp4$/);
  assert.equal(h.video.paused, false);
  assert.equal(h.video.hidden, false);
  assert.equal(h.nodes.picture.hidden, true);
  assert.equal(h.nodes['[data-motion-status]'].textContent, 'Playing');
});

test('homepage ships a lazy poster, narrated transcript and accessible opt-in sound controls', () => {
  const html = read('index.html');
  const section = html.match(/<section class="jt-motion"[\s\S]*?<\/section>/)[0];
  assert.match(section, /<video hidden playsinline controls preload="none"/);
  assert.doesNotMatch(section, /autoplay|<video[^>]*\s(?:muted|src=)|<track[^>]*\ssrc=/);
  assert.match(section, /loading="lazy"/);
  assert.match(section, /data-motion-controls hidden/);
  assert.match(section, /aria-describedby="next-move-transcript"/);
  assert.match(section, /aria-label="30-second HDB sold-prices walkthrough with Singapore English narration"/);
  assert.equal((section.match(/<button\b/g) || []).length, 1, 'there is one custom playback control');
  assert.doesNotMatch(section + script, /data-motion-replay/);
  for (const title of ['Before you choose an asking price.', 'Start with your block.', 'Same flat type. Real sale prices.', 'Then compare the homes.']) assert.ok(section.includes(title));
  assert.match(html, /src="\/assets\/home-motion.js" defer/);
  assert.match(section, /Play walkthrough with sound/);
  assert.match(section, /Includes AI-generated narration in Singapore English\./);
  assert.match(section, /Example: 4-Room sales at block 640, Ang Mo Kio Avenue 6, checked 22 October 2026\./);
  assert.match(section, /not a personalised valuation/);
  assert.doesNotMatch(section, /560123|block 123|No sales were found|street sales|street comparisons|different blocks|block 700B|block 638/);
  assert.match(section, /<strong>Narration<\/strong>/);
  assert.match(section, /<strong>On-screen text and visuals<\/strong>/);
  for (const phrase of narration) assert.ok(section.includes(phrase), `missing narration: ${phrase}`);
  assert.doesNotMatch(section, /Silent video|Silent ·|16.second|A little room to think/);
});

test('the walkthrough example and transcript use matching sales from the selected block', () => {
  const data = JSON.parse(read('ops/motion/hdb-walkthrough/data.json'));
  assert.equal(data.postal, '560640');
  assert.equal(data.block, '640');
  assert.equal(data.street, 'Ang Mo Kio Avenue 6');
  assert.equal(data.flat_type, '4-Room');
  assert.equal(data.scope, 'block');
  assert.deepEqual(data.transactions.map(row => [row.month, row.storey_range, Number(row.floor_area_sqm), Number(row.resale_price)]), [
    ['2026-10', '10 TO 12', 91, 560000],
    ['2026-06', '04 TO 06', 91, 528000],
    ['2026-05', '13 TO 15', 91, 560000],
  ]);
  const transcript = read('index.html').match(/<details id="next-move-transcript">[\s\S]*?<\/details>/)[0];
  assert.ok(transcript.includes(`postal code ${data.postal}`));
  assert.ok(transcript.includes(`${data.flat_type} sales from block ${data.block} on ${data.street}`));
  const date = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  for (const row of data.transactions) {
    assert.equal(row.block, data.block, 'each example sale belongs to the requested block');
    assert.equal(row.street_name, 'ANG MO KIO AVE 6');
    assert.equal(row.flat_type, '4 ROOM');
    const month = date.format(new Date(`${row.month}-01T00:00:00Z`));
    const floors = row.storey_range.replace(' TO ', '–');
    const price = Number(row.resale_price).toLocaleString('en-SG');
    assert.ok(transcript.includes(`${month}, floors ${floors}, ${Number(row.floor_area_sqm)} m², $${price}`), `transcript omits the source sale: ${row.month}`);
  }
  assert.match(transcript, /checked 22 October 2026\. Dates are registration months\./);
});

test('the HDB walkthrough follows the hero and links back to the lookup shown in the demo', () => {
  const html = read('index.html');
  const section = html.match(/<section class="jt-motion"[\s\S]*?<\/section>/)[0];
  assert.equal((html.match(/data-home-motion/g) || []).length, 1);
  assert.match(html, /class="scroll-hint"[\s\S]*?<\/section>\s*<!-- HDB pricing walkthrough -->\s*<section class="jt-motion"/);
  assert.match(html, /<\/section>\s*<!-- Trust Strip -->\s*<section class="trust-strip"/);
  assert.ok(html.indexOf('data-home-motion') > html.indexOf('id="main"'));
  assert.ok(html.indexOf('data-home-motion') < html.indexOf('class="trust-strip"'));
  const hero = html.slice(html.indexOf('id="heroEstimate"'), html.indexOf('id="heroForm"'));
  assert.match(hero, /href="#next-move">See how to compare sold prices<\/a>/);
  assert.match(section, /id="next-move"/);
  assert.match(section, /href="#heroPostal" data-motion-lookup>Check my block’s sold prices<\/a>/);
});

test('the walkthrough CTA restores the postal lookup, focuses it and pauses playback', () => {
  const html = read('index.html');
  const start = html.indexOf("const heroEstimate=document.getElementById('heroEstimate');");
  const end = html.indexOf('// "Get Joe\'s valuation"', start);
  assert.ok(start >= 0 && end > start, 'the existing hero view helper is present');
  const h = harness();
  const heroForm = { hidden: true };
  const heroEstimate = { hidden: false };
  const clicks = {};
  let focused = null;
  const elements = {
    heroEstimate,
    'hero-name': { focus() { focused = 'hero-name'; } },
    heroPostal: { focus() { focused = 'heroPostal'; } },
    heroTalkLink: { addEventListener(name, fn) { clicks.talk = fn; } },
    heroBackToEstimate: { addEventListener(name, fn) { clicks.back = fn; } },
  };
  h.document.getElementById = id => elements[id];
  h.document.querySelector = selector => {
    assert.equal(selector, '[data-motion-lookup]');
    return h.nodes[selector];
  };
  vm.runInNewContext(html.slice(start, end), { document: h.document, heroForm });
  clicks.talk();
  assert.equal(heroForm.hidden, false);
  assert.equal(heroEstimate.hidden, true);
  assert.equal(focused, 'hero-name');
  h.click();
  h.video.currentTime = 12;
  h.nodes['[data-motion-lookup]'].emit('click');
  assert.equal(heroForm.hidden, true, 'the consultation form closes');
  assert.equal(heroEstimate.hidden, false, 'the demonstrated postal lookup is restored');
  assert.equal(focused, 'heroPostal');
  assert.equal(h.video.paused, true, 'narration stops when the visitor leaves the walkthrough');
  assert.equal(h.video.currentTime, 12, 'returning to the tool does not restart the film');
  assert.equal(h.loads.filter(Boolean).length, 1);
});

const narration = [
  'Selling your HDB? Start with real sold prices.',
  'Enter your postal code. Choose your flat type.',
  'Compare recent sales, including the date and floor. Check whether they cover your block or the wider street.',
  'These are a starting point. Your floor, condition and remaining lease affect your price.',
  'Check your block’s sold prices. No name or phone needed.',
];

test('voiced media and caption deliverables remain local and within budget', () => {
  for (const format of ['desktop', 'mobile']) {
    const asset = new URL(`../assets/motion/joetay-hdb-walkthrough-${format}.mp4`, import.meta.url);
    assert.ok(fs.statSync(asset).size < 1_000_000);
    assert.ok(fs.statSync(new URL(`../assets/motion/joetay-hdb-walkthrough-${format}-poster.webp`, import.meta.url)).size > 0);
  }
  const captions = read('assets/motion/joetay-hdb-walkthrough-en.vtt');
  assert.match(captions, /^WEBVTT/);
  const words = captions.split(/\r?\n/).filter(line => line && line !== 'WEBVTT' && !line.includes('-->') && !/^\d+$/.test(line)).join(' ');
  assert.equal(words, narration.join(' '), 'captions match the exact spoken transcript');
  const cues = [...captions.matchAll(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/g)];
  assert.ok(cues.length >= narration.length, 'each narrated chapter has captions');
  let previousEnd = 0;
  for (const cue of cues) {
    const values = cue.slice(1).map(Number);
    const start = values[0] * 3600 + values[1] * 60 + values[2] + values[3] / 1000;
    const end = values[4] * 3600 + values[5] * 60 + values[6] + values[7] / 1000;
    assert.ok(start >= previousEnd && end > start && end <= 30, 'captions stay ordered within the 30-second walkthrough');
    previousEnd = end;
  }
});

test('previous film URLs keep serving current Azure media for already-open tabs', () => {
  const redirects = read('_redirects');
  const generatedStart = redirects.indexOf('# BEGIN canonical HTML aliases (generated)');
  assert.ok(generatedStart >= 0, 'canonical alias block remains present');
  const manualRules = redirects.slice(0, generatedStart).split(/\r?\n/)
    .map(line => line.split('#')[0].trim()).filter(Boolean)
    .map(line => line.split(/\s+/));
  const aliases = [
    ['joetay-next-move-desktop.mp4', 'joetay-next-move-desktop-azure.mp4'],
    ['joetay-next-move-mobile.mp4', 'joetay-next-move-mobile-azure.mp4'],
    ['joetay-next-move-desktop-voiced.mp4', 'joetay-next-move-desktop-azure.mp4'],
    ['joetay-next-move-mobile-voiced.mp4', 'joetay-next-move-mobile-azure.mp4'],
    ['joetay-next-move-en.vtt', 'joetay-next-move-en-azure.vtt'],
  ];
  for (const [previous, current] of aliases) {
    const from = `/assets/motion/${previous}`;
    const to = `/assets/motion/${current}`;
    const rules = manualRules.filter(rule => rule[0] === from);
    assert.deepEqual(rules, [[from, to, '200']], `${from} must rewrite directly before the generated aliases`);
    assert.ok(fs.statSync(new URL(`..${to}`, import.meta.url)).isFile(), `missing rewrite target: ${to}`);
    assert.ok(!fs.existsSync(new URL(`..${from}`, import.meta.url)), `a legacy physical file would shadow the Azure rewrite: ${from}`);
    assert.equal(manualRules.some(rule => rule[0] === to), false, `Azure media must not introduce a rewrite chain: ${to}`);
  }
});


test('play, replay and format changes preserve native mute and caption choices', () => {
  const h = harness();
  assert.equal(h.nodes['[data-motion-toggle]'].textContent, 'Play walkthrough with sound');
  h.click();
  h.video.muted = true;
  h.video.volume = 0.35;
  h.video.children[0].track.mode = 'disabled';
  h.click();
  assert.equal(h.nodes['[data-motion-status]'].textContent, 'Paused');
  h.click();
  assert.equal(h.video.muted, true);
  h.video.currentTime = 30; h.video.ended = true; h.video.paused = true; h.video.emit('ended');
  h.click();
  assert.equal(h.video.muted, true);
  assert.equal(h.video.volume, 0.35);
  assert.equal(h.video.children.length, 1, 'replay must not attach another caption file');
  assert.equal(h.video.children[0].track.mode, 'disabled', 'replay respects captions switched off');
  h.narrow.matches = true; h.narrow.emit('change');
  assert.equal(h.video.src, null);
  h.click();
  assert.equal(h.video.muted, true);
  assert.equal(h.video.volume, 0.35);
  assert.equal(h.video.children.length, 1);
  assert.equal(h.video.children[0].track.mode, 'disabled');
  h.video.muted = false;
  h.click();
  h.click();
  assert.equal(h.video.muted, false);
  assert.equal(h.nodes['[data-motion-status]'].textContent, 'Playing');
});
