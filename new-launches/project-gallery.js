// Full-screen viewer for the project photo gallery.
//
// Progressive enhancement: every thumbnail is a plain link to the large image,
// so the gallery works without JavaScript. This intercepts those links and shows
// the image in a <dialog> with previous/next, arrow keys, swipe and Escape.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('a[data-gallery-item]'));
  if (!links.length || typeof HTMLDialogElement !== 'function') return;

  var dialog = document.createElement('dialog');
  dialog.className = 'project-lightbox';
  dialog.setAttribute('aria-label', 'Photo viewer');
  dialog.innerHTML =
    '<figure class="project-lightbox-figure"><img alt=""><figcaption></figcaption></figure>' +
    '<button type="button" class="project-lightbox-btn is-close" aria-label="Close photo viewer">×</button>' +
    '<button type="button" class="project-lightbox-btn is-prev" aria-label="Previous photo">‹</button>' +
    '<button type="button" class="project-lightbox-btn is-next" aria-label="Next photo">›</button>';
  document.body.appendChild(dialog);

  var img = dialog.querySelector('img');
  var caption = dialog.querySelector('figcaption');
  var index = 0;

  function show(i) {
    index = (i + links.length) % links.length;
    var link = links[index];
    var thumb = link.querySelector('img');
    img.src = link.getAttribute('href');
    img.alt = thumb ? thumb.alt : '';
    caption.textContent = (thumb ? thumb.alt : '') + ' · ' + (index + 1) + ' of ' + links.length;
  }

  links.forEach(function (link, i) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      show(i);
      dialog.showModal();
      if (typeof gtag === 'function') gtag('event', 'gallery_open', { image_index: i + 1 });
    });
  });

  dialog.querySelector('.is-close').addEventListener('click', function () { dialog.close(); });
  dialog.querySelector('.is-prev').addEventListener('click', function () { show(index - 1); });
  dialog.querySelector('.is-next').addEventListener('click', function () { show(index + 1); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
    // Browsers close a modal dialog on Escape themselves, but not all do it reliably; closing twice is harmless.
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); dialog.close(); }
  });

  var startX = null;
  dialog.addEventListener('touchstart', function (event) { startX = event.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', function (event) {
    if (startX === null) return;
    var dx = event.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
    startX = null;
  });
})();
