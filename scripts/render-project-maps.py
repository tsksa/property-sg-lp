#!/usr/bin/env python3
"""Render a location map for every new-launch project page.

    python3 scripts/render-project-maps.py                 # all projects in project-geo.json
    python3 scripts/render-project-maps.py chuan-grove ... # just these slugs
    python3 scripts/render-project-maps.py --extract Singapore.osm.geojson.xz [slugs]
                                                           # read a local OSM extract instead of Overpass
    python3 scripts/render-project-maps.py --thumbs        # rebuild catalog thumbnails only

Why a renderer instead of a screenshot or a tile grab: 22 of the 27 project
pages had no image at all (measured 2026-09-16). Developer renders need usage
permission that has not been confirmed, and two map sources were rejected on
licensing — OneMap's terms (clause 3.2) restrict storing and publicly displaying
SLA material without permission, and stitching openstreetmap.org tiles for a
static image is the bulk use that tile policy asks sites not to do. Drawing the
map ourselves from OpenStreetMap *data* is covered by the ODbL for commercial
use with attribution, and it lets the map show what a buyer actually asks
about: the nearest MRT stations.

Data: either the public Overpass API, or — preferred, and what the September
2026 build used after the public Overpass instances returned 429/504 for most
queries — BBBike's weekly Singapore extract
(https://download.bbbike.org/osm/bbbike/Singapore/Singapore.osm.geojson.xz,
ODbL), streamed with the standard library.

Output: new-launches/img/maps/<slug>.webp at 1200x630, a .jpg twin used as the
page's og:image, and <slug>-600.webp for the catalog cards. Requires Pillow; it
is a one-off asset build run by hand, never in CI.
"""

import lzma

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / 'new-launches' / 'project-geo.json'
STATIONS = ROOT / 'new-launches' / 'mrt-stations.json'  # LTA station exits, Singapore Open Data Licence
PROJECTS = ROOT / 'new-launches' / 'projects.json'
OUT = ROOT / 'new-launches' / 'img' / 'maps'
CACHE = Path('/tmp/joetay-overpass-cache')
# Public Overpass instances, tried in turn. The main instance rate-limits hard
# (429s after a handful of queries on 2026-09-16), so the build rotates.
OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
UA = 'joetay.com project-map renderer (joe@joetay.com)'

W, H = 1200, 630
BASE_METRES_PER_PX = 1.35  # ~1.6 km across; zoomed out per site so the nearest station is in frame
MAX_METRES_PER_PX = 4.0
BUILDINGS_UP_TO_MPP = 2.5  # beyond this buildings are specks and make the query heavy

NAVY = (11, 30, 63)
EMERALD = (4, 120, 87)
LAND = (246, 243, 236)
PARK = (214, 232, 208)
WATER = (190, 216, 236)
BUILDING = (228, 223, 212)
ROAD = (255, 255, 255)
ROAD_CASE = (214, 208, 196)
RAIL = (70, 84, 112)

FONT_PATHS = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def font(size):
    for candidate in FONT_PATHS:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def metres_to_deg(lat):
    return 1 / 111_320, 1 / (111_320 * math.cos(math.radians(lat)))


