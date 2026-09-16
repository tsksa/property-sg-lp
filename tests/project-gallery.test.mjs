import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const manifest = JSON.parse(read('new-launches/project-gallery.json'));
const selection = JSON.parse(read('new-launches/project-gallery-selection.json'));
const projects = JSON.parse(read('new-launches/projects.json')).projects;

test('the gallery manifest records the usage permission and source', () => {
  assert.match(manifest.permission, /Joe Tay confirmed/);
  assert.match(manifest.source, /ERA/);
});

test('every gallery image exists in both sizes, with alt text', () => {
  for (const [slug, entry] of Object.entries(manifest.projects)) {
    assert.ok(projects.some((project) => project.slug === slug), `${slug} is not a project`);
    for (const image of entry.images) {
      for (const size of ['lg', 'sm']) {
        const file = `new-launches/img/gallery/${slug}/${image.file}-${size}.webp`;
        assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} missing`);
      }
      assert.ok(image.alt && image.alt.length > slug.length, `${slug}/${image.file}: alt text missing`);
      assert.ok(['render', 'showflat', 'photo', 'site-plan'].includes(image.kind), `${slug}/${image.file}: unknown kind ${image.kind}`);
      // Only developer renders may be described as artist's impressions.
      assert.equal(/artist's impression/.test(image.alt), image.kind === 'render', `${slug}/${image.file}: alt text and kind disagree`);
    }
    assert.ok(fs.existsSync(path.join(ROOT, `new-launches/img/gallery/${slug}/og.jpg`)), `${slug}: og.jpg missing`);
    assert.ok(fs.existsSync(path.join(ROOT, `new-launches/img/gallery/${slug}/card-600.webp`)), `${slug}: card image missing`);
  }
});

test('the manifest was built from the committed selection', () => {
  assert.deepEqual(Object.keys(manifest.projects).sort(), Object.keys(selection.projects).filter((slug) => selection.projects[slug].images.length).sort());
  for (const [slug, entry] of Object.entries(manifest.projects)) {
    assert.deepEqual(entry.images.map((image) => image.sourceUrl), selection.projects[slug].images.map((image) => image.url), `${slug}: rebuild the gallery`);
  }
});

test('gallery pages render every image, use a self-hosted hero and share image, and never hotlink the broker CDN', () => {
  for (const project of projects) {
    const html = read(`new-launches/${project.slug}.html`);
    assert.doesNotMatch(html, /img\.singmap\.com/, `${project.slug} still hotlinks img.singmap.com`);
    const entry = manifest.projects[project.slug];
    if (!entry) continue;
    assert.equal((html.match(/data-gallery-item/g) || []).length, entry.images.length, `${project.slug}: gallery count`);
    assert.match(html, new RegExp(`--bg-image:url\\('/new-launches/img/gallery/${project.slug}/`), `${project.slug}: hero photo`);
    assert.match(html, new RegExp(`og:image" content="https://joetay\\.com/new-launches/img/gallery/${project.slug}/og\\.jpg"`), `${project.slug}: og:image`);
    assert.match(html, /src="project-gallery\.js"/, `${project.slug}: lightbox script`);
  }
});

test('photos past the first few stay hidden until the viewer opens them', () => {
  // .project-gallery-item sets display:block, which beats the [hidden] attribute unless overridden.
  assert.match(read('new-launches/new-launches.css'), /\.project-gallery-item\[hidden\]\{display:none!important\}/);
});
