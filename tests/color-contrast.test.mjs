import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINIMUM_AA_RATIO = 4.5;
const sourceCache = new Map();

function source(file) {
  if (!sourceCache.has(file)) {
    sourceCache.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }
  return sourceCache.get(file);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function declaration(file, selector, property) {
  const rules = source(file).matchAll(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g'),
  );
  let matchedRule = false;

  for (const rule of rules) {
    matchedRule = true;
    const value = rule[1].match(
      new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;}]+)`),
    );
    if (value) return value[1].trim();
  }

  assert.ok(matchedRule, `${file}: missing CSS rule ${selector}`);
  assert.fail(`${file}: ${selector} is missing ${property}`);
}

function variables(file) {
  const values = new Map();
  for (const match of source(file).matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    values.set(match[1], match[2].trim());
  }
  return values;
}

function parseHex(value) {
  const hex = value.slice(1);
  if (hex.length === 3) {
    return [...hex].map((part) => parseInt(part + part, 16));
  }
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function blend(foreground, background, alpha) {
  return foreground.map((channel, index) =>
    Math.round(channel * alpha + background[index] * (1 - alpha)),
  );
}

function resolveColor(file, value, backdrop = '#ffffff') {
  const variable = value.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (variable) {
    const resolved = variables(file).get(variable[1]);
    assert.ok(resolved, `${file}: missing CSS variable --${variable[1]}`);
    return resolveColor(file, resolved, backdrop);
  }

  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) {
    return parseHex(value);
  }

  const rgb = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    return alpha === 1
      ? channels
      : blend(channels, resolveColor(file, backdrop), alpha);
  }

  assert.fail(`${file}: unsupported colour value ${value}`);
}

function luminance([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function cssColour(file, selector, property, backdrop) {
  return resolveColor(file, declaration(file, selector, property), backdrop);
}

const cases = [
  {
    name: 'valuation eyebrow',
    file: 'valuation.html',
    foreground: ['.val-eyebrow', 'color'],
    background: ['.val-eyebrow', 'background', '#faf6ec'],
  },
  {
    name: 'valuation optional label',
    file: 'valuation.html',
    foreground: ['.val-optional', 'color'],
    background: '#ffffff',
  },
  {
    name: 'valuation submit button',
    file: 'valuation.html',
    foreground: ['.val-submit', 'color'],
    background: ['.val-submit', 'background'],
  },
  {
    name: 'calculator skip link',
    file: 'calculator/index.html',
    foreground: ['a', 'color'],
    background: '#f7f5ef',
  },
  {
    name: 'calculator navigation CTA',
    file: 'calculator/index.html',
    foreground: ['.calc-nav .calc-nav-cta', 'color'],
    background: ['.calc-nav .calc-nav-cta', 'background'],
  },
  {
    name: 'calculator eyebrow',
    file: 'calculator/index.html',
    foreground: ['.calc-hero .eyebrow', 'color'],
    background: '#ffffff',
  },
  {
    name: 'calculator form helper',
    file: 'calculator/index.html',
    foreground: ['.calc-form .sub', 'color'],
    background: '#ffffff',
  },
  {
    name: 'calculator results CTA',
    file: 'calculator/index.html',
    foreground: ['.calc-cta p', 'color'],
    background: ['.calc-cta', 'background'],
  },
  {
    name: 'calculator WhatsApp CTA',
    file: 'calculator/index.html',
    foreground: ['.calc-cta a.calc-cta-whatsapp', 'color'],
    background: ['.calc-cta a.calc-cta-whatsapp', 'background'],
  },
  {
    name: 'calculator disclaimer',
    file: 'calculator/index.html',
    foreground: ['.calc-disclaimer', 'color'],
    background: '#f7f5ef',
  },
  {
    name: 'calculator footer',
    file: 'calculator/index.html',
    foreground: ['.calc-footer', 'color'],
    background: ['.calc-footer', 'background'],
  },
  {
    name: 'calculator credentials',
    file: 'calculator/index.html',
    foreground: ['.calc-footer .creds', 'color'],
    background: ['.calc-footer', 'background'],
  },
  {
    name: 'homepage recent activity heading',
    file: 'index.html',
    foreground: ['.recent-activity-head', 'color'],
    background: ['.recent-activity', 'background'],
  },
  {
    name: 'homepage recent activity badge',
    file: 'index.html',
    foreground: ['.recent-card-badge', 'color'],
    background: ['.recent-card-badge', 'background', '#ffffff'],
  },
  {
    name: 'homepage newsletter description',
    file: 'index.html',
    foreground: ['.footer-newsletter-text span', 'color'],
    background: ['footer', 'background'],
  },
  {
    name: 'homepage footer links and legal text',
    file: 'index.html',
    foreground: ['.footer-bottom', 'color'],
    background: ['footer', 'background'],
  },
  {
    name: 'homepage WhatsApp button',
    file: 'index.html',
    foreground: ['.mobile-bar .mb-wa', 'color'],
    background: ['.mobile-bar .mb-wa', 'background'],
  },
  {
    name: 'homepage cookie accept button',
    file: 'index.html',
    foreground: ['.cookie-banner button', 'color'],
    background: ['.cookie-banner button', 'background'],
  },
  {
    // The shared header nav (scripts/lib/header-nav.mjs) sits on the estate
    // pages' navy gradient. Its colours are pinned literals rather than var()
    // references, so nothing else in the page can correct them — assert both the
    // plain links and the CTA here so a palette edit cannot quietly fail AA.
    name: 'estate header nav links',
    file: 'hdb-prices/ang-mo-kio/index.html',
    foreground: ['.jt-hn a', 'color'],
    background: '#061430',
  },
  {
    name: 'estate header nav CTA',
    file: 'hdb-prices/ang-mo-kio/index.html',
    foreground: ['.jt-hn a.jt-hn-cta', 'color'],
    background: ['.jt-hn a.jt-hn-cta', 'background'],
  },
  {
    name: 'insights skip link',
    file: 'insights/blog.css',
    foreground: ['a', 'color'],
    background: '#ffffff',
  },
  {
    name: 'insights navigation CTA',
    file: 'insights/blog.css',
    foreground: ['.blog-nav .blog-nav-cta', 'color'],
    background: ['.blog-nav .blog-nav-cta', 'background'],
  },
  {
    name: 'insights card metadata',
    file: 'insights/blog.css',
    foreground: ['.blog-card-meta', 'color'],
    background: '#ffffff',
  },
  {
    name: 'insights article metadata',
    file: 'insights/blog.css',
    foreground: ['.article-meta-top', 'color'],
    background: '#ffffff',
  },
  {
    name: 'insights card category',
    file: 'insights/blog.css',
    foreground: ['.blog-card-meta .cat', 'color'],
    background: '#ffffff',
  },
  {
    name: 'insights read-more link',
    file: 'insights/blog.css',
    foreground: ['.blog-card .read-more', 'color'],
    background: '#ffffff',
  },
  {
    name: 'insights WhatsApp CTA',
    file: 'insights/blog.css',
    foreground: ['.insights-whatsapp-cta', 'color'],
    background: ['.insights-whatsapp-cta', 'background'],
  },
  {
    name: 'insights footer',
    file: 'insights/blog.css',
    foreground: ['.blog-footer', 'color'],
    background: ['.blog-footer', 'background'],
  },
  {
    name: 'insights credentials',
    file: 'insights/blog.css',
    foreground: ['.blog-footer .creds', 'color'],
    background: ['.blog-footer', 'background'],
  },
  {
    name: 'new-launch hero eyebrow',
    file: 'new-launches/new-launches.css',
    foreground: ['.nl-hero .eyebrow', 'color'],
    background: ['.nl-hero .eyebrow', 'background', '#ffffff'],
  },
];

for (const contrastCase of cases) {
  test(`${contrastCase.name} meets WCAG AA contrast`, () => {
    const foreground = cssColour(
      contrastCase.file,
      contrastCase.foreground[0],
      contrastCase.foreground[1],
      contrastCase.foreground[2],
    );
    const background = Array.isArray(contrastCase.background)
      ? cssColour(
          contrastCase.file,
          contrastCase.background[0],
          contrastCase.background[1],
          contrastCase.background[2],
        )
      : resolveColor(contrastCase.file, contrastCase.background);
    const ratio = contrastRatio(foreground, background);

    assert.ok(
      ratio >= MINIMUM_AA_RATIO,
      `${contrastCase.name}: expected at least ${MINIMUM_AA_RATIO}:1, got ${ratio.toFixed(2)}:1`,
    );
  });
}