def overpass(lat, lng, slug, mpp):
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f'{slug}-{mpp:.2f}.json'
    if cached.exists():
        return json.loads(cached.read_text())
    dlat, dlng = metres_to_deg(lat)
    half_w, half_h = W / 2 * mpp * 1.15, H / 2 * mpp * 1.15
    s, n = lat - half_h * dlat, lat + half_h * dlat
    w, e = lng - half_w * dlng, lng + half_w * dlng
    bbox = f'{s},{w},{n},{e}'
    query = f"""
[out:json][timeout:60];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|motorway_link|trunk_link|primary_link)$"]({bbox});
  way["railway"~"^(subway|light_rail|rail)$"]({bbox});
  way["leisure"~"^(park|garden|pitch|golf_course|nature_reserve)$"]({bbox});
  way["landuse"~"^(grass|forest|recreation_ground|meadow)$"]({bbox});
  way["natural"~"^(water|wood|scrub|coastline)$"]({bbox});
  way["waterway"~"^(river|canal)$"]({bbox});
  {'way["building"](' + bbox + ');' if mpp <= BUILDINGS_UP_TO_MPP else ''}
  relation["natural"="water"]({bbox});
  relation["leisure"~"^(park|garden|nature_reserve)$"]({bbox});
  relation["landuse"~"^(forest|grass|recreation_ground)$"]({bbox});
);
out geom;
"""
    body = urllib.parse.urlencode({'data': query}).encode()
    for attempt in range(6):
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        request = urllib.request.Request(endpoint, data=body, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                data = json.load(response)
            cached.write_text(json.dumps(data))
            time.sleep(8)  # be a polite Overpass client
            return data
        except Exception as error:  # 429 / 504 are routine on public instances
            wait = 20 * (attempt + 1)
            print(f'  overpass retry {attempt + 1} for {slug} via {endpoint.split("/")[2]} in {wait}s: {error}', flush=True)
            time.sleep(wait)
    raise RuntimeError(f'Overpass failed for {slug}')


def projector(lat, lng, mpp):
    dlat, dlng = metres_to_deg(lat)

    def to_px(plat, plng):
        x = W / 2 + (plng - lng) / dlng / mpp
        y = H / 2 - (plat - lat) / dlat / mpp
        return (x, y)

    return to_px


ROAD_WIDTH = {
    'motorway': 11, 'trunk': 10, 'primary': 9, 'secondary': 8, 'tertiary': 7,
    'motorway_link': 6, 'trunk_link': 6, 'primary_link': 6,
    'residential': 5, 'unclassified': 5, 'living_street': 4, 'service': 3,
}


def station_name(tags):
    name = tags.get('name', '')
    for suffix in (' MRT Station', ' LRT Station', ' Station'):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name


def scale_for(lat, lng):
    """Zoom out until the nearest station sits inside the frame, with margin."""
    dlat, dlng = metres_to_deg(lat)
    best = None
    for station in json.loads(STATIONS.read_text())['stations']:
        dx = abs(station['lng'] - lng) / dlng  # metres east-west
        dy = abs(station['lat'] - lat) / dlat  # metres north-south
        needed = max(dx / (W / 2 * 0.82), dy / (H / 2 * 0.72))
        best = needed if best is None else min(best, needed)
    return max(BASE_METRES_PER_PX, min(MAX_METRES_PER_PX, round(best or BASE_METRES_PER_PX, 2)))


def render(slug, name, point, approximate):
    lat, lng = point['lat'], point['lng']
    mpp = scale_for(lat, lng)
    data = overpass(lat, lng, slug, mpp)
    px = projector(lat, lng, mpp)
    image = Image.new('RGB', (W, H), LAND)
    draw = ImageDraw.Draw(image)

    ways = [el for el in data['elements'] if el['type'] == 'way' and el.get('geometry')]
    line = lambda el: [px(p['lat'], p['lon']) for p in el['geometry']]

    def is_area(tags):
        return (
            tags.get('leisure') in {'park', 'garden', 'pitch', 'golf_course', 'nature_reserve'}
            or tags.get('landuse') in {'grass', 'forest', 'recreation_ground', 'meadow'}
            or tags.get('natural') in {'wood', 'scrub'}
        )

    relations = [el for el in data['elements'] if el['type'] == 'relation']

    def outer_rings(rel):
        return [
            [px(p['lat'], p['lon']) for p in member['geometry']]
            for member in rel.get('members', [])
            if member.get('role') == 'outer' and member.get('geometry') and len(member['geometry']) > 2
        ]

    # Sea. OpenStreetMap has no sea polygons, only natural=coastline ways drawn with
    # land on the left and water on the right. Stroke the coastline onto a mask, then
    # flood-fill from points just to the right of each segment. Without this every
    # waterfront site (Keppel Bay, Marina View, Bayshore, Pasir Ris) showed the sea as land.
    coast = [el for el in ways if el.get('tags', {}).get('natural') == 'coastline']
    if coast:
        mask = Image.new('L', (W, H), 0)
        mask_draw = ImageDraw.Draw(mask)
        for el in coast:
            mask_draw.line(line(el), fill=255, width=3)
        seeds = []
        for el in coast:
            pts = line(el)
            for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
                dx, dy = x2 - x1, y2 - y1
                length = math.hypot(dx, dy)
                if length < 4:
                    continue
                # Screen y points down, so "right of travel" is (-dy, dx) rotated for image space.
                sx = (x1 + x2) / 2 - dy / length * 6
                sy = (y1 + y2) / 2 + dx / length * 6
                if 0 <= sx < W and 0 <= sy < H:
                    seeds.append((int(sx), int(sy)))
        for seed in seeds:
            if mask.getpixel(seed) == 0:
                ImageDraw.floodfill(mask, seed, 128)
        sea = Image.new('RGB', (W, H), WATER)
        image.paste(sea, (0, 0), mask.point(lambda v: 255 if v == 128 else 0))

    for rel in relations:  # relation parks under way parks, so detail still shows
        if is_area(rel.get('tags', {})):
            for ring in outer_rings(rel):
                draw.polygon(ring, fill=PARK)
    for rel in relations:
        if rel.get('tags', {}).get('natural') == 'water':
            for ring in outer_rings(rel):
                draw.polygon(ring, fill=WATER)
    for el in ways:  # green space first
        if is_area(el.get('tags', {})) and len(el['geometry']) > 2:
            draw.polygon(line(el), fill=PARK)
    for el in ways:  # water
        tags = el.get('tags', {})
        if tags.get('natural') == 'water' and len(el['geometry']) > 2:
            draw.polygon(line(el), fill=WATER)
        elif tags.get('waterway') in {'river', 'canal'}:
            draw.line(line(el), fill=WATER, width=10, joint='curve')
    for el in ways:  # buildings
        if 'building' in el.get('tags', {}) and len(el['geometry']) > 2:
            draw.polygon(line(el), fill=BUILDING)
    roads = [el for el in ways if el.get('tags', {}).get('highway') in ROAD_WIDTH]
    roads.sort(key=lambda el: ROAD_WIDTH[el['tags']['highway']])
    for el in roads:  # casing, then fill, so junctions read cleanly
        width = ROAD_WIDTH[el['tags']['highway']]
        draw.line(line(el), fill=ROAD_CASE, width=width + 3, joint='curve')
    for el in roads:
        width = ROAD_WIDTH[el['tags']['highway']]
        draw.line(line(el), fill=ROAD, width=width, joint='curve')
    for el in ways:  # rail on top of roads: MRT lines are the landmark buyers look for
        if el.get('tags', {}).get('railway') in {'subway', 'light_rail', 'rail'}:
            if el['tags'].get('tunnel') == 'yes' or el['tags'].get('layer', '0').startswith('-'):
                draw.line(line(el), fill=RAIL, width=3, joint='curve')
            else:
                draw.line(line(el), fill=RAIL, width=5, joint='curve')

    # Station positions come from LTA's exit dataset rather than OSM station
    # nodes: OSM tags Singapore stations inconsistently (Hougang MRT, 67 m from
    # the Hougang Central site, had no station node the query could find).
    stations = {}
    for station in json.loads(STATIONS.read_text())['stations']:
        x, y = px(station['lat'], station['lng'])
        if 20 < x < W - 20 and 20 < y < H - 20:
            stations[f"{station['name']} {station['kind']}"] = (x, y)

    cx, cy = W / 2, H / 2
    title_font = font(26)
    title_w = draw.textlength(name, font=title_font)
    title_box = (cx - title_w / 2 - 16, cy - 78, cx + title_w / 2 + 16, cy - 34)
    marker_box = (cx - 26, cy - 26, cx + 26, cy + 26)
    taken = [title_box, marker_box, (0, H - 64, 260, H), (W - 640, H - 44, W, H)]

    def overlaps(box):
        return any(not (box[2] < t[0] or box[0] > t[2] or box[3] < t[1] or box[1] > t[3]) for t in taken)

    label_font = font(19)
    for label, (x, y) in sorted(stations.items(), key=lambda item: abs(item[1][0] - cx) + abs(item[1][1] - cy)):
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(255, 255, 255), outline=RAIL, width=4)
        tw = draw.textlength(label, font=label_font)
        # Try right, left, below, above the station dot; keep the first spot that is free.
        for tx, ty in ((x + 16, y - 13), (x - 16 - tw, y - 13), (x - tw / 2, y + 16), (x - tw / 2, y - 44)):
            tx = min(max(tx, 10), W - tw - 16)
            ty = min(max(ty, 10), H - 72)
            box = (tx - 8, ty - 5, tx + tw + 8, ty + 26)
            if not overlaps(box):
                break
        taken.append(box)
        draw.rounded_rectangle(box, radius=6, fill=(255, 255, 255))
        draw.text((tx, ty), label, fill=NAVY, font=label_font)

    # Site marker: a pin at the centre, then the project label.
    if approximate:
        draw.ellipse((cx - 70, cy - 70, cx + 70, cy + 70), outline=EMERALD, width=3)
    draw.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=EMERALD, outline=(255, 255, 255), width=5)
    draw.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=(255, 255, 255))
    draw.rounded_rectangle(title_box, radius=10, fill=NAVY)
    draw.text((title_box[0] + 16, title_box[1] + 8), name, fill=(255, 255, 255), font=title_font)

    # Scale bar and attribution. ODbL requires the attribution to be visible.
    small = font(15)
    bar_m = 250 if mpp < 2 else 500
    bar_px = bar_m / mpp
    draw.rectangle((24, H - 34, 24 + bar_px, H - 28), fill=NAVY)
    draw.text((24, H - 56), f'{bar_m} m', fill=NAVY, font=small)
    credit = 'Map data © OpenStreetMap contributors (ODbL) · Stations: LTA via data.gov.sg'
    if approximate:
        credit = 'Approximate site location · ' + credit
    cw = draw.textlength(credit, font=small)
    draw.rounded_rectangle((W - cw - 30, H - 36, W - 8, H - 10), radius=6, fill=(255, 255, 255))
    draw.text((W - cw - 19, H - 33), credit, fill=(70, 70, 70), font=small)

    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f'{slug}.webp'
    image.save(target, 'WEBP', quality=82, method=6)
    # JPEG twin for og:image / twitter:image: several link-preview crawlers still skip WebP.
    image.save(OUT / f'{slug}.jpg', 'JPEG', quality=80, optimize=True, progressive=True)
    save_thumb(image, slug)
    return target, len(stations)


