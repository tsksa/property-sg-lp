#!/usr/bin/env python3
"""Build the self-hosted photo galleries for the new-launch project pages.

    python3 scripts/build-project-gallery.py            # all projects in the selection file
    python3 scripts/build-project-gallery.py pinery-residences ...

Input:  new-launches/project-gallery-selection.json — the images chosen for each
        project, by URL, with alt text. Chosen by hand after viewing every
        candidate, not by filename: ERA's labels mix renders with logos, maps,
        sales charts and forwarded WhatsApp photos that can carry prices or
        another agent's details.
Output: new-launches/img/gallery/<slug>/NN-lg.webp (1400px) and NN-sm.webp (800px) per image,
        og.jpg (1200x630) and card-600.webp (600x315) cut from the first image,
        and new-launches/project-gallery.json, the manifest the page generators read.

Rights: Joe Tay confirmed on 2026-09-16 that he has permission to use the
developers' marketing images, and chose ERA's project listing images (which
carry ERA's watermark) as the source. Requires Pillow and network access; a
one-off asset build run by hand, never in CI.
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
SELECTION = ROOT / 'new-launches' / 'project-gallery-selection.json'
MANIFEST = ROOT / 'new-launches' / 'project-gallery.json'
OUT = ROOT / 'new-launches' / 'img' / 'gallery'
CACHE = Path('/tmp/joetay-gallery-cache')
UA = {'User-Agent': 'joetay.com gallery build (joe@joetay.com)'}

LARGE, SMALL = 1400, 800  # lg opens full-screen; sm fills the grid


def fetch(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if not target.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as response:
            target.write_bytes(response.read())
    return target


def fit_width(image, width):
    if image.width <= width:
        return image.copy()
    return image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)


def cover(image, size):
    return ImageOps.fit(image, size, Image.LANCZOS, centering=(0.5, 0.5))


def build(slug, spec):
    folder = OUT / slug
    folder.mkdir(parents=True, exist_ok=True)
    for stale in folder.glob('*'):
        stale.unlink()
    images = []
    for index, item in enumerate(spec['images'], start=1):
        source = Image.open(fetch(item['url']))
        source = ImageOps.exif_transpose(source).convert('RGB')
        stem = f'{index:02d}'
        large = fit_width(source, LARGE)
        small = fit_width(source, SMALL)
        # ERA's tiled watermark is high-entropy detail, so these compress poorly;
        # q70 at 1400px cut the gallery total from 55 MB to 37 MB with no visible loss at screen size.
        large.save(folder / f'{stem}-lg.webp', 'WEBP', quality=70, method=6)
        small.save(folder / f'{stem}-sm.webp', 'WEBP', quality=72, method=6)
        if index == 1:
            cover(source, (1200, 630)).save(folder / 'og.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
            cover(source, (600, 315)).save(folder / 'card-600.webp', 'WEBP', quality=80, method=6)
        images.append({
            'file': stem,
            'alt': item['alt'],
            'kind': item.get('kind', 'render'),
            'width': large.width,
            'height': large.height,
            'smallWidth': small.width,
            'smallHeight': small.height,
            'sourceUrl': item['url'],
        })
    return {'eraId': spec.get('eraId'), 'images': images}


def main():
    selection = json.loads(SELECTION.read_text())
    slugs = sys.argv[1:] or sorted(selection['projects'])
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'projects': {}}
    manifest.update({
        'source': selection['source'],
        'permission': selection['permission'],
        'retrievedAt': selection['retrievedAt'],
    })
    for slug in slugs:
        spec = selection['projects'][slug]
        if not spec['images']:
            manifest['projects'].pop(slug, None)
            continue
        manifest['projects'][slug] = build(slug, spec)
        size = sum(p.stat().st_size for p in (OUT / slug).glob('*')) // 1024
        print(f"{slug:30} {len(spec['images']):>2} image(s)  {size:>5} KB", flush=True)
    manifest['projects'] = dict(sorted(manifest['projects'].items()))
    MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
