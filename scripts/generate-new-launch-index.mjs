#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'new-launches', 'projects.json');
const INDEX_PATH = path.join(ROOT, 'new-launches', 'index.html');
const SOLD_OUT_PATH = path.join(ROOT, 'new-launches', 'sold-out.html');

const PROPERTY_TYPE_LABELS = {
  condominium: 'Condominium',
  'executive-condominium': 'Executive condominium',
  landed: 'Landed',
};

const TENURE_LABELS = {
  freehold: 'Freehold',
  '99-year': '99-year leasehold',
  '999-year': '999-year leasehold',
};

const STATUS_LABELS = {
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

const jsonForHtml = (value) =>
  JSON.stringify(value, null, 2).replaceAll('<', '\\u003c');

export function dateKey(project) {
  if (project.previewDate) return project.previewDate;
  if (project.bookingDate) return project.bookingDate;
  if (!project.launchWindow) return null;
  if (/^\d{4}-\d{2}$/.test(project.launchWindow)) {
    return `${project.launchWindow}-01`;
  }
  const quarter = project.launchWindow.match(/^(\d{4})-Q([1-4])$/);
  if (quarter) {
    const month = String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, '0');
    return `${quarter[1]}-${month}-01`;
  }
  return null;
}

export function defaultCatalogSort(left, right) {
  const rank = { upcoming: 0, selling: 1, 'sold-out': 2 };
  const statusDifference = rank[left.status] - rank[right.status];
  if (statusDifference) return statusDifference;

  const leftDate = dateKey(left);
  const rightDate = dateKey(right);
  if (left.status === 'upcoming') {
    if (leftDate && rightDate) return leftDate.localeCompare(rightDate);
    if (leftDate) return -1;
    if (rightDate) return 1;
  } else {
    if (leftDate && rightDate) return rightDate.localeCompare(leftDate);
    if (leftDate) return -1;
    if (rightDate) return 1;
  }
  return left.name.localeCompare(right.name);
}

export function newestCatalogSort(left, right) {
  const leftDate = dateKey(left);
  const rightDate = dateKey(right);
  if (leftDate && rightDate && leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }
  if (leftDate) return -1;
  if (rightDate) return 1;
  return left.name.localeCompare(right.name);
}

export function priceCatalogSort(left, right) {
  const leftPrice = left.priceFrom?.value;
  const rightPrice = right.priceFrom?.value;
  if (leftPrice != null && rightPrice != null && leftPrice !== rightPrice) {
    return leftPrice - rightPrice;
  }
  if (leftPrice != null) return -1;
  if (rightPrice != null) return 1;
  return defaultCatalogSort(left, right);
}

export function filterProjects(projects, filters = {}) {
  const query = String(filters.query || '').trim().toLowerCase();
  return projects.filter((project) => {
    const searchable = [project.name, project.developer, project.location]
      .join(' ')
      .toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (!filters.status || project.status === filters.status) &&
      (!filters.region || project.region === filters.region) &&
      (!filters.propertyType || project.propertyType === filters.propertyType) &&
      (!filters.tenure || project.tenure === filters.tenure)
    );
  });
}

export function sortProjects(projects, mode = 'default') {
  const comparator =
    mode === 'newest'
      ? newestCatalogSort
      : mode === 'price'
        ? priceCatalogSort
        : defaultCatalogSort;
  return [...projects].sort(comparator);
}

function formatDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatLaunchTiming(project) {
  const parts = [];
  if (project.previewDate) parts.push(`Preview ${formatDate(project.previewDate)}`);
  if (project.bookingDate) parts.push(`Booking ${formatDate(project.bookingDate)}`);
  if (!parts.length && project.launchWindow) {
    parts.push(`Expected ${project.launchWindow.replace(/^(\d{4})-Q([1-4])$/, 'Q$2 $1')}`);
  }
  return parts.length ? parts.join(' · ') : 'Launch timing to be confirmed';
}

