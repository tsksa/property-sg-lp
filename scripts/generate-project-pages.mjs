#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'new-launches', 'projects.json');
const CONTENT_PATH = path.join(ROOT, 'new-launches', 'project-page-content.json');
const MANIFEST_PATH = path.join(ROOT, 'new-launches', 'project-page-manifest.json');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const sourceNames = new Map(
  Object.entries(data.sources).map(([id, source]) => [id, source.name]),
);

const PROPERTY_TYPES = {
  condominium: 'Condominium',
  'executive-condominium': 'Executive condominium',
  landed: 'Landed',
};
const TENURES = {
  freehold: 'Freehold',
  '99-year': '99-year leasehold',
  '999-year': '999-year leasehold',
};
const STATUSES = {
  selling: 'Selling now',
  upcoming: 'Upcoming',
  'sold-out': 'Sold out',
};

const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const jsonForHtml = (value) => JSON.stringify(value, null, 2).replaceAll('<', '\\u003c');

function formatDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMoney(value) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${millions.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}m`;
  }
  return `$${new Intl.NumberFormat('en-SG').format(value)}`;
}

function launchCopy(project) {
  const parts = [];
  if (project.previewDate) parts.push(`Preview ${formatDate(project.previewDate)}`);
  if (project.bookingDate) parts.push(`Booking ${formatDate(project.bookingDate)}`);
  if (!parts.length && project.launchWindow) {
    const label = project.launchWindow.replace(/^(\d{4})-Q([1-4])$/, 'Q$2 $1');
    parts.push(`Provisional launch window: ${label}`);
  }
  return parts.join(' · ') || 'Launch timing not yet confirmed';
}

function isFresh(field) {
  if (field.value == null || !field.asOf) return false;
  const inventory = new Date(`${data.inventoryAsOf}T00:00:00Z`);
  const asOf = new Date(`${field.asOf}T00:00:00Z`);
  return (inventory - asOf) / 86_400_000 <= data.dynamicFreshnessDays;
}

function marketCopy(project) {
  const facts = [];
  if (isFresh(project.priceFrom)) facts.push(`From ${formatMoney(project.priceFrom.value)}`);
  if (isFresh(project.averagePsf)) facts.push(`Average $${new Intl.NumberFormat('en-SG').format(project.averagePsf.value)} psf`);
  if (isFresh(project.soldPercent)) facts.push(`${project.soldPercent.value}% sold`);
  if (facts.length) {
    const asOf = project.priceFrom.asOf || project.averagePsf.asOf || project.soldPercent.asOf;
    return `${facts.join(' · ')} · as of ${formatDate(asOf)}`;
  }
  if (project.status === 'selling') return 'Selling now—check availability.';
  if (project.status === 'sold-out') return 'Sold out—ask for current alternatives.';
  return 'Ask for latest price';
}

function description(project) {
  return `${project.name} is a ${TENURES[project.tenure].toLowerCase()} ${PROPERTY_TYPES[project.propertyType].toLowerCase()} at ${project.location}, ${project.district}, with ${new Intl.NumberFormat('en-SG').format(project.unitCount)} homes by ${project.developer}. Verified project facts and current market status from PropertySG.`;
}

function projectJson(project) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Residence',
    name: project.name,
    description: description(project),
    url: project.canonicalUrl,
    address: {
      '@type': 'PostalAddress',
      streetAddress: project.location,
      addressRegion: project.district,
      addressCountry: 'SG',
    },
    numberOfAccommodationUnits: project.unitCount,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Status', value: STATUSES[project.status] },
      { '@type': 'PropertyValue', name: 'Tenure', value: TENURES[project.tenure] },
      { '@type': 'PropertyValue', name: 'Region', value: project.region },
      { '@type': 'PropertyValue', name: 'Verified', value: project.verifiedAt },
    ],
  };
}

function breadcrumbJson(project) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://joetay.com/' },
      { '@type': 'ListItem', position: 2, name: 'New Launches', item: 'https://joetay.com/new-launches/' },
      { '@type': 'ListItem', position: 3, name: project.name, item: project.canonicalUrl },
    ],
  };
}

function alternativesFor(project) {
  return data.projects
    .filter((candidate) => candidate.slug !== project.slug && candidate.status !== 'sold-out')
    .sort((left, right) => {
      const leftScore = Number(left.region === project.region) * 2 + Number(left.propertyType === project.propertyType);
      const rightScore = Number(right.region === project.region) * 2 + Number(right.propertyType === project.propertyType);
      return rightScore - leftScore || left.name.localeCompare(right.name);
    })
    .slice(0, 3);
}

function sourceSection(project) {
  const categories = [
    ['Project facts', project.provenance.facts],
    ['Launch timing', project.provenance.timing],
    ['Sales status', project.provenance.status],
    ['Market figures', project.provenance.dynamics],
  ];
  return `<div class="project-source-list" aria-label="Verification source categories">
