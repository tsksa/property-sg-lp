(function(){
  'use strict';

  // Progress bar + sticky nav + back-to-top scroll behaviour
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

  // Scroll reveal
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
  var filterStatus = document.getElementById('nlFilterStatus');
  if(chips.length && cards.length){
    chips.forEach(function(chip){
      chip.addEventListener('click', function(){
        var filter = chip.getAttribute('data-filter');
        chips.forEach(function(c){ c.classList.remove('active'); });
        chip.classList.add('active');
        var shown = 0;
        cards.forEach(function(card){
          var visible;
          if(filter === 'all'){ visible = true; }
          else {
            var region = card.getAttribute('data-region');
            var type = card.getAttribute('data-type');
            visible = region === filter || type === filter;
          }
          card.style.display = visible ? '' : 'none';
          if(visible) shown++;
        });
        // Announce the visible count to screen readers so they know the
        // filter took effect. role=status + aria-live=polite means the
        // SR speaks the update without interrupting whatever it's reading.
        if(filterStatus){
          var label = chip.textContent.trim();
          filterStatus.textContent = shown === 0
            ? 'No projects match "' + label + '".'
            : 'Showing ' + shown + ' project' + (shown === 1 ? '' : 's') + ' for "' + label + '".';
        }
      });
    });
  }

  // Smooth scroll for anchor links with sticky-nav offset
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var href = a.getAttribute('href');
      if(href.length < 2 || href === '#') return;
      var target = document.querySelector(href);
      if(!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({top:top, behavior:'smooth'});
    });
  });

  // Print factsheet
  window.printFactSheet = function(){ window.print(); };

  // ═══════════════════════════════════════════════════════════════════════
  // Lead capture routing: all VVIP / E-Brochure / Register-Interest CTAs
  // must land in a form. On detail pages that already have an inline
  // #projectForm, we scroll to it and surface the intent. On pages without
  // one (e.g. the index), we inject a modal form.
  // ═══════════════════════════════════════════════════════════════════════

  var INTENT_COPY = {
    vvip: {
      eyebrow: 'VVIP Preview',
      title: 'Register for VVIP preview pricing.',
      sub: 'Fill in the details below. I\'ll reply via WhatsApp within 10 minutes with current unit availability, indicative pricing, and the full developer e-brochure.',
      btn: 'Register my interest',
      formNote: 'VVIP preview — early-bird pricing before public launch',
      success: "I'll WhatsApp you within 10 minutes with VVIP preview pricing and unit availability."
    },
    ebrochure: {
      eyebrow: 'E-Brochure',
      title: 'Get the full developer e-brochure.',
      sub: 'Leave your contact details and I\'ll send the full e-brochure (floor plans, site plan, facility deck, and latest price list) via WhatsApp within 10 minutes.',
      btn: 'Send me the e-brochure',
      formNote: 'Full e-brochure — floor plans, price list, site plan',
      success: "I'll WhatsApp you the full e-brochure and latest price list within 10 minutes."
    },
    interest: {
      eyebrow: 'Register interest',
      title: 'Let me know you\'re interested.',
      sub: 'Leave your contact details and I\'ll get back via WhatsApp within 10 minutes with pricing, unit availability, and my honest read on whether this project fits your goals.',
      btn: 'Register my interest',
      formNote: 'General interest — pricing, units, honest take',
      success: "I'll WhatsApp you within 10 minutes with pricing, availability, and my honest take."
    }
  };

  // Detect the current project from the inline form script's PROJECT_NAME
  // fallback, otherwise leave blank for index-style pages.
  function getPageProject(){
    if(window.NL_PROJECT) return window.NL_PROJECT;
    // Fallback: infer from breadcrumb last span
    var crumb = document.querySelector('.nl-breadcrumb span:last-child');
    if(crumb && crumb.textContent && crumb.textContent.trim() !== 'New Launches'){
      return crumb.textContent.trim();
    }
    return '';
  }

  // Build the lead-capture modal once per page load.
  var modal, modalForm, modalEyebrow, modalTitle, modalSub, modalSubmit, modalProject, modalIntent, modalNote, modalSuccessTpl;
  // Time-on-form anti-spam: captured when the modal opens, sent on submit.
  // The Netlify Function drops submissions where this is < 3000ms.
  var modalOpenedAt = 0;
  // The document-level keydown handler is attached once at first buildModal()
  // and re-used across any subsequent rebuilds (e.g. tearing down after a
  // success state). The handler references `modal` via closure on the
  // module-scoped binding, so it always sees the current modal instance.
  var modalKeydownAttached = false;
  function buildModal(){
    if(modal) return;
    modal = document.createElement('div');
    modal.className = 'nl-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','nlModalTitle');
    modal.hidden = true;
    modal.innerHTML = ''
      + '<div class="nl-modal-overlay" data-close></div>'
      + '<div class="nl-modal-card">'
      +   '<button type="button" class="nl-modal-close" aria-label="Close" data-close><span aria-hidden="true">&times;</span></button>'
      +   '<div class="nl-modal-eyebrow" id="nlModalEyebrow"></div>'
      +   '<h3 id="nlModalTitle"></h3>'
      +   '<p class="nl-modal-sub" id="nlModalSub"></p>'
      +   '<form class="pf" id="nlModalForm" novalidate>'
      +     '<div class="pf-row">'
      +       '<input type="text" name="name" placeholder="Your name" autocomplete="name" required aria-label="Your name">'
      +       '<input type="tel" name="phone" placeholder="e.g. 8188 1488" autocomplete="tel" required pattern="^(\\+65[\\s\\-]?)?[689]\\d{3}[\\s\\-]?\\d{4}$" title="Singapore mobile (8 digits, starts with 6, 8, or 9)" aria-label="Phone number">'
      +     '</div>'
      +     '<div class="pf-row">'
      +       '<input type="email" name="email" placeholder="Email address" autocomplete="email" required aria-label="Email address">'
      +     '</div>'
      +     '<div class="pf-row" id="nlModalProjectRow" hidden>'
      +       '<select name="project_select" required aria-label="Which project?">'
      +         '<option value="" disabled selected>Which project?</option>'
      +         '<option>Newport Residences</option>'
      +         '<option>Tengah Garden Residences</option>'
      +         '<option>Vela Bay</option>'
      +         '<option>Faber Residence</option>'
      +         '<option>Zyon Grand</option>'
      +         '<option>River Modern</option>'
      +         '<option>Narra Residences</option>'
      +         '<option>The Serra Residences</option>'
      +         '<option>Dunearn House</option>'
      +         '<option>Former Thomson View</option>'
      +         '<option>Vela Bay / Bayshore</option>'
      +         '<option>Still exploring — any recommendation</option>'
      +       '</select>'
      +     '</div>'
      +     '<div class="pf-row">'
      +       '<select name="interest" aria-label="Bedroom preference">'
      +         '<option value="" disabled selected>Bedroom preference</option>'
      +         '<option>1 BR</option>'
      +         '<option>2 BR</option>'
      +         '<option>3 BR</option>'
      +         '<option>4 BR +</option>'
      +         '<option>Just exploring</option>'
      +       '</select>'
      +     '</div>'
      +     '<input type="hidden" name="project" id="nlModalProject">'
      +     '<input type="hidden" name="request_type" id="nlModalIntent">'
      +     '<div class="pf-hp"><label>Leave blank<input type="text" name="company_website" tabindex="-1" autocomplete="off"></label></div>'
      +     '<button type="submit" id="nlModalSubmit">Register my interest</button>'
      +     '<p class="pf-micro" id="nlModalNote">Free · No obligation · Reply within 10 minutes</p>'
      +   '</form>'
      + '</div>';
    document.body.appendChild(modal);
    modalForm = modal.querySelector('#nlModalForm');
    modalEyebrow = modal.querySelector('#nlModalEyebrow');
    modalTitle = modal.querySelector('#nlModalTitle');
    modalSub = modal.querySelector('#nlModalSub');
    modalSubmit = modal.querySelector('#nlModalSubmit');
    modalProject = modal.querySelector('#nlModalProject');
    modalIntent = modal.querySelector('#nlModalIntent');
    modalNote = modal.querySelector('#nlModalNote');

    modal.addEventListener('click', function(e){
      // Use closest so clicks on the inner aria-hidden span inside the close
      // button still resolve to the button's data-close attribute.
      if(e.target.closest('[data-close]')) closeModal();
    });
    if(!modalKeydownAttached){
      document.addEventListener('keydown', function(e){
        if(!modal || modal.hidden) return;
        if(e.key === 'Escape') { closeModal(); return; }
        // Focus trap: cycle Tab/Shift+Tab within the modal so screen-reader
        // and keyboard users can't tab into the page behind the dialog.
        if(e.key !== 'Tab') return;
        var focusable = modal.querySelectorAll(
          'button:not([disabled]),[href],input:not([type=hidden]):not([disabled]),' +
          'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        );
        if(!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length-1];
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      });
      modalKeydownAttached = true;
    }
    modalForm.addEventListener('submit', function(e){
      e.preventDefault();
      submitModal();
    });
  }

  function openModal(intent, project){
    // If a previous submission replaced .nl-modal-card with the success
    // state, the cached modalForm reference points at a detached node.
    // Tear down and rebuild so the next open starts on a fresh form.
    if(modal && (!modalForm || !modal.contains(modalForm))){
      modal.remove();
      modal = modalForm = modalEyebrow = modalTitle = modalSub = null;
      modalSubmit = modalProject = modalIntent = modalNote = null;
    }
    buildModal();
    var copy = INTENT_COPY[intent] || INTENT_COPY.interest;
    modalEyebrow.textContent = copy.eyebrow;
    modalTitle.textContent = project ? (copy.title.replace(/\.$/, '') + ' — ' + project + '.') : copy.title;
    modalSub.textContent = copy.sub;
    modalSubmit.textContent = copy.btn;
    modalNote.textContent = copy.formNote;
    modalProject.value = project || '';
    modalIntent.value = intent;
    // Show project-select only when we don't already know the project
    modal.querySelector('#nlModalProjectRow').hidden = !!project;
    // Remember what to focus on close (typically the trigger button).
    modal._returnFocusEl = document.activeElement;
    modalOpenedAt = Date.now();
    modal.hidden = false;
    document.body.classList.add('nl-modal-open');
    // Focus first input
    setTimeout(function(){ var f = modal.querySelector('input[name="name"]'); if(f) f.focus(); }, 50);
  }

  function closeModal(){
    if(!modal) return;
    modal.hidden = true;
    document.body.classList.remove('nl-modal-open');
    // Restore focus to whatever opened the modal so keyboard users don't
    // get dumped to the top of the page.
    try {
      if(modal._returnFocusEl && typeof modal._returnFocusEl.focus === 'function') {
        modal._returnFocusEl.focus();
      }
    } catch(_) { /* element may have unmounted; ignore */ }
    modal._returnFocusEl = null;
  }

  function submitModal(){
    if(modalForm.company_website.value) return;
    // The form has novalidate, so call reportValidity() explicitly to surface
    // the inputs' required/pattern/type=email constraints via native tooltips
    // instead of sending empty fields to the server only to alert() on the 400.
    if(!modalForm.reportValidity()) return;
    var original = modalSubmit.textContent;
    modalSubmit.disabled = true;
    modalSubmit.textContent = 'Submitting...';

    // UTM capture
    var params = new URLSearchParams(location.search);
    var UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    var utm = {};
    UTM_KEYS.forEach(function(k){ utm[k] = params.get(k) || ''; });

    var projectVal = modalProject.value || (modalForm.project_select ? modalForm.project_select.value : '') || '';
    var data = {
      lead_type: 'new_launch_registration',
      request_type: modalIntent.value,
      project: projectVal,
      full_name: modalForm.name.value.trim(),
      mobile_number: modalForm.phone.value.trim(),
      email: modalForm.email.value.trim(),
      interest: modalForm.interest.value,
      source_site: 'joetay.com',
      landing_page: location.pathname,
      submitted_at: new Date().toISOString(),
      time_on_form_ms: modalOpenedAt ? Date.now() - modalOpenedAt : null
    };
    Object.keys(utm).forEach(function(k){ data[k] = utm[k]; });

    fetch('/.netlify/functions/submit-lead', {
      method: 'POST',
      headers: {'Accept':'application/json','Content-Type':'application/json'},
      body: JSON.stringify(data)
    }).then(function(res){
      return res.json().catch(function(){ return {ok: res.ok}; });
    }).then(function(result){
      if(!result.ok) throw new Error('submit failed');
      var copy = INTENT_COPY[modalIntent.value] || INTENT_COPY.interest;
      modal.querySelector('.nl-modal-card').innerHTML = ''
        + '<button type="button" class="nl-modal-close" aria-label="Close" data-close><span aria-hidden="true">&times;</span></button>'
        + '<div class="pf-success" role="status" aria-live="polite">'
        +   '<div class="pf-success-icon" aria-hidden="true">✓</div>'
        +   '<h4>You\'re registered.</h4>'
        +   '<p>' + copy.success + '</p>'
        + '</div>';
      // Move focus to the close button so keyboard users have something
      // to act on (the submit button they were focused on is gone).
      // role=status above triggers screen-reader announcement of the
      // heading + body without stealing focus.
      var newClose = modal.querySelector('.nl-modal-close');
      if(newClose) newClose.focus();
      if(typeof gtag === 'function') gtag('event','generate_lead',{
        method: 'website_modal',
        lead_type: 'new_launch_registration',
        request_type: modalIntent.value,
        source_site: 'joetay.com',
        landing_page: location.pathname,
        project: projectVal
      });
      if(typeof fbq === 'function') fbq('track','Lead',{
        content_category: 'new_launch',
        content_name: projectVal || 'general'
      });
    }).catch(function(){
      modalSubmit.disabled = false;
      modalSubmit.textContent = original;
      alert("Sorry, something went wrong. Please try again or WhatsApp me at +65 8188 1488.");
    });
  }

  // Route all VVIP / E-Brochure / Interest CTAs through a form.
  // 1) Explicit markers: elements with data-lead="vvip|ebrochure|interest".
  // 2) Heuristic fallback: catch legacy WhatsApp e-brochure links and
  //    anchors to #projectForm / #register / #projectForm by button text.
  function interceptLead(e, intent, el){
    var inlineForm = document.getElementById('projectForm');
    if(inlineForm){
      e.preventDefault();
      // Scroll to inline form
      var top = inlineForm.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({top:top, behavior:'smooth'});
      // Tag the form (dataset) AND set a hidden input so page-level submit
      // handlers that read form.request_type.value pick it up automatically.
      inlineForm.dataset.requestType = intent;
      var hidden = inlineForm.querySelector('input[name="request_type"]');
      if(!hidden){
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'request_type';
        inlineForm.appendChild(hidden);
      }
      hidden.value = intent;
      // Surface intent via a small floating label at the top of the form card
      var card = inlineForm.closest('.project-form-card');
      if(card){
        var tag = card.querySelector('.pf-intent');
        if(!tag){
          tag = document.createElement('div');
          tag.className = 'pf-intent';
          var h = card.querySelector('h3');
          if(h) h.parentNode.insertBefore(tag, h);
        }
        tag.textContent = INTENT_COPY[intent] ? INTENT_COPY[intent].eyebrow + ' request' : 'Registration';
      }
      setTimeout(function(){
        var firstInput = inlineForm.querySelector('input[name="name"]');
        if(firstInput) firstInput.focus({preventScroll:true});
      }, 420);
      return;
    }
    // No inline form → open modal
    e.preventDefault();
    openModal(intent, getPageProject());
  }

  // Explicit data-lead bindings
  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-lead]');
    if(!el) return;
    var intent = el.getAttribute('data-lead');
    interceptLead(e, intent, el);
  });

  // Heuristic: catch legacy CTAs we haven't annotated yet
  function isEBrochureLink(a){
    var href = (a.getAttribute('href') || '').toLowerCase();
    var text = (a.textContent || '').toLowerCase();
    if(href.indexOf('wa.me') === -1) return false;
    return text.indexOf('e-brochure') !== -1 || text.indexOf('brochure') !== -1 || href.indexOf('e-brochure') !== -1 || href.indexOf('brochure') !== -1;
  }
  function isVvipAnchor(a){
    var href = (a.getAttribute('href') || '').toLowerCase();
    var text = (a.textContent || '').toLowerCase();
    if(href !== '#projectform' && href !== '#register') return false;
    return text.indexOf('vvip') !== -1 || text.indexOf('vip preview') !== -1 || text.indexOf('register') !== -1;
  }
  document.querySelectorAll('a[href]').forEach(function(a){
    if(a.hasAttribute('data-lead')) return;
    if(isEBrochureLink(a)){
      a.addEventListener('click', function(e){ interceptLead(e, 'ebrochure', a); });
    } else if(isVvipAnchor(a)){
      // Only route VVIP intent through modal when there's no inline form.
      // If an inline form exists, default smooth-scroll behaviour is fine.
      if(!document.getElementById('projectForm')){
        a.addEventListener('click', function(e){ interceptLead(e, 'vvip', a); });
      }
    }
  });
})();