function formatMoney(value) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${millions.toFixed(millions % 1 ? 3 : 0).replace(/0+$/, '').replace(/\.$/, '')}m`;
  }
  return `$${new Intl.NumberFormat('en-SG').format(value)}`;
}

function priceCopy(project) {
  if (project.priceFrom.value != null) {
    return `From ${formatMoney(project.priceFrom.value)}`;
  }
  if (project.status === 'selling') return 'Selling now—check availability.';
  if (project.status === 'sold-out') return 'Sold out';
  return 'Ask for latest price';
}

function dynamicCopy(project) {
  const facts = [];
  if (project.averagePsf.value != null) {
    facts.push(`Avg. $${new Intl.NumberFormat('en-SG').format(project.averagePsf.value)} psf`);
  }
  if (project.soldPercent.value != null) {
    facts.push(`${project.soldPercent.value}% sold`);
  }
  return facts.join(' · ');
}

function marketVerificationCopy(project, hasDynamicFigures) {
  const asOf =
    project.priceFrom.asOf ||
    project.averagePsf.asOf ||
    project.soldPercent.asOf;
  if (asOf) {
    return `${hasDynamicFigures ? '' : 'Market figure '}as of ${formatDate(asOf)}`;
  }
  return 'Contact Joe for current pricing and availability.';
}

function localCanonicalPath(project) {
  return new URL(project.canonicalUrl).pathname;
}

function cardHtml(project, index) {
  const search = [project.name, project.developer, project.location]
    .join(' ')
    .toLowerCase();
  const launchDate = dateKey(project) || '';
  const price = project.priceFrom.value ?? '';
  const dynamic = dynamicCopy(project);
  return `    <li class="nl-card-item" data-catalog-item data-name="${esc(project.name.toLowerCase())}" data-search="${esc(search)}" data-status="${esc(project.status)}" data-region="${esc(project.region)}" data-property-type="${esc(project.propertyType)}" data-tenure="${esc(project.tenure)}" data-launch-date="${esc(launchDate)}" data-price="${esc(price)}" data-default-order="${index}">
      <a href="${esc(localCanonicalPath(project))}" class="nl-card">
        <div class="nl-card-img nl-card-img-data" aria-hidden="true">
          <span class="nl-card-monogram">${esc(project.name.slice(0, 2).toUpperCase())}</span>
          <span class="nl-card-badge ${project.status === 'upcoming' ? 'new' : ''}">${esc(STATUS_LABELS[project.status])}</span>
        </div>
        <div class="nl-card-body">
          <div class="nl-card-meta">
            <span class="district">${esc(project.district)} · ${esc(project.region)}</span>
            <span class="dot" aria-hidden="true">·</span>
            <span>${esc(PROPERTY_TYPE_LABELS[project.propertyType] || project.propertyType)}</span>
          </div>
          <h2>${esc(project.name)}</h2>
          <p class="nl-card-location">${esc(project.location)} · ${esc(project.developer)}</p>
          <dl class="nl-card-facts">
            <div><dt>Tenure</dt><dd>${esc(TENURE_LABELS[project.tenure] || project.tenure)}</dd></div>
            <div><dt>Units</dt><dd>${new Intl.NumberFormat('en-SG').format(project.unitCount)}</dd></div>
            <div class="wide"><dt>Launch</dt><dd>${esc(formatLaunchTiming(project))}</dd></div>
            <div class="wide"><dt>Verified</dt><dd>${esc(formatDate(project.verifiedAt))}</dd></div>
          </dl>
          <div class="nl-card-market">
            <strong>${esc(priceCopy(project))}</strong>
            <span>${dynamic ? `${esc(dynamic)} · ` : ''}${esc(marketVerificationCopy(project, Boolean(dynamic)))}</span>
          </div>
          <span class="nl-card-link">View project details <span aria-hidden="true">→</span></span>
        </div>
      </a>
    </li>`;
}

function itemListJson(projects, pageUrl, pageName) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: pageName,
    url: pageUrl,
    inLanguage: 'en-SG',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: projects.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: projects.map((project, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: project.name,
        url: project.canonicalUrl,
      })),
    },
  };
}

function breadcrumbJson(soldOut) {
  const elements = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://joetay.com/' },
    { '@type': 'ListItem', position: 2, name: 'New Launches', item: 'https://joetay.com/new-launches/' },
  ];
  if (soldOut) {
    elements.push({
      '@type': 'ListItem',
      position: 3,
      name: 'Sold-out projects',
      item: 'https://joetay.com/new-launches/sold-out.html',
    });
  }
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: elements };
}

function options(values, labels) {
  return values
    .map((value) => `<option value="${esc(value)}">${esc(labels[value] || value)}</option>`)
    .join('');
}

function controlsHtml(projects) {
  const statuses = [...new Set(projects.map((project) => project.status))].sort();
  const regions = [...new Set(projects.map((project) => project.region))].sort();
  const propertyTypes = [...new Set(projects.map((project) => project.propertyType))].sort();
  const tenures = [...new Set(projects.map((project) => project.tenure))].sort();
  return `<section class="nl-catalog-controls" aria-labelledby="catalog-controls-title">
  <div class="nl-catalog-controls-inner">
    <div class="nl-controls-heading">
      <div><p class="nl-controls-eyebrow">Find your shortlist</p><h2 id="catalog-controls-title">Search and filter projects</h2></div>
      <a href="/new-launches/sold-out.html" class="nl-archive-link">View sold-out archive →</a>
    </div>
    <form id="nlCatalogControls" class="nl-controls-form" role="search">
      <label class="nl-search-field"><span>Search</span><input id="nlCatalogSearch" type="search" placeholder="Project, developer or location" autocomplete="off"></label>
      <label><span>Status</span><select id="nlStatusFilter"><option value="">All statuses</option>${options(statuses, STATUS_LABELS)}</select></label>
      <label><span>Region</span><select id="nlRegionFilter"><option value="">All regions</option>${options(regions, {})}</select></label>
      <label><span>Property type</span><select id="nlTypeFilter"><option value="">All property types</option>${options(propertyTypes, PROPERTY_TYPE_LABELS)}</select></label>
      <label><span>Tenure</span><select id="nlTenureFilter"><option value="">All tenures</option>${options(tenures, TENURE_LABELS)}</select></label>
      <label><span>Sort</span><select id="nlSort"><option value="default">Recommended</option><option value="newest">Newest launch</option><option value="price">Lowest verified entry price</option></select></label>
      <button type="reset" class="nl-reset">Reset</button>
    </form>
  </div>
