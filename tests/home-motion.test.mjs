import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const script = read('assets/home-motion.js');
function harness({ mobile = false, reduced = false } = {}) {
  function element(extra = {}) {
    const events = {};
    return Object.defineProperties({ hidden: false, textContent: '', addEventListener(name, fn) { events[name] = fn; },
      emit(name) { events[name]?.(); } }, Object.getOwnPropertyDescriptors(extra));
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
  const nodes = { video, picture: element(), '[data-motion-toggle]': element(), '[data-motion-replay]': element(), '[data-motion-status]': element(), '[data-motion-controls]': element({ hidden: true }) };
  const narrow = element({ matches: mobile });
  const reduce = element({ matches: reduced });
  const document = element({ hidden: false, createElement(tagName) { assert.equal(tagName, 'track'); return { track: { mode: 'disabled' } }; }, querySelector: () => ({ querySelector: (key) => nodes[key] }) });
  vm.runInNewContext(script, { document, window: { matchMedia: (query) => query.includes('640') ? narrow : reduce } });
  return { video, loads, nodes, narrow, reduce, document, click: (key = 'toggle') => nodes[`[data-motion-${key}]`].emit('click') };
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
    assert.equal(h.video.src, `/assets/motion/joetay-next-move-${mobile ? 'mobile' : 'desktop'}-azure.mp4`);
    assert.equal(h.video.paused, false);
    assert.equal(h.video.muted, false, 'the first user-initiated playback is audible');
    assert.equal(h.video.children.length, 1);
    assert.equal(h.video.children[0].src, '/assets/motion/joetay-next-move-en-azure.vtt');
    assert.equal(h.video.children[0].kind, 'captions');
    assert.equal(h.video.children[0].srclang, 'en');
    assert.equal(h.video.children[0].default, true);
    assert.equal(h.video.children[0].track.mode, 'showing');
    assert.equal(h.video.hidden, false);
    assert.equal(h.nodes.picture.hidden, true);
  }
});

test('play, pause, replay and end states remain usable without new downloads', () => {
  const h = harness();
  h.click();
  assert.equal(h.nodes['[data-motion-toggle]'].textContent, 'Pause introduction');
  h.click();
  assert.equal(h.video.paused, true);
  h.video.currentTime = 10;
  h.click('replay');
  assert.equal(h.video.currentTime, 0);
  assert.equal(h.video.paused, false);
  h.video.currentTime = 16; h.video.ended = true; h.video.paused = true; h.video.emit('ended');
  assert.equal(h.nodes['[data-motion-toggle]'].textContent, 'Replay introduction');
  h.click();
  assert.equal(h.video.currentTime, 0);
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
  assert.match(h.video.src, /mobile-azure\.mp4$/);
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
  assert.match(h.video.src, /mobile-azure\.mp4$/);
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
  for (const title of ['Find your next move.', 'Know the market.', 'Compare your options.', 'Move with clarity.']) assert.ok(section.includes(title));
  assert.ok(html.indexOf('data-home-motion') > html.indexOf('id="main"'));
  assert.match(html, /src="\/assets\/home-motion.js" defer/);
  assert.match(section, /Play introduction with sound/);
  assert.match(section, /Includes AI-generated narration in Singapore English\./);
  assert.match(section, /<strong>Narration<\/strong>/);
  assert.match(section, /<strong>On-screen text and visuals<\/strong>/);
  for (const phrase of narration) assert.ok(section.includes(phrase), `missing narration: ${phrase}`);
  assert.doesNotMatch(section, /Silent video|Silent ·/);
});

const narration = [
  'Find your next move. Start with what matters.',
  'Know the market. Ask the right questions.',
  'Compare your options. Find what fits you.',
  'Move with clarity. Speak with Joe Tay.',
];

test('voiced media and caption deliverables remain local and within budget', () => {
  for (const format of ['desktop', 'mobile']) {
    const asset = new URL(`../assets/motion/joetay-next-move-${format}-azure.mp4`, import.meta.url);
    assert.ok(fs.statSync(asset).size < 1_000_000);
  }
  const captions = read('assets/motion/joetay-next-move-en-azure.vtt');
  assert.match(captions, /^WEBVTT/);
  const words = captions.split(/\r?\n/).filter(line => line && line !== 'WEBVTT' && !line.includes('-->') && !/^\d+$/.test(line)).join(' ');
  assert.equal(words, narration.join(' '), 'captions match the exact spoken transcript');
  const cues = [...captions.matchAll(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/g)];
  assert.equal(cues.length, 8);
  let previousEnd = 0;
  for (const cue of cues) {
    const values = cue.slice(1).map(Number);
    const start = values[0] * 3600 + values[1] * 60 + values[2] + values[3] / 1000;
    const end = values[4] * 3600 + values[5] * 60 + values[6] + values[7] / 1000;
    assert.ok(start >= previousEnd && end > start && end <= 16, 'captions stay ordered within the film');
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
  assert.equal(h.nodes['[data-motion-toggle]'].textContent, 'Play introduction with sound');
  h.click();
  h.video.muted = true;
  h.video.volume = 0.35;
  h.video.children[0].track.mode = 'disabled';
  h.click();
  assert.equal(h.nodes['[data-motion-status]'].textContent, 'Paused');
  h.click();
  assert.equal(h.video.muted, true);
  h.click('replay');
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
  h.click('replay');
  assert.equal(h.video.muted, false);
  assert.equal(h.nodes['[data-motion-status]'].textContent, 'Playing');
});