${categories.map(([label, ids]) => `  <div><strong>${esc(label)}</strong><span>${esc(ids.map((id) => sourceNames.get(id) || id).join(' · ') || 'No dynamic source used')}</span></div>`).join('\n')}
</div>`;
}

function statsHtml(project) {
  return `<div class="project-stats" role="list" aria-label="Project key facts">
  <div class="project-stat" role="listitem"><div class="project-stat-label">Status</div><div class="project-stat-value">${esc(STATUSES[project.status])}</div></div>
  <div class="project-stat" role="listitem"><div class="project-stat-label">District</div><div class="project-stat-value">${esc(project.district)} · ${esc(project.region)}</div></div>
  <div class="project-stat" role="listitem"><div class="project-stat-label">Tenure</div><div class="project-stat-value">${esc(TENURES[project.tenure])}</div></div>
  <div class="project-stat" role="listitem"><div class="project-stat-label">Units</div><div class="project-stat-value">${new Intl.NumberFormat('en-SG').format(project.unitCount)}</div></div>
</div>`;
}

function heroCtas(project) {
  const message = encodeURIComponent(`Hi Joe, please send me the latest price list and floor plans for ${project.name}.`);
  return `<div class="project-hero-ctas">
  <a href="https://wa.me/6581881488?text=${message}" target="_blank" rel="noopener" class="project-hero-cta primary">WhatsApp for price list &amp; floor plans</a>
  <a href="#projectForm" class="project-hero-cta ghost">Use the enquiry form</a>
</div>`;
}

function contactSection(project) {
  const message = encodeURIComponent(`Hi Joe, please help me compare ${project.name} with active alternatives.`);
  const heading = project.status === 'sold-out'
    ? 'Compare the current alternatives.'
    : 'Check the live unit list before deciding.';
  const body = project.status === 'sold-out'
    ? 'This project is sold out. Ask Joe for the closest active alternatives and their current availability.'
    : 'Ask for current availability, floor plans and a direct comparison with the three active alternatives.';
  return `<section class="nl-register-band reveal" id="register" aria-label="Contact Joe"><div class="nl-register-band-inner"><h3>${heading}</h3><p>${body}</p><a href="https://wa.me/6581881488?text=${message}" target="_blank" rel="noopener">WhatsApp Joe →</a></div></section>`;
}

function verificationStrip(project) {
  return `<section class="project-dev-strip reveal" aria-label="Verified project summary">
  <div class="project-dev-strip-inner">
    <div class="project-verification-head"><span class="project-status-pill">${esc(STATUSES[project.status])}</span><strong>Verified ${esc(formatDate(project.verifiedAt))}</strong></div>
    <div class="project-dev-meta">
      <div class="project-dev-item"><span class="project-dev-item-label">Developer</span><span class="project-dev-item-value">${esc(project.developer)}</span></div>
      <div class="project-dev-item"><span class="project-dev-item-label">Location</span><span class="project-dev-item-value">${esc(project.location)}</span></div>
      <div class="project-dev-item"><span class="project-dev-item-label">Property type</span><span class="project-dev-item-value">${esc(PROPERTY_TYPES[project.propertyType])}</span></div>
      <div class="project-dev-item"><span class="project-dev-item-label">Launch timing</span><span class="project-dev-item-value">${esc(launchCopy(project))}</span></div>
    </div>
  </div>
