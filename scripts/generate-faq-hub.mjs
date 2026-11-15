#!/usr/bin/env node
// Generates /faq/ — one page that answers the questions sellers and landlords
// ask most, grouped by topic (audit A3 / G6).
//
// Every question and answer is read from the FAQ structured data of the guide
// it links to, so the hub cannot say something its source page does not, and a
// correction to a guide reaches the hub on the next run. Nothing is written
// here. Run with --check in CI to fail on staleness.
//
//   node scripts/generate-faq-hub.mjs          # write faq/index.html
//   node scripts/generate-faq-hub.mjs --check  # verify it is current
//
// The hub carries no FAQPage markup of its own: the same questions are already
// marked up on their source pages, and Google asks for one marked-up instance
// of a repeated FAQ per site.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml } from './lib/consent-banner.mjs';
import { siteFooterHtml } from './lib/site-footer.mjs';
import { mobileHeaderAssetsHtml } from './lib/mobile-header.mjs';
import { siteHeaderHtml, SITE_THEME_ASSETS_HTML } from './lib/site-header.mjs';
import { fontLinksHtml } from './lib/self-hosted-fonts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'faq', 'index.html');
const URL = 'https://joetay.com/faq/';
const checkOnly = process.argv.includes('--check');

export const FAQ_TITLE = 'Selling & Renting Out Property: FAQ | PropertySG';
export const FAQ_HEADLINE = 'Selling and renting out property in Singapore: common questions';
export const FAQ_DESCRIPTION = 'Short answers on selling an HDB flat, MOP, timelines, valuation, agent commission, stamp duty and renting out, each linked to the full sourced guide.';

// Topic order follows a sale: can I sell, how, how long, at what price, what it
// costs. `skip` drops a question that another topic already answers.
export const FAQ_TOPICS = [
  {
    id: 'selling-hdb',
    title: 'Selling an HDB flat',
    source: 'insights/how-to-sell-hdb-flat-singapore.html',
    guide: 'How to sell an HDB flat: steps, fees and proceeds',
    skip: ['Can I get an HDB valuation before listing my flat?'],
  },
  {
    id: 'mop',
    title: 'MOP and your next home',
    source: 'insights/selling-hdb-after-mop-singapore.html',
    guide: 'Selling an HDB flat after MOP',
  },
  {
    id: 'timeline',
    title: 'How long a sale takes',
    source: 'insights/how-long-to-sell-hdb-singapore-2026.html',
    guide: 'How long it takes to sell an HDB flat',
  },
  {
    id: 'valuation',
    title: 'Valuation and price',
    source: 'insights/hdb-valuation-explained.html',
    guide: 'HDB valuation explained',
  },
  {
    id: 'commission',
    title: 'Agent commission',
    source: 'insights/property-agent-commission-singapore.html',
    guide: 'Property agent commission in Singapore',
  },
  {
    id: 'selling-condo',
    title: 'Selling a condo',
    source: 'insights/how-to-sell-condo-singapore.html',
    guide: 'How to sell a condo in Singapore',
  },
  {
    id: 'seller-stamp-duty',
    title: 'Seller’s Stamp Duty',
    source: 'insights/seller-stamp-duty-singapore.html',
    guide: 'Seller’s Stamp Duty explained',
  },
  {
    id: 'stamp-duty',
    title: 'Buyer’s stamp duties',
    source: 'stamp-duty-calculator/index.html',
    guide: 'Stamp duty calculator and rates',
    skip: ['What is Seller\'s Stamp Duty (SSD)?'],
  },
  {
    id: 'renting-out',
    title: 'Renting out your home',
    source: 'insights/renting-out-hdb-condo-singapore.html',
    guide: 'Renting out an HDB flat or condo',
  },
  {
    id: 'rental-market',
    title: 'Rents and yields',
    source: 'insights/singapore-rental-market-3q-2026.html',
    guide: 'Singapore rental market 3Q 2026: landlord guide',
  },
];

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function hrefFor(source) {
  return `/${source.replace(/index\.html$/, '')}`;
}

/** The FAQPage questions a page publishes, in page order. */
export function faqsOf(source, root = ROOT) {
  const file = path.join(root, source);
  if (!fs.existsSync(file)) return [];
  const html = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(match[1]); } catch { continue; }
    const nodes = Array.isArray(data) ? data : data['@graph'] || [data];
    for (const node of nodes) {
      if (node['@type'] !== 'FAQPage') continue;
      for (const item of node.mainEntity || []) out.push([item.name, item.acceptedAnswer.text]);
    }
  }
  return out;
}

/** Topics whose source page exists and publishes questions. */
export function loadTopics(root = ROOT) {
  return FAQ_TOPICS.map((topic) => ({
    ...topic,
    href: hrefFor(topic.source),
    faqs: faqsOf(topic.source, root).filter(([question]) => !(topic.skip || []).includes(question)),
  })).filter((topic) => topic.faqs.length);
}

function schemas() {
  return [
    {
      '@context': 'https://schema.org', '@type': 'WebPage', name: FAQ_HEADLINE, description: FAQ_DESCRIPTION,
      url: URL, inLanguage: 'en-SG',
      author: { '@type': 'Person', '@id': 'https://joetay.com/about-joe/#joe-tay', name: 'Joe Tay', url: 'https://joetay.com/about-joe/', identifier: 'CEA R009618D' },
      publisher: { '@type': 'RealEstateAgent', '@id': 'https://joetay.com/#agent', name: 'PropertySG', url: 'https://joetay.com/', alternateName: 'Joe Tay' },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://joetay.com/' },
        { '@type': 'ListItem', position: 2, name: 'FAQ', item: URL },
      ],
    },
  ].map((schema) => `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`).join('\n');
}

