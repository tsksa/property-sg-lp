// Fills a project page's unit-mix table with live prices and availability.
//
// The table is rendered statically (unit types, sizes, unit counts) so it reads
// fine to search engines and with JavaScript off. This only adds the figures
// that change daily, fetched from /.netlify/functions/era-prices, and only when
// that function says they passed its plausibility checks. Any failure leaves
// the static table and the "ask Joe for today's price list" line untouched —
// the page never shows a stale or partial price.
(function () {
  var section = document.querySelector('[data-project-live]');
  if (!section || !window.fetch) return;
  var slug = section.getAttribute('data-slug');
  if (!slug) return;

  var nf = new Intl.NumberFormat('en-SG');
  function money(value) {
    if (!(value > 0)) return '—';
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 'm';
    return '$' + nf.format(Math.round(value / 1000)) + 'k';
  }
  function psf(min, max) {
    if (!(min > 0)) return '—';
    return max > min ? '$' + nf.format(min) + '–' + nf.format(max) : '$' + nf.format(min);
  }
  function when(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });
  }
  function set(selector, text) {
    var el = section.querySelector(selector);
    if (el) el.textContent = text;
  }

  fetch('/.netlify/functions/era-prices?slug=' + encodeURIComponent(slug), { headers: { Accept: 'application/json' } })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (data) {
      if (!data || !data.live || !data.totals) return;

      var rows = {};
      (data.mix || []).forEach(function (row) { rows[row.type] = row; });
      section.querySelectorAll('tr[data-unit-type]').forEach(function (tr) {
        var row = rows[tr.getAttribute('data-unit-type')];
        if (!row) return;
        var soldOut = row.available === 0;
        tr.querySelector('[data-live="price"]').textContent = soldOut ? 'Sold out' : money(row.minPrice);
        tr.querySelector('[data-live="psf"]').textContent = soldOut ? '—' : psf(row.minPsf, row.maxPsf);
        tr.querySelector('[data-live="available"]').textContent = row.available == null ? '—' : nf.format(row.available);
        if (soldOut) tr.classList.add('is-sold-out');
      });

      set('[data-live-total="soldPercent"]', data.totals.soldPercent + '%');
      set('[data-live-total="available"]', nf.format(data.totals.available) + ' of ' + nf.format(data.totals.units));
      set('[data-live-total="from"]', money(data.priceRange && data.priceRange.min));
      set('[data-live-total="psf"]', data.psfRange ? psf(data.psfRange.min, data.psfRange.max) : '—');
      var bar = section.querySelector('[data-live-bar]');
      if (bar) bar.style.width = Math.max(0, Math.min(100, data.totals.soldPercent)) + '%';
      var summary = section.querySelector('[data-live-summary]');
      if (summary) summary.hidden = false;

      var status = section.querySelector('[data-live-status]');
      if (status) {
        status.textContent = '';
        status.appendChild(document.createTextNode('Live prices and availability as listed on '));
        var link = document.createElement('a');
        link.href = data.source.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = "ERA's project listing";
        status.appendChild(link);
        status.appendChild(document.createTextNode(', updated ' + when(data.fetchedAt) + '. '));
        var ask = document.createElement('a');
        ask.href = 'https://wa.me/6581881488?text=' + encodeURIComponent('Hi Joe, please send me the latest price list and available stacks for this project: ' + document.title);
        ask.target = '_blank';
        ask.rel = 'noopener';
        ask.textContent = 'Ask Joe for specific stacks and floors';
        status.appendChild(ask);
        status.appendChild(document.createTextNode('.'));
      }
      section.classList.add('is-live');
    })
    .catch(function () { /* static table and fallback copy stay as rendered */ });
})();