</section>`;
}

function factsheetSection(project) {
  return `<section class="project-factsheet reveal" aria-labelledby="verified-facts-${esc(project.slug)}">
  <div class="project-factsheet-inner">
    <div class="project-factsheet-head"><div class="project-factsheet-head-left"><div class="project-eyebrow">Dataset-backed facts</div><h2 id="verified-facts-${esc(project.slug)}" class="project-section-title">${esc(project.name)} at a glance.</h2></div></div>
    <div class="project-factsheet-panel">
      <div class="project-factsheet-grid">
        <div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">Project</div><div class="project-factsheet-val">${esc(project.name)}</div></div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">Location</div><div class="project-factsheet-val">${esc(project.location)}</div></div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">Developer</div><div class="project-factsheet-val">${esc(project.developer)}</div></div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">Type</div><div class="project-factsheet-val">${esc(PROPERTY_TYPES[project.propertyType])}</div></div>
        </div>
        <div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">District</div><div class="project-factsheet-val">${esc(project.district)} · ${esc(project.region)}</div></div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">Tenure</div><div class="project-factsheet-val">${esc(TENURES[project.tenure])}</div></div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">Total units</div><div class="project-factsheet-val">${new Intl.NumberFormat('en-SG').format(project.unitCount)}</div></div>
          <div class="project-factsheet-row"><div class="project-factsheet-key">Launch</div><div class="project-factsheet-val">${esc(launchCopy(project))}</div></div>
        </div>
      </div>
      <div class="project-market-callout"><strong>${esc(marketCopy(project))}</strong><span>Dynamic figures are shown only when verified within ${data.dynamicFreshnessDays} days of the ${esc(formatDate(data.inventoryAsOf))} inventory.</span></div>
      <p class="project-factsheet-note">Status and core facts verified ${esc(formatDate(project.verifiedAt))}. Developer confirmation and the latest available unit list remain decisive before purchase.</p>
      ${sourceSection(project)}
    </div>
  </div>
</section>`;
}

function takeSection(project) {
  const copy = content[project.slug];
  if (!copy) throw new Error(`Missing project-page content for ${project.slug}`);
  const market = marketCopy(project);
  return `<section class="project-take reveal" aria-labelledby="joe-take-${esc(project.slug)}" data-approval="approved" data-approved-at="2026-08-02">
  <div class="project-take-inner">
    <div class="project-take-quote" aria-hidden="true">&ldquo;</div>
    <div class="project-eyebrow">Joe’s approved take</div>
    <h2 id="joe-take-${esc(project.slug)}">Joe’s Take: ${esc(project.name)}</h2>
    <div class="project-take-body">
      <p>This project is best suited to ${esc(copy.fit)}. The verified record places ${esc(project.name)} at ${esc(project.location)} in ${esc(project.district)}, with ${new Intl.NumberFormat('en-SG').format(project.unitCount)} homes on a ${esc(TENURES[project.tenure].toLowerCase())} tenure by ${esc(project.developer)}. That makes buyer fit more important than a generic “best launch” label.</p>
      <p>${esc(copy.advantage)} The current verified market line is: ${esc(market)} Those figures are a dated snapshot, not a promise of today’s unit availability, and the exact stack, floor and layout still determine whether the price is sensible.</p>
      <p>${esc(copy.risk)} Before choosing, compare three things: the live unit list, the total entry quantum and the most credible active alternatives. I would only shortlist the project when those checks support the buyer’s own timeline and exit plan—not because a launch headline creates urgency.</p>
    </div>
    <div class="project-take-sig"><span class="project-take-sig-line"><strong>Approved by Joe Tay</strong> · 2 Aug 2026</span></div>
  </div>
</section>`;
}

function relatedSection(project) {
  const alternatives = alternativesFor(project);
  return `<section class="project-related reveal" aria-labelledby="alternatives-${esc(project.slug)}">
  <div class="project-related-inner">
    <div class="project-related-head"><div><div class="project-eyebrow">Compare before deciding</div><h2 id="alternatives-${esc(project.slug)}">Three active alternatives.</h2></div></div>
    <div class="project-related-grid">
