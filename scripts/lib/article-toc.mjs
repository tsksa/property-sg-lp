// "On this page" navigation for insight articles.
//
// Why: the financing guides run 9–14 H2 sections and 1,200–3,300 words each
// (measured 7 Sep 2026), more than a phone screen can skim. A TOC built from
// the article's own H2s gives readers and Google a section map, and the
// stable ids it adds make every section linkable from other pages.
//
// Pure function so both the cluster generators (at render time) and the
// apply script (for hand-built articles) produce byte-identical output.

export const TOC_MARKER = 'data-jt-article-toc';

const BODY_OPEN = /<section class="article-body" aria-labelledby="article-title">\n?/;
const BODY_CLOSE = '</section>';
const H2 = /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g;

export function slugifyHeading(text) {
  return decode(text)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

function decode(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function esc(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// The commission guide nests a <section> (its comparison tool) inside the
// article body, so the first </section> is not the body's end. Walk the
// section tags and return the index of the one that closes the body.
function closingIndex(html, start) {
  const tag = /<section\b|<\/section>/g;
  tag.lastIndex = start;
  let depth = 1;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0] === BODY_CLOSE ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

/** Adds ids to article-body H2s that lack one and inserts (or refreshes) the TOC. */
export function injectToc(html) {
  const open = html.match(BODY_OPEN);
  if (!open) return html;
  const start = open.index + open[0].length;
  const end = closingIndex(html, start);
  if (end === -1) return html;

  // Drop a previous TOC so the function is idempotent.
  let body = html.slice(start, end).replace(new RegExp(`<nav class="article-toc" ${TOC_MARKER}[\\s\\S]*?</nav>\\n?`), '');

  const used = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const entries = [];
  body = body.replace(H2, (tag, attrs = '', inner) => {
    const text = decode(inner);
    if (!text) return tag;
    const existing = attrs.match(/\sid="([^"]+)"/)?.[1];
    let id = existing;
    if (!id) {
      const base = slugifyHeading(text) || 'section';
      id = base;
      for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
      used.add(id);
    }
    entries.push({ id, text });
    return existing ? tag : `<h2 id="${id}"${attrs}>${inner}</h2>`;
  });
  if (entries.length < 3) return html.slice(0, start) + body + html.slice(end);

  const toc = `<nav class="article-toc" ${TOC_MARKER} aria-labelledby="article-toc-title">
  <p class="article-toc-title" id="article-toc-title">On this page</p>
  <ol>
${entries.map(({ id, text }) => `    <li><a href="#${id}">${esc(text)}</a></li>`).join('\n')}
  </ol>
</nav>
`;
  return html.slice(0, start) + toc + body + html.slice(end);
}