</section>`;
}

function headHtml({ title, description, canonical, itemList, soldOut }) {
  return `<!DOCTYPE html>
<html lang="en-SG">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0b1e3f">
<meta name="application-name" content="PropertySG">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="en-SG" href="${esc(canonical)}">
<link rel="alternate" hreflang="x-default" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PropertySG">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="en_SG">
<meta property="og:image" content="https://joetay.com/joetay-social-preview.jpg">
<meta property="og:image:width" content="1920">
<meta property="og:image:height" content="1080">
<meta property="og:image:alt" content="Joe Tay, District Director at ERA Realty Network — PropertySG">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="https://joetay.com/joetay-social-preview.jpg">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%230b1e3f'/%3E%3Ctext x='50' y='70' font-family='Georgia,serif' font-size='60' font-weight='700' text-anchor='middle' fill='%2310b981'%3EP%3C/svg%3E">
<link rel="manifest" href="/site.webmanifest">
<script type="application/ld+json">${jsonForHtml(itemList)}</script>
<script type="application/ld+json">${jsonForHtml(breadcrumbJson(soldOut))}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://www.googletagmanager.com">
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"></noscript>
<link rel="stylesheet" href="new-launches.css">
<!-- reCAPTCHA v3 helper — the registration modal in new-launches.js POSTs to
     submit-lead. Without this every lead arrives with no token, is flagged
     review-required, and is notified over the free-form WhatsApp path. -->
