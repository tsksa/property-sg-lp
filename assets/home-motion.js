(function () {
  'use strict';
  var section = document.querySelector('[data-home-motion]');
  if (!section) return;
  var video = section.querySelector('video');
  var poster = section.querySelector('picture');
  var toggle = section.querySelector('[data-motion-toggle]');
  var replay = section.querySelector('[data-motion-replay]');
  var status = section.querySelector('[data-motion-status]');
  var narrow = window.matchMedia('(max-width: 640px)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var format = '';
  var playAttempt = 0;
  var captions = null;
  var started = false;

  function playLabel() {
    return started ? 'Play introduction' : 'Play introduction with sound';
  }
  function addCaptions() {
    if (captions) return;
    captions = document.createElement('track');
    captions.kind = 'captions';
    captions.srclang = 'en';
    captions.label = 'English';
    captions.default = true;
    // A track URL is attached only after the visitor explicitly chooses Play.
    captions.src = '/assets/motion/joetay-next-move-en.vtt';
    video.appendChild(captions);
    captions.track.mode = 'showing';
  }

  function loadVideo() {
    // Source resets must not undo a caption choice made through native controls.
    var mode = captions ? captions.track.mode : null;
    if (captions) captions.default = mode === 'showing';
    video.load();
    if (captions) captions.track.mode = mode;
  }

  function restorePoster(message) {
    playAttempt++;
    video.pause();
    video.hidden = true;
    poster.hidden = false;
    toggle.textContent = playLabel();
    status.textContent = message;
  }
  function selectFormat() {
    var next = narrow.matches ? 'mobile' : 'desktop';
    if (format === next) return;
    format = next;
    // Changing layout never downloads or starts the other film automatically.
    restorePoster('16 seconds · Narration and captions · Plays when you choose');
    video.removeAttribute('src');
    loadVideo();
  }
  function play() {
    addCaptions();
    if (video.ended) video.currentTime = 0;
    if (!video.getAttribute('src')) {
      video.src = '/assets/motion/joetay-next-move-' + format + '-voiced.mp4';
      loadVideo();
    }
    video.hidden = false;
    poster.hidden = true;
    var attempt = ++playAttempt;
    video.play().catch(function () {
      if (attempt !== playAttempt) return;
      restorePoster('Playback could not start. Try Play again, or read the transcript.');
    });
  }
  toggle.addEventListener('click', function () {
    if (video.paused) play();
    else video.pause();
  });
  replay.addEventListener('click', function () {
    video.currentTime = 0;
    play();
  });
  video.addEventListener('play', function () {
    started = true;
    toggle.textContent = 'Pause introduction';
    status.textContent = 'Playing';
  });
  video.addEventListener('pause', function () {
    playAttempt++;
    toggle.textContent = video.ended ? 'Replay introduction' : playLabel();
    status.textContent = video.ended ? 'Finished · Replay whenever you like' : 'Paused';
  });
  video.addEventListener('ended', function () {
    toggle.textContent = 'Replay introduction';
    status.textContent = 'Finished · Replay whenever you like';
  });
  video.addEventListener('error', function () {
    if (!video.getAttribute('src')) return;
    restorePoster('Video unavailable. You can still read the full transcript below.');
    video.removeAttribute('src');
    loadVideo();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) video.pause();
  });
  reduced.addEventListener('change', function () {
    if (reduced.matches) restorePoster('Reduced motion enabled · Play only when you choose');
  });
  narrow.addEventListener('change', selectFormat);
  section.querySelector('[data-motion-controls]').hidden = false;
  selectFormat();
})();
