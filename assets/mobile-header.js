(() => {
  const HEADER_SELECTOR = 'header[data-jt-site-header]';
  const MOBILE_QUERY = window.matchMedia('(max-width: 1024px)');
  const MENU_LINKS = [
    ['/valuation.html', 'Valuation'],
    ['/neighbour-prices/', 'Sold Prices'],
    ['/new-launches/', 'New Launches'],
    ['/calculator/', 'Calculator'],
    ['/stamp-duty-calculator/', 'Stamp Duty'],
    ['/about-joe/', 'About Joe'],
    ['/insights/', 'Insights'],
  ];

  function buildMenu(id) {
    const menu = document.createElement('nav');
    menu.id = id;
    menu.className = 'jt-mh-panel';
    menu.setAttribute('aria-label', 'Mobile');
    menu.hidden = true;
    for (const [href, label] of MENU_LINKS) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      menu.append(link);
    }
    return menu;
  }

  function buildToggle(id) {
    const toggle = document.createElement('button');
    toggle.className = 'jt-mh-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', id);
    toggle.innerHTML = '<span></span><span></span><span></span>';
    return toggle;
  }

  function enhanceHeader(header, index) {
    if (header.dataset.jtMobileHeaderReady === 'true') return;
    const primary = header.querySelector('nav[aria-label="Primary"]');
    const inner = primary?.parentElement;
    const logo = inner?.querySelector('a[href="/"]');
    if (!primary || !inner || !logo) return;

    const links = [...primary.querySelectorAll('a[href]')];
    const cta = links.find((link) => /cta/.test(link.className)) || links.at(-1);
    if (!cta) return;

    header.dataset.jtMobileHeaderReady = 'true';
    header.classList.add('jt-mh-header');
    inner.classList.add('jt-mh-header-inner');
    primary.classList.add('jt-mh-source-nav');
    cta.classList.add('jt-mh-context-cta');
    logo.classList.add('jt-mh-logo');
    logo.innerHTML = '<span class="jt-mh-logo-name">Joe Tay</span><span class="jt-mh-logo-brand">PropertySG</span>';

    const menuId = `jtMobileMenu${index + 1}`;
    const toggle = buildToggle(menuId);
    const menu = buildMenu(menuId);
    inner.insertBefore(toggle, primary);
    document.body.append(menu);

    const focusable = () => [toggle, ...menu.querySelectorAll('a[href]'), cta].filter((item) => item.offsetParent !== null);
    const setMenuTop = () => menu.style.setProperty('--jt-mh-top', `${Math.max(0, header.getBoundingClientRect().bottom)}px`);
    const setOpen = (requestedOpen, restoreFocus = false) => {
      const open = Boolean(requestedOpen && MOBILE_QUERY.matches);
      menu.hidden = !open;
      menu.classList.toggle('jt-mh-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('jt-mobile-nav-open', open);
      if (open) {
        setMenuTop();
        menu.querySelector('a[href]')?.focus();
      } else if (restoreFocus) {
        toggle.focus();
      }
    };

    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true', true));
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a[href]')) setOpen(false);
    });
    cta.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (event) => {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false, true);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    MOBILE_QUERY.addEventListener('change', (event) => {
      if (!event.matches) setOpen(false);
    });
    window.addEventListener('resize', () => {
      if (toggle.getAttribute('aria-expanded') === 'true') setMenuTop();
    }, { passive: true });
  }

  document.querySelectorAll(HEADER_SELECTOR).forEach(enhanceHeader);

  // Bottom WhatsApp / Call bar on phones (audit U2). The header pill is at the
  // top of the screen, the hardest place to reach one-handed, and there was no
  // call option without opening the menu. Shown after the first scroll, hidden
  // while a form field has focus (the keyboard would push it over the field)
  // and while the menu is open. Pages that already carry their own bottom bar
  // (homepage, new-launch pages, ad landers) are left alone.
  const CONTACT_BAR_PATHS = [
    '/hdb-prices/',
    '/condo-prices/',
    '/neighbour-prices/',
    '/insights/',
    '/faq/',
    '/sell/guide/',
    '/glossary/',
    '/calculator/',
    '/stamp-duty-calculator/',
    '/bto-calculator/',
    '/renovation-loan-calculator/',
    '/about-joe/',
  ];
  const CONTACT_BAR_TEL = 'tel:+6581881488';
  const TEXT_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]),textarea,select';

  function initContactBar() {
    if (!CONTACT_BAR_PATHS.some((prefix) => window.location.pathname.startsWith(prefix))) return;
    if (document.querySelector('.mobile-bar,.nl-mobile-cta,.lp-wa-float')) return;
    const headerCta = document.querySelector(`${HEADER_SELECTOR} a.jt-sh-cta`);
    if (!headerCta) return;

    const phoneQuery = window.matchMedia('(max-width: 768px)');
    const bar = document.createElement('div');
    bar.className = 'jt-bb';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Quick contact');
    bar.hidden = true;

    const whatsapp = document.createElement('a');
    whatsapp.className = 'jt-bb-wa';
    whatsapp.href = headerCta.href;
    whatsapp.textContent = 'WhatsApp Joe';
    whatsapp.setAttribute('data-cta-location', 'mobile_bottom_bar');

    const call = document.createElement('a');
    call.className = 'jt-bb-call';
    call.href = CONTACT_BAR_TEL;
    call.textContent = 'Call Joe';
    call.setAttribute('data-cta-location', 'mobile_bottom_bar');

    bar.append(whatsapp, call);
    document.body.append(bar);

    let scrolled = false;
    let fieldFocused = false;
    const update = () => {
      const on = phoneQuery.matches && scrolled && !fieldFocused;
      bar.hidden = !on;
      document.body.classList.toggle('jt-bb-on', on);
    };
    const onScroll = () => {
      if (window.scrollY < 80) return;
      scrolled = true;
      window.removeEventListener('scroll', onScroll);
      update();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', (event) => {
      fieldFocused = Boolean(event.target.matches && event.target.matches(TEXT_FIELD));
      update();
    });
    document.addEventListener('focusout', () => {
      fieldFocused = false;
      update();
    });
    phoneQuery.addEventListener('change', update);
    onScroll();
  }

  initContactBar();
})();