<script src="/js/recaptcha-helper.js" defer></script>
<script defer src="new-launches.js"></script>
<script>try{if(localStorage.getItem('pdpa_consent')==='declined'){window['ga-disable-GT-KVFDZD5V']=true;window._pdpaDeclined=true;}}catch(e){}</script>
<script>if(!window._pdpaDeclined){var gaS=document.createElement('script');gaS.async=true;gaS.src='https://www.googletagmanager.com/gtag/js?id=GT-KVFDZD5V';document.head.appendChild(gaS);}</script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GT-KVFDZD5V');</script>
<noscript><style>.reveal,.reveal-stagger>*{opacity:1!important;transform:none!important}</style></noscript>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="PropertySG">
<meta name="format-detection" content="telephone=no">
</head>`;
}

function bodyHtml(projects, { soldOut }) {
  const title = soldOut ? 'Sold-out Singapore new launches.' : 'Singapore new launch projects, verified.';
  const intro = soldOut
    ? 'A reference archive of projects marked sold out in the verified catalog. For currently selling and upcoming launches, return to the main directory.'
    : 'Search every verified selling and upcoming project by name, developer or location. Compare status, tenure, units, launch timing and current source-backed market data.';
  const breadcrumb = soldOut
    ? '<a href="/">Home</a><span class="sep">›</span><a href="/new-launches/">New Launches</a><span class="sep">›</span><span aria-current="page">Sold out</span>'
    : '<a href="/">Home</a><span class="sep">›</span><span aria-current="page">New Launches</span>';
  const cards = projects.map(cardHtml).join('\n\n');
  return `<body data-catalog-page="${soldOut ? 'sold-out' : 'active'}">
