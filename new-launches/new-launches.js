(function(){
  'use strict';

  // Progress bar
  var progress = document.querySelector('.nl-progress');
  var topbar = document.querySelector('.nl-topbar');
  var toTop = document.querySelector('.nl-to-top');

  function onScroll(){
    var h = document.documentElement;
    var scrolled = h.scrollTop;
    var height = h.scrollHeight - h.clientHeight;
    var pct = height > 0 ? (scrolled / height) * 100 : 0;
    if(progress) progress.style.width = pct + '%';
    if(topbar){
      if(scrolled > 60) topbar.classList.add('scrolled');
      else topbar.classList.remove('scrolled');
    }
    if(toTop){
      if(scrolled > 480) toTop.classList.add('visible');
      else toTop.classList.remove('visible');
    }
  }

  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  if(toTop){
    toTop.addEventListener('click', function(){
      window.scrollTo({top:0, behavior:'smooth'});
    });
  }

  // Scroll reveal via IntersectionObserver
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, {threshold:0.12, rootMargin:'0px 0px -40px 0px'});

    document.querySelectorAll('.reveal, .reveal-stagger').forEach(function(el){
      io.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal, .reveal-stagger').forEach(function(el){
      el.classList.add('in');
    });
  }

  // Filter chips (index only — no-op if filter not present)
  var chips = document.querySelectorAll('.nl-chip');
  var cards = document.querySelectorAll('.nl-card[data-region]');
  if(chips.length && cards.length){
    chips.forEach(function(chip){
      chip.addEventListener('click', function(){
        var filter = chip.getAttribute('data-filter');
        chips.forEach(function(c){ c.classList.remove('active'); });
        chip.classList.add('active');
        cards.forEach(function(card){
          if(filter === 'all'){ card.style.display = ''; return; }
          var region = card.getAttribute('data-region');
          var type = card.getAttribute('data-type');
          if(region === filter || type === filter) card.style.display = '';
          else card.style.display = 'none';
        });
      });
    });
  }

  // Smooth scroll for same-page anchors (for older Safari)
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var href = a.getAttribute('href');
      if(href.length < 2) return;
      var target = document.querySelector(href);
      if(!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({top:top, behavior:'smooth'});
    });
  });

  // Print factsheet helper
  window.printFactSheet = function(){
    window.print();
  };
})();