def save_thumb(image, slug):
    # 600px card thumbnail for the /new-launches/ catalog: 27 full-size maps would be ~2 MB.
    image.resize((600, 315), Image.LANCZOS).save(OUT / f'{slug}-600.webp', 'WEBP', quality=80, method=6)


KEEP = {
    'highway': {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service',
                'living_street', 'motorway_link', 'trunk_link', 'primary_link'},
    'railway': {'subway', 'light_rail', 'rail'},
    'leisure': {'park', 'garden', 'pitch', 'golf_course', 'nature_reserve'},
    'landuse': {'grass', 'forest', 'recreation_ground', 'meadow'},
    'natural': {'water', 'wood', 'scrub', 'coastline'},
    'waterway': {'river', 'canal'},
}


def wanted(props, with_buildings):
    if with_buildings and props.get('building'):
        return True
    return any(props.get(key) in values for key, values in KEEP.items())


def prime_cache_from_extract(extract, slugs, geo):
    """Stream a GeoJSON extract once and write per-project Overpass-shaped caches."""
    CACHE.mkdir(parents=True, exist_ok=True)
    frames = {}
    for slug in slugs:
        lat, lng = geo[slug]['lat'], geo[slug]['lng']
        mpp = scale_for(lat, lng)
        dlat, dlng = metres_to_deg(lat)
        half_w, half_h = W / 2 * mpp * 1.15, H / 2 * mpp * 1.15
        frames[slug] = {
            'bbox': (lat - half_h * dlat, lng - half_w * dlng, lat + half_h * dlat, lng + half_w * dlng),
            'buildings': mpp <= BUILDINGS_UP_TO_MPP,
            'cache': CACHE / f'{slug}-{mpp:.2f}.json',
            'elements': [],
        }
    opener = lzma.open if str(extract).endswith('.xz') else open
    with opener(extract, 'rt', encoding='utf-8') as handle:
        for raw in handle:
            raw = raw.strip().rstrip(',')
            if not raw.startswith('{"type":"Feature"'):
                continue
            feature = json.loads(raw)
            geometry, props = feature.get('geometry') or {}, feature.get('properties') or {}
            kind = geometry.get('type')
            if kind not in ('LineString', 'Polygon', 'MultiPolygon') or not wanted(props, True):
                continue
            if kind == 'LineString':
                rings = [geometry['coordinates']]
            elif kind == 'Polygon':
                rings = geometry['coordinates'][:1]  # outer ring only
            else:
                rings = [polygon[0] for polygon in geometry['coordinates']]
            for ring in rings:
                lons = [pt[0] for pt in ring]
                lats = [pt[1] for pt in ring]
                for frame in frames.values():
                    s_, w_, n_, e_ = frame['bbox']
                    if max(lats) < s_ or min(lats) > n_ or max(lons) < w_ or min(lons) > e_:
                        continue
                    if props.get('building') and not frame['buildings'] and not wanted(props, False):
                        continue
                    frame['elements'].append({
                        'type': 'way',
                        'tags': props,
                        'geometry': [{'lat': pt[1], 'lon': pt[0]} for pt in ring],
                    })
    for slug, frame in frames.items():
        frame['cache'].write_text(json.dumps({'elements': frame['elements']}))
        print(f'  {slug}: {len(frame["elements"])} features from extract', flush=True)