export function faqHubHtml(topics = loadTopics()) {
  const toc = topics.map((topic) => `    <li><a href="#${topic.id}">${esc(topic.title)}</a></li>`).join('\n');
  const sections = topics.map((topic) => `<h2 id="${topic.id}">${esc(topic.title)}</h2>
${topic.faqs.map(([question, answer]) => `<h3>${esc(question)}</h3>\n<p>${esc(answer)}</p>`).join('\n')}
<p class="faq-more">Full guide: <a href="${topic.href}">${esc(topic.guide)}</a></p>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en-SG">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(FAQ_TITLE)}</title>
<meta name="description" content="${esc(FAQ_DESCRIPTION)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0b1e3f">
<link rel="manifest" href="/site.webmanifest">
<link rel="canonical" href="${URL}">
<link rel="alternate" hreflang="en-SG" href="${URL}">
<link rel="alternate" hreflang="x-default" href="${URL}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PropertySG">
<meta property="og:title" content="${esc(FAQ_HEADLINE)}">
<meta property="og:description" content="${esc(FAQ_DESCRIPTION)}">
<meta property="og:url" content="${URL}">
<meta property="og:locale" content="en_SG">
<meta property="og:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(FAQ_HEADLINE)}">
<meta name="twitter:description" content="${esc(FAQ_DESCRIPTION)}">
<meta name="twitter:image" content="https://joetay.com/joetay-social-preview.jpg">
${schemas()}
${fontLinksHtml()}
<link rel="stylesheet" href="/insights/blog.css">
<style>.skip-link{position:absolute;left:-9999px;top:0;z-index:10050;background:#0b1e3f;color:#fff;padding:12px 20px;border-radius:0 0 10px 0;font-weight:700;text-decoration:none}.skip-link:focus{left:0;outline:2px solid #10b981;outline-offset:2px}
.faq-topics{columns:2;column-gap:32px;margin:0 0 8px;padding-left:20px}
.faq-topics li{margin:0 0 8px;break-inside:avoid}
.article-body h2[id]{scroll-margin-top:84px}
.article-body p.faq-more{margin-top:18px;font-weight:600}
@media(max-width:560px){.faq-topics{columns:1}}</style>
<script src="/assets/analytics-loader.js" defer data-meta="false"></script>
${SITE_THEME_ASSETS_HTML}
${mobileHeaderAssetsHtml()}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${siteHeaderHtml({ pagePath: '/faq/' })}
<main id="main" tabindex="-1" class="blog-main"><article class="article">
<div class="article-breadcrumb" role="navigation" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><span aria-current="page">FAQ</span></div>
<header class="article-header">
<h1 id="article-title">${esc(FAQ_HEADLINE)}</h1><p class="article-lede">Short answers to the questions owners ask most before they sell or rent out a home. Each answer comes from a longer guide that cites the official HDB, CPF Board, IRAS, URA or CEA page it relies on.</p>
<div class="article-byline"><picture><source type="image/webp" srcset="/joe-tay-propertysg-advisor-400.webp"><img src="/joe-tay-propertysg-advisor-400.jpg" alt="Joe Tay" width="40" height="40" loading="lazy" decoding="async"></picture><div>By <strong><a href="/about-joe/">Joe Tay</a></strong> · District Director, ERA Realty Network · CEA R009618D</div></div></header>
<section class="article-body" aria-labelledby="article-title">
<nav aria-labelledby="faq-topics-title"><p id="faq-topics-title"><strong>Topics</strong></p>
  <ul class="faq-topics">
${toc}
  </ul>
</nav>
${sections}
<div class="callout"><strong>Important</strong><p>These answers are general education, not legal, tax or financial advice. Rules and rates change; the linked guides name the official source for each figure, and the agency concerned applies the prevailing rules to your own case.</p></div>
<div class="article-cta">
  <h3>Have a question about your own home?</h3>
  <p>Ask Joe directly, or start with an indicative valuation built from registered sales near you. Free, no obligation.</p>
  <div class="article-cta-actions">
    <a href="/valuation.html">Get a free valuation →</a>
    <a class="article-cta-secondary" href="https://wa.me/6581881488?text=${encodeURIComponent('Hi Joe, I have a question about selling or renting out my property.')}" target="_blank" rel="noopener">WhatsApp Joe</a>
  </div>
</div>
</section></article></main>
<footer class="blog-footer">
${siteFooterHtml()}
<div class="blog-footer-inner"><p>&copy; 2026 PropertySG · <a href="/">Home</a> · <a href="/privacy-policy.html">Privacy Policy</a> · <a href="mailto:joe@joetay.com">joe@joetay.com</a></p><p class="creds">Joe Tay, District Director · ERA Realty Network Pte Ltd · Agency Lic. No. L3002382K · CEA Reg. No. R009618D</p></div>
</footer>
<script src="/assets/conversion-tracking.js" defer></script>
${consentBannerHtml()}
</body>
</html>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const topics = loadTopics();
  const output = faqHubHtml(topics);
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const count = topics.reduce((sum, topic) => sum + topic.faqs.length, 0);
  if (current === output) {
    console.log(`FAQ hub is current — ${count} questions in ${topics.length} topics`);
  } else if (checkOnly) {
    console.error('::error file=faq/index.html::FAQ hub is stale — run: node scripts/generate-faq-hub.mjs');
    process.exitCode = 1;
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, output);
    console.log(`FAQ hub written — ${count} questions in ${topics.length} topics`);
  }
}