${alternatives.map((alternative) => `      <a href="${esc(new URL(alternative.canonicalUrl).pathname)}" class="project-related-card"><div class="project-related-card-body"><div class="project-related-card-meta">${esc(alternative.district)} · ${esc(alternative.region)} · ${esc(STATUSES[alternative.status])}</div><div class="project-related-card-title">${esc(alternative.name)}</div><div class="project-related-card-cta">Compare</div></div></a>`).join('\n')}
    </div>
  </div>
</section>`;
}

function formCard(project) {
  return `<div class="project-form-card">
  <h2>Ask about ${esc(project.name)}</h2>
  <p class="sub">The latest unit list and floor plans will be confirmed by WhatsApp. This form is the secondary contact option.</p>
  <form id="projectForm" class="pf" novalidate data-project="${esc(project.name)}" data-landing-page="${esc(new URL(project.canonicalUrl).pathname)}">
    <div class="pf-row"><input type="text" name="name" placeholder="Your name" autocomplete="name" required aria-label="Your name"><input type="tel" name="phone" placeholder="e.g. 9123 4567" autocomplete="tel" required aria-label="Phone number"></div>
    <div class="pf-row"><input type="email" name="email" placeholder="Email address" autocomplete="email" required aria-label="Email address"></div>
    <div class="pf-row"><select name="interest" required aria-label="Bedroom preference"><option value="" disabled selected>Bedroom preference</option><option>1 BR</option><option>2 BR</option><option>3 BR</option><option>4 BR +</option><option>Just exploring</option></select></div>
    <div class="pf-hp"><label>Leave blank<input type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true"></label></div>
    <button type="submit">Send enquiry →</button>
    <p class="pf-micro">CEA R009618D · ERA District Director · No obligation</p>
  </form>
</div>`;
}

function head(project) {
  const title = `${project.name} | Verified ${project.district} New Launch | PropertySG`;
  const meta = description(project);
  return `<!DOCTYPE html>
<html lang="en-SG">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0b1e3f">
<link rel="canonical" href="${esc(project.canonicalUrl)}">
<link rel="alternate" hreflang="en-SG" href="${esc(project.canonicalUrl)}">
<link rel="alternate" hreflang="x-default" href="${esc(project.canonicalUrl)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PropertySG">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(meta)}"><meta property="og:url" content="${esc(project.canonicalUrl)}"><meta property="og:locale" content="en_SG"><meta property="og:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(meta)}"><meta name="twitter:image" content="https://joetay.com/joetay-social-preview.jpg">
<link rel="manifest" href="/site.webmanifest">
<script type="application/ld+json">${jsonForHtml(projectJson(project))}</script>
<script type="application/ld+json">${jsonForHtml(breadcrumbJson(project))}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="preconnect" href="https://www.googletagmanager.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="new-launches.css"><script defer src="new-launches.js"></script><script defer src="project-page-form.js"></script><script src="/js/recaptcha-helper.js" defer></script>
<script>try{if(localStorage.getItem('pdpa_consent')==='declined'){window['ga-disable-GT-KVFDZD5V']=true;window._pdpaDeclined=true;}}catch(e){}</script><script async src="https://www.googletagmanager.com/gtag/js?id=GT-KVFDZD5V"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GT-KVFDZD5V');</script>
<noscript><style>.reveal,.reveal-stagger>*{opacity:1!important;transform:none!important}</style></noscript>
</head>`;
}

function renderNewPage(project) {
  return `${head(project)}