def main():
    args = sys.argv[1:]
    extract = None
    if args[:1] == ['--extract']:
        extract, args = args[1], args[2:]
    if args[:1] == ['--thumbs']:
        for source in sorted(OUT.glob('*.webp')):
            if source.stem.endswith('-600'):
                continue
            save_thumb(Image.open(source).convert('RGB'), source.stem)
        print('thumbnails refreshed')
        return
    geo = json.loads(GEO.read_text())
    # Same trim as the page title: the W Residences marketing name ends " - Singapore".
    names = {p['slug']: p['name'].removesuffix(' - Singapore') for p in json.loads(PROJECTS.read_text())['projects']}
    slugs = args or sorted(geo)
    if extract:
        prime_cache_from_extract(extract, slugs, geo)
    failed = []
    for slug in slugs:
        point = geo[slug]
        try:
            target, station_count = render(slug, names.get(slug, slug), point, point.get('approximate', False))
        except Exception as error:
            failed.append(slug)
            print(f'{slug:30} FAILED: {error}', flush=True)
            continue
        print(f'{slug:30} {target.stat().st_size // 1024:>4} KB  {station_count} station label(s)', flush=True)
    if failed:
        print('Re-run for: ' + ' '.join(failed))
        sys.exit(1)


if __name__ == '__main__':
    main()