<a class="skip-link" href="#main">Skip to content</a>
<div class="nl-progress" aria-hidden="true"></div>
<header class="nl-topbar"><div class="nl-topbar-inner"><a href="/" class="nl-logo">PropertySG</a><nav class="nl-nav" aria-label="Primary"><a href="/">Home</a><a href="/sell/">Sell</a><a href="/rent-out/">Rent Out</a><a href="/insights/">Insights</a><a href="/#book" class="nl-nav-cta">Book a Call</a></nav></div></header>
<section class="nl-hero" aria-labelledby="nl-hero-title"><div class="nl-hero-inner"><div class="eyebrow">Verified catalog · Updated ${esc(formatDate(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')).inventoryAsOf))}</div><h1 id="nl-hero-title">${esc(title)}</h1><p>${esc(intro)}</p>${soldOut ? '<a href="/new-launches/" class="nl-hero-cta">Browse current projects →</a>' : '<a href="#catalog" class="nl-hero-cta">Explore the catalog →</a>'}</div></section>
<section class="nl-trust"><div class="nl-trust-inner" role="list" aria-label="Catalog summary"><div class="nl-trust-badge" role="listitem"><strong>${projects.length}</strong> ${soldOut ? 'sold-out' : 'active and upcoming'} projects</div><div class="nl-trust-dot" aria-hidden="true"></div><div class="nl-trust-badge" role="listitem"><strong>Source-backed</strong> project facts</div><div class="nl-trust-dot" aria-hidden="true"></div><div class="nl-trust-badge" role="listitem"><strong>7-day rule</strong> for dynamic figures</div><div class="nl-trust-dot" aria-hidden="true"></div><div class="nl-trust-badge" role="listitem"><strong>CEA R009618D</strong> · ERA District Director</div></div></section>
<nav class="nl-breadcrumb" aria-label="Breadcrumb">${breadcrumb}</nav>
${soldOut ? '' : controlsHtml(projects)}
<main id="main" tabindex="-1" class="nl-main">
  <div class="nl-results-head"><div><p class="nl-controls-eyebrow">${soldOut ? 'Archive' : 'Verified directory'}</p><h2>${soldOut ? 'Sold-out projects' : 'Selling and upcoming projects'}</h2></div><p id="nlResultSummary"><strong id="nlResultCount">${projects.length}</strong> ${projects.length === 1 ? 'project' : 'projects'}</p></div>
  <p id="nlFilterStatus" class="sr-only" role="status" aria-live="polite"></p>
  <div id="nlEmptyState" class="nl-empty" hidden><h2>No matching projects</h2><p>Try a broader search or reset the filters.</p><button type="button" id="nlEmptyReset">Reset filters</button></div>
  <ul id="catalog" class="nl-grid reveal-stagger" aria-label="${soldOut ? 'Sold-out Singapore projects' : 'Singapore new launch projects'}">
${cards}
  </ul>
</main>
<section class="nl-register-band reveal" id="register" aria-label="Talk to Joe about new launches"><div class="nl-register-band-inner"><h3>${soldOut ? 'Looking for a current alternative?' : 'Need the latest price list and floor plans?'}</h3><p>I’ll help you shortlist current launches against your budget, timeline and exit plan—with source-backed facts and a direct answer on availability.</p><a href="https://wa.me/6581881488?text=Hi%20Joe%2C%20please%20help%20me%20shortlist%20current%20new%20launch%20projects." target="_blank" rel="noopener">WhatsApp Joe →</a></div></section>
<button type="button" class="nl-to-top" aria-label="Back to top"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg></button>
<a href="https://wa.me/6581881488?text=Hi%20Joe%2C%20I%27d%20like%20information%20on%20current%20new%20launch%20projects." target="_blank" rel="noopener" class="nl-wa-float" aria-label="WhatsApp Joe"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg></a>
<footer class="nl-footer"><div class="nl-footer-inner"><p>&copy; 2026 PropertySG · Joe Tay, District Director · ERA Realty Network Pte Ltd · Agency Lic. No. L3002382K · <a href="/">Home</a> · <a href="/privacy-policy.html">Privacy Policy</a></p><p class="creds">CEA Reg. No. R009618D · joe@joetay.com · +65 8188 1488 · Project facts are source-backed and subject to developer confirmation.</p></div></footer>
<script src="/assets/conversion-tracking.js" defer></script>
</body>
</html>
`;
}

export function buildCatalogPages(data) {
  const active = sortProjects(
    data.projects.filter((project) => ['selling', 'upcoming'].includes(project.status)),
    'default',
  );
  const soldOut = sortProjects(
    data.projects.filter((project) => project.status === 'sold-out'),
    'newest',
  );
  const activeTitle = 'Singapore New Launch Projects 2026 | Verified Condo & EC Catalog';
  const activeDescription = 'Search verified selling and upcoming Singapore new launch condos, ECs and landed projects by status, region, tenure, developer and location.';
  const soldTitle = 'Sold-out Singapore New Launch Projects | PropertySG';
  const soldDescription = 'Browse the verified archive of sold-out Singapore new launch projects and return to the current catalog for active alternatives.';
  return {
    index: `${headHtml({ title: activeTitle, description: activeDescription, canonical: 'https://joetay.com/new-launches/', itemList: itemListJson(active, 'https://joetay.com/new-launches/', activeTitle), soldOut: false })}\n${bodyHtml(active, { soldOut: false })}`,
    soldOut: `${headHtml({ title: soldTitle, description: soldDescription, canonical: 'https://joetay.com/new-launches/sold-out.html', itemList: itemListJson(soldOut, 'https://joetay.com/new-launches/sold-out.html', soldTitle), soldOut: true })}\n${bodyHtml(soldOut, { soldOut: true })}`,
    active,
    soldOutProjects: soldOut,
  };
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const pages = buildCatalogPages(data);
  if (process.argv.includes('--check')) {
    const mismatches = [];
    if (!fs.existsSync(INDEX_PATH) || fs.readFileSync(INDEX_PATH, 'utf8') !== pages.index) mismatches.push(path.relative(ROOT, INDEX_PATH));
    if (!fs.existsSync(SOLD_OUT_PATH) || fs.readFileSync(SOLD_OUT_PATH, 'utf8') !== pages.soldOut) mismatches.push(path.relative(ROOT, SOLD_OUT_PATH));
    if (mismatches.length) {
      console.error(`Generated new-launch pages are stale: ${mismatches.join(', ')}`);
      console.error('Run: npm run generate:new-launches');
      process.exit(1);
    }
    console.log(`Generated catalog is current — ${pages.active.length} active/upcoming, ${pages.soldOutProjects.length} sold out`);
    return;
  }
  fs.writeFileSync(INDEX_PATH, pages.index);
  fs.writeFileSync(SOLD_OUT_PATH, pages.soldOut);
  console.log(`Generated ${pages.active.length} active/upcoming projects and ${pages.soldOutProjects.length} sold-out projects`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
