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
  const video = element({ hidden: true, paused: true, ended: false, currentTime: 0, rejectPlay: false,
    get src() { return source; }, set src(value) { source = value; },
    getAttribute() { return source; }, removeAttribute() { source = null; },
    load() { loads.push(source); },
    play() { if (this.rejectPlay) return Promise.reject(new Error('blocked')); this.paused = false; this.ended = false; this.emit('play'); return Promise.resolve(); },
    pause() { if (!this.paused) { this.paused = true; this.emit('pause'); } },
  });
  const nodes = { video, picture: element(), '[data-motion-toggle]': element(), '[data-motion-replay]': element(), '[data-motion-status]': element(), '[data-motion-controls]': element({ hidden: true }) };
  const narrow = element({ matches: mobile });
  const reduce = element({ matches: reduced });
  const document = element({ hidden: false, querySelector: () => ({ querySelector: (key) => nodes[key] }) });
  vm.runInNewContext(script, { document, window: { matchMedia: (query) => query.includes('640') ? narrow : reduce } });
  return { video, loads, nodes, narrow, reduce, document, click: (key = 'toggle') => nodes[`[data-motion-${key}]`].emit('click') };
}

test('homepage film never requests an MP4 until explicit playback, including reduced motion', async () => {
  for (const mobile of [false, true]) for (const reduced of [false, true]) {
    const h = harness({ mobile, reduced });
    assert.equal(h.video.src, null);
    assert.equal(h.video.hidden, true);
    assert.equal(h.nodes.picture.hidden, false);
    assert.ok(h.loads.every((src) => src === null));
    assert.equal(h.nodes['[data-motion-controls]'].hidden, false);
    h.click();
    await Promise.resolve();
    assert.equal(h.video.src, `/assets/motion/joetay-next-move-${mobile ? 'mobile' : 'desktop'}.mp4`);
    assert.equal(h.video.paused, false);
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
  assert.match(h.video.src, /mobile\.mp4$/);
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
  assert.match(h.video.src, /mobile\.mp4$/);
  assert.equal(h.video.paused, false);
  assert.equal(h.video.hidden, false);
  assert.equal(h.nodes.picture.hidden, true);
  assert.equal(h.nodes['[data-motion-status]'].textContent, 'Playing · Silent');
});

test('homepage ships a lazy poster, accessible transcript and local media under one megabyte each', () => {
  const html = read('index.html');
  const section = html.match(/<section class="jt-motion"[\s\S]*?<\/section>/)[0];
  assert.match(section, /<video hidden muted playsinline controls preload="none"/);
  assert.doesNotMatch(section, /autoplay|<video[^>]*\ssrc=/);
  assert.match(section, /loading="lazy"/);
  assert.match(section, /data-motion-controls hidden/);
  assert.match(section, /aria-describedby="next-move-transcript"/);
  for (const title of ['Find your next move.', 'Know the market.', 'Compare your options.', 'Move with clarity.']) assert.ok(section.includes(title));
  assert.ok(html.indexOf('data-home-motion') > html.indexOf('id="main"'));
  assert.match(html, /src="\/assets\/home-motion.js" defer/);
  for (const format of ['desktop', 'mobile']) {
    const asset = new URL(`../assets/motion/joetay-next-move-${format}.mp4`, import.meta.url);
    assert.ok(fs.statSync(asset).size < 1_000_000);
  }
});
