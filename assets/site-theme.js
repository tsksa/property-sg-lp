(() => {
  const STORAGE_KEY = 'darkMode';
  const ROOT_CLASS = 'jt-theme-dark';

  function savedDarkMode() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function applyTheme(dark) {
    document.documentElement.classList.toggle(ROOT_CLASS, dark);
    document.body?.classList.toggle('dark-mode', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#061430' : '#faf6ec');
    for (const button of document.querySelectorAll('[data-jt-theme-toggle]')) {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      const icon = button.querySelector('[data-jt-theme-icon]');
      const text = button.querySelector('[data-jt-theme-label]');
      if (icon) icon.textContent = dark ? '☀' : '☾';
      if (text) text.textContent = dark ? 'Light' : 'Dark';
    }
  }

  function createToggle(extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `jt-theme-toggle ${extraClass}`.trim();
    button.dataset.jtThemeToggle = '';
    button.innerHTML = '<span data-jt-theme-icon aria-hidden="true"></span><span data-jt-theme-label></span>';
    return button;
  }

  function attach(button) {
    if (button.dataset.jtThemeReady === 'true') return;
    button.dataset.jtThemeReady = 'true';
    button.addEventListener('click', () => {
      const dark = !document.documentElement.classList.contains(ROOT_CLASS);
      try {
        localStorage.setItem(STORAGE_KEY, String(dark));
      } catch {
        // The mode still works for this page when storage is unavailable.
      }
      applyTheme(dark);
    });
  }

  function setupControls() {
    document.body?.classList.toggle('dark-mode', savedDarkMode());
    let controls = [...document.querySelectorAll('[data-jt-theme-toggle]')];

    if (!controls.length) {
      const primary = document.querySelector('header nav[aria-label="Primary"]');
      if (primary) {
        const desktop = createToggle('jt-theme-toggle-desktop');
        const cta = [...primary.querySelectorAll('a[href]')].find((link) => /cta/.test(link.className)) || primary.lastElementChild;
        primary.insertBefore(desktop, cta || null);
        controls.push(desktop);
      }
    }

    const mobilePanel = document.querySelector('.jt-mh-panel');
    if (mobilePanel && !mobilePanel.querySelector('[data-jt-theme-toggle]')) {
      const mobile = createToggle('jt-theme-toggle-mobile');
      mobilePanel.append(mobile);
      controls.push(mobile);
    }

    controls.forEach(attach);
    applyTheme(document.documentElement.classList.contains(ROOT_CLASS));
  }

  applyTheme(savedDarkMode());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupControls, { once: true });
  } else {
    setupControls();
  }
})();