<body data-generated-project-page="true" data-project-slug="${esc(project.slug)}">
<a class="skip-link" href="#main">Skip to content</a><div class="nl-progress" aria-hidden="true"></div>
<header class="nl-topbar"><div class="nl-topbar-inner"><a href="/" class="nl-logo">PropertySG</a><nav class="nl-nav" aria-label="Primary"><a href="/">Home</a><a href="/new-launches/">All Launches</a><a href="/insights/">Insights</a><a href="/#book" class="nl-nav-cta">Book a Call</a></nav></div></header>
<nav class="nl-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep">›</span><a href="/new-launches/">New Launches</a><span class="sep">›</span><span aria-current="page">${esc(project.name)}</span></nav>
<section class="project-hero" id="main" tabindex="-1" aria-labelledby="page-hero-title"><div class="project-hero-inner"><div><div class="district-tag">${esc(project.district)} · ${esc(project.region)} · ${esc(PROPERTY_TYPES[project.propertyType])}</div><h1 id="page-hero-title">${esc(project.name)}</h1><p class="project-hero-desc">${esc(description(project))}</p><div class="project-hero-price"><strong>${esc(marketCopy(project))}</strong></div>${heroCtas(project)}${statsHtml(project)}</div>${formCard(project)}</div></section>
${verificationStrip(project)}
${factsheetSection(project)}
${takeSection(project)}
${relatedSection(project)}
${contactSection(project)}
<section class="project-disclaimer"><div class="project-disclaimer-inner"><p>Project information is source-backed and verified as dated above, but remains subject to developer and authority confirmation. “Joe’s Take” was approved by Joe Tay on 2 Aug 2026 and is general commentary, not financial or legal advice.</p></div></section>
<footer class="nl-footer"><div class="nl-footer-inner"><p>&copy; 2026 PropertySG · Joe Tay · ERA Realty Network Pte Ltd · Agency Lic. No. L3002382K · <a href="/privacy-policy.html">Privacy Policy</a></p><p class="creds">CEA Reg. No. R009618D · joe@joetay.com · +65 8188 1488</p></div></footer>
<script src="/assets/conversion-tracking.js" defer></script>
</body>
</html>
`;
}

function replaceSection(html, className, replacement = '') {
  const pattern = new RegExp(`<section class="${className}[^\\"]*"[\\s\\S]*?<\\/section>\\s*`, 'g');
  return html.replace(pattern, replacement ? `${replacement}\n` : '');
}

function replaceProjectJsonLd(html, project) {
  let replaced = false;
  return html.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    (script, rawJson) => {
      if (replaced) return script;
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed['@type'] === 'Residence') {
          replaced = true;
          return `<script type="application/ld+json">${jsonForHtml(projectJson(project))}</script>`;
        }
      } catch {}
      return script;
    },
  );
}

function refreshFormCard(html, project) {
  return html.replace(
    /<div class="project-form-card">([\s\S]*?<\/form>\s*)<\/div>/,
    (card) => card
      .replace(/<h2>[\s\S]*?<\/h2>/, `<h2>Ask about ${esc(project.name)}</h2>`)
      .replace(/<p class="sub">[\s\S]*?<\/p>/, '<p class="sub">The latest unit list and floor plans will be confirmed by WhatsApp. This form is the secondary contact option.</p>')
      .replace(/<button type="submit">[\s\S]*?<\/button>/, '<button type="submit">Send enquiry →</button>'),
  );
}

function refreshExistingPage(html, project) {
  const title = `${project.name} | Verified ${project.district} New Launch | PropertySG`;
  const meta = description(project);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(meta)}">`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(meta)}">`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(title)}">`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(meta)}">`);
  html = replaceProjectJsonLd(html, project);
  html = html.replace(/<body(?: data-project-slug="[^"]+")?>/, `<body data-project-slug="${esc(project.slug)}">`);
  html = html.replace(/<div class="district-tag">[\s\S]*?<\/div>/, `<div class="district-tag">${esc(project.district)} · ${esc(project.region)} · ${esc(PROPERTY_TYPES[project.propertyType])}</div>`);
  html = html.replace(/<p class="project-hero-desc">[\s\S]*?<\/p>/, `<p class="project-hero-desc">${esc(meta)}</p>`);
  html = html.replace(/<div class="project-hero-price">[\s\S]*?<\/div>/, `<div class="project-hero-price"><strong>${esc(marketCopy(project))}</strong></div>`);
  html = html.replace(/<div class="project-hero-ctas">[\s\S]*?<\/div>/, heroCtas(project));
  html = html.replace(/<div class="project-stats"[\s\S]*?<\/div>\s*<\/div>\s*<div class="project-form-card">/, `${statsHtml(project)}\n    </div>\n\n    <div class="project-form-card">`);
  html = refreshFormCard(html, project);
  html = replaceSection(html, 'project-dev-strip', verificationStrip(project));
  html = replaceSection(html, 'project-location');
  html = replaceSection(html, 'project-section');
  html = replaceSection(html, 'project-factsheet', factsheetSection(project));
  html = replaceSection(html, 'project-take', takeSection(project));
  html = replaceSection(html, 'project-related', relatedSection(project));
  html = replaceSection(html, 'nl-register-band', contactSection(project));
  html = html
    .replaceAll('then register below to lock in your preferred stack before public launch.', 'then ask Joe to confirm the current unit list and suitable stacks.')
    .replaceAll('then register below to secure your preferred stack at VVIP preview.', 'then ask Joe to confirm the current unit list and suitable stacks.')
    .replaceAll('Developer-produced virtual tour materials for Dunearn House are released to registered VIP preview guests. Register below — I\'ll share the walkthrough link, full e-brochure, and unit availability in the same WhatsApp reply.', 'Ask Joe which developer-produced virtual tour materials are currently available for Dunearn House, together with the latest floor plans and unit availability.')
    .replace(/(class="nl-mobile-cta"[\s\S]*?<a class="primary" href="#projectForm">[\s\S]*?<\/svg>)\s*VVIP Preview/, '$1\n    Enquire')
    .replace(/(class="nl-mobile-cta"[\s\S]*?<a class="secondary"[\s\S]*?<\/svg>)\s*E-Brochure/, '$1\n    WhatsApp');
  if (project.slug === 'dunearn-house') {
    html = html.replaceAll('D10', 'D11').replaceAll('Freehold', '99-year leasehold').replaceAll('freehold', '99-year leasehold');
  }
  if (project.slug === 'narra-residences') html = html.replaceAll('544', '540');
  return html;
}

