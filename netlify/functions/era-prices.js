// Netlify Function: era-prices  (joetay.com)
//
// GET /.netlify/functions/era-prices?slug=<project-slug>
//
// Live unit-mix prices, psf and availability for a new-launch project page,
// read from ERA's public new-launch search and cached.
//
// Why live instead of committed: scripts/check-new-launches.mjs fails CI once
// any committed dynamic figure is more than 7 days old. Prices written into
// projects.json would turn every pull request red a week later unless someone
// merged a refresh weekly. Serving them live keeps prices current, always
// dated, and leaves the committed dataset free of anything that can go stale.
//
// Failure is silent by design: the page renders its static unit-mix table and
// an "ask Joe" line whenever this returns live:false, so a slow or changed ERA
// API degrades to no prices, never to wrong prices.

const { fetchEraProjects, summariseProject } = require('./lib/era-launches');
const ERA_MAP = require('../../new-launches/era-map.json');

const CACHE_MS = 6 * 60 * 60 * 1000; // ERA's figures move daily at most
let cache = { at: 0, projects: null };

function headers(maxAge) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${Math.min(maxAge, 900)}`,
    // Netlify's CDN caches the response so the upstream is hit a few times a day, not per visit.
    'Netlify-CDN-Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=86400`,
  };
}

async function loadProjects(now) {
  if (cache.projects && now - cache.at < CACHE_MS) return cache.projects;
  const projects = await fetchEraProjects();
  cache = { at: now, projects };
  return projects;
}

exports.resetCache = () => {
  cache = { at: 0, projects: null };
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: headers(60), body: JSON.stringify({ live: false, error: 'Method not allowed' }) };
  }
  const slug = String((event.queryStringParameters || {}).slug || '');
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) {
    return { statusCode: 400, headers: headers(60), body: JSON.stringify({ live: false, error: 'Invalid slug' }) };
  }
  const eraId = ERA_MAP.projects[slug];
  if (!eraId) {
    // Not listed on ERA: a normal state for 5 of the 27 pages, not an error.
    return { statusCode: 200, headers: headers(21600), body: JSON.stringify({ slug, live: false, reason: 'not listed' }) };
  }

  const now = Date.now();
  try {
    const projects = await loadProjects(now);
    const match = projects.find((project) => String(project.id) === String(eraId));
    if (!match) {
      return { statusCode: 200, headers: headers(3600), body: JSON.stringify({ slug, live: false, reason: 'listing removed' }) };
    }
    const summary = summariseProject(match, { now: new Date(now) });
    return {
      statusCode: 200,
      headers: headers(21600),
      body: JSON.stringify({
        slug,
        fetchedAt: new Date(cache.at).toISOString(),
        source: { name: 'ERA Realty Network', url: summary.detailUrl },
        live: summary.live,
        reasons: summary.reasons,
        totals: summary.totals,
        priceRange: summary.priceRange,
        psfRange: summary.psfRange,
        mix: summary.live ? summary.mix : [],
      }),
    };
  } catch (error) {
    console.error('era-prices upstream failure:', error.message);
    return { statusCode: 200, headers: headers(300), body: JSON.stringify({ slug, live: false, reason: 'upstream unavailable' }) };
  }
};
