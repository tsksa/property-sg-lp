// Maps a page's file path to the URL it should appear as in sitemap.xml, and
// finds indexable pages that are missing an entry.
//
// Nothing previously checked that a page which passes every other invariant is
// actually reachable via the sitemap — only that an entry, once present, has a
// fresh <lastmod> (scripts/refresh-sitemap-lastmod.mjs / check:sitemap-lastmod).
// A hand-maintained, build-less site with 70+ files has no structural guarantee
// that creating a page also adds it to sitemap.xml; it's a second, easy-to-forget
// step. Given the site's current organic problem is crawl/index coverage rather
// than on-page quality, a silently-omitted sitemap entry is exactly the failure
// mode that matters most.

/** File path (relative to repo root, POSIX separators) -> expected sitemap URL path. */
export function expectedSitemapPath(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

/** Extract the set of URL paths (no domain) currently listed in a sitemap.xml string. */
export function sitemapPaths(sitemapXml, origin = 'https://joetay.com') {
  const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<loc>${escaped}(/[^<]*)</loc>`, 'g');
  return new Set([...sitemapXml.matchAll(re)].map((m) => m[1]));
}

/**
 * Given the full list of page file paths and a predicate for which ones are
 * expected to be indexable, return the file paths missing a sitemap.xml entry.
 */
export function findMissingSitemapEntries(pages, sitemapXml, isIndexable) {
  const present = sitemapPaths(sitemapXml);
  return pages.filter((file) => isIndexable(file) && !present.has(expectedSitemapPath(file)));
}