function addSitemapEntries(projects) {
  let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');
  for (const project of projects) {
    if (sitemap.includes(`<loc>${project.canonicalUrl}</loc>`)) continue;
    const entry = `  <url>\n    <loc>${project.canonicalUrl}</loc>\n    <lastmod>${project.verifiedAt}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    sitemap = sitemap.replace('</urlset>', `${entry}</urlset>`);
  }
  fs.writeFileSync(SITEMAP_PATH, sitemap);
}

export function validateProjectPage(html, project) {
  const errors = [];
  for (const expected of [project.name, project.canonicalUrl, project.district, project.region, TENURES[project.tenure], String(project.unitCount), formatDate(project.verifiedAt)]) {
    if (!html.includes(expected)) errors.push(`${project.slug}: missing ${expected}`);
  }
  if (!html.includes('data-approval="approved" data-approved-at="2026-08-02"')) errors.push(`${project.slug}: Joe's Take approval evidence missing`);
  if ((html.match(/class="project-related-card"/g) || []).length !== 3) errors.push(`${project.slug}: expected three alternatives`);
  return errors;
}

function run() {
  const requested = process.argv.find((arg) => arg.startsWith('--slugs='))?.slice(8).split(',').filter(Boolean);
  const slugs = requested || manifest.slugs;
  const projects = slugs.map((slug) => {
    const project = data.projects.find((candidate) => candidate.slug === slug);
    if (!project) throw new Error(`Unknown project slug: ${slug}`);
    return project;
  });

  if (process.argv.includes('--check')) {
    const errors = [];
    for (const project of projects) {
      const pagePath = path.join(ROOT, new URL(project.canonicalUrl).pathname);
      if (!fs.existsSync(pagePath)) {
        errors.push(`${project.slug}: page missing`);
        continue;
      }
      errors.push(...validateProjectPage(fs.readFileSync(pagePath, 'utf8'), project));
    }
    const sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');
    for (const project of projects) if (!sitemap.includes(`<loc>${project.canonicalUrl}</loc>`)) errors.push(`${project.slug}: sitemap entry missing`);
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exit(1);
    }
    console.log(`Validated ${projects.length} dataset-backed project pages`);
    return;
  }

  for (const project of projects) {
    const pagePath = path.join(ROOT, new URL(project.canonicalUrl).pathname);
    const existing = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
    const page = existing && !existing.includes('data-generated-project-page="true"')
      ? refreshExistingPage(existing, project)
      : renderNewPage(project);
    fs.writeFileSync(pagePath, page);
  }
  addSitemapEntries(projects);
  console.log(`Generated or refreshed ${projects.length} project pages`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
