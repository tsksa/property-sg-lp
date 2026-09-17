#!/usr/bin/env python3
"""Turn the downloaded datasets into the tables and figures the articles use.

    python3 scripts/market-articles/analyse.py

Reads and writes $MARKET_DATA_DIR (see config.py):
  town-quarter.json  median price and deal count by town and flat type, plus $1m+ counts
  cheapest.json      4-room and 5-room town ranking over the six-month window
  summary.json       every other figure quoted in the article prose

The prose in build_articles.py quotes numbers from summary.json by hand. After a
refresh, compare the new summary.json with the text and rewrite what changed.
"""
import json
import re
import statistics as st
from collections import Counter

from config import (CHEAPEST_WINDOW, DATA_DIR, PREV_QUARTER, QUARTER, RENT_PREV_QUARTER, RENT_QUARTER,
                    RENT_YEAR_AGO, SINCE_QUARTER, YEAR_AGO_QUARTER)

SQFT_PER_SQM = 10.7639


def lease_years(text):
    m = re.match(r'(\d+) years?(?: (\d+) months?)?', text)
    return int(m.group(1)) + int(m.group(2) or 0) / 12


def price(row):
    return float(row['resale_price'])


def median_price(rows):
    return st.median([price(r) for r in rows]) if rows else None


def pct(new, old):
    return round((new / old - 1) * 100, 1)


def main():
    resale = json.loads((DATA_DIR / 'resale.json').read_text())
    rows = lambda months: [r for m in months for r in resale[m]]
    q, prev, yago, since = rows(QUARTER), rows(PREV_QUARTER), rows(YEAR_AGO_QUARTER), rows(SINCE_QUARTER)
    of = lambda rs, ft: [r for r in rs if r['flat_type'] == ft]
    summary = {'deals': {'quarter': len(q), 'prev': len(prev), 'year_ago': len(yago), 'since': len(since)}}

    # Flat-type medians.
    summary['flat_types'] = {}
    for ft in ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE']:
        a, b, c = of(q, ft), of(prev, ft), of(yago, ft)
        summary['flat_types'][ft] = {
            'n': len(a), 'median': median_price(a), 'prev': median_price(b), 'year_ago': median_price(c),
            'qoq': pct(median_price(a), median_price(b)), 'yoy': pct(median_price(a), median_price(c)),
            'psf': round(st.median([price(r) / (float(r['floor_area_sqm']) * SQFT_PER_SQM) for r in a])),
        }

    # Town by flat type.
    towns = {}
    for town in sorted({r['town'] for r in q}):
        rec = {}
        for ft in ['3 ROOM', '4 ROOM', '5 ROOM']:
            a = [r for r in of(q, ft) if r['town'] == town]
            c = [r for r in of(yago, ft) if r['town'] == town]
            rec[ft] = {'n': len(a), 'med': median_price(a), 'n2q25': len(c), 'med2q25': median_price(c)}
            if len(a) >= 10:
                rec[ft]['share90'] = round(100 * sum(lease_years(r['remaining_lease']) >= 90 for r in a) / len(a))
                rec[ft]['lease'] = round(st.median([lease_years(r['remaining_lease']) for r in a]))
            if len(c) >= 10:
                rec[ft]['share90_year_ago'] = round(100 * sum(lease_years(r['remaining_lease']) >= 90 for r in c) / len(c))
                rec[ft]['lease_year_ago'] = round(st.median([lease_years(r['remaining_lease']) for r in c]))
        in_town = [r for r in q if r['town'] == town]
        rec['all'] = {'n': len(in_town), 'm1': sum(price(r) >= 1e6 for r in in_town)}
        towns[town] = rec
    (DATA_DIR / 'town-quarter.json').write_text(json.dumps(towns, indent=1))

    # 4-room like-for-like by remaining lease.
    summary['four_room_by_lease'] = []
    for lo, hi in [(0, 60), (60, 80), (80, 95)]:
        band = lambda rs: [r for r in of(rs, '4 ROOM') if lo <= lease_years(r['remaining_lease']) < hi]
        a, c = band(q), band(yago)
        summary['four_room_by_lease'].append({'band': f'{lo}-{hi}', 'n': len(a), 'median': median_price(a),
                                              'year_ago': median_price(c), 'change': pct(median_price(a), median_price(c))})

    # Million-dollar flats and the early read after the quarter.
    million = [r for r in q if price(r) >= 1e6]
    top = max(q, key=price)
    summary['million'] = {'quarter': len(million), 'prev': sum(price(r) >= 1e6 for r in prev),
                          'year_ago': sum(price(r) >= 1e6 for r in yago),
                          'by_town': Counter(r['town'] for r in million).most_common(6),
                          'by_type': Counter(r['flat_type'] for r in million).most_common(),
                          'top': {k: top[k] for k in ('month', 'town', 'flat_type', 'block', 'street_name', 'storey_range', 'resale_price')}}
    summary['since'] = {'deals': len(since), 'million': sum(price(r) >= 1e6 for r in since),
                        **{ft: median_price(of(since, ft)) for ft in ['4 ROOM', '5 ROOM']}}

    # Cheapest towns over the six-month window.
    window = rows(CHEAPEST_WINDOW)
    cheapest = {}
    for ft in ['4 ROOM', '5 ROOM']:
        ranked = []
        for town in sorted({r['town'] for r in window}):
            a = [r for r in of(window, ft) if r['town'] == town]
            if len(a) < 10:
                continue
            p = [price(r) for r in a]
            young = [price(r) for r in a if lease_years(r['remaining_lease']) >= 70]
            ranked.append({'town': town, 'n': len(a), 'med': st.median(p), 'p25': st.quantiles(p, n=4)[0], 'low': min(p),
                           'lease': st.median([lease_years(r['remaining_lease']) for r in a]),
                           'sqm': st.median([float(r['floor_area_sqm']) for r in a]),
                           'n70': len(young), 'med70': st.median(young) if len(young) >= 5 else None})
        cheapest[ft] = sorted(ranked, key=lambda x: x['med'])
        summary[f'window_deals_{ft}'] = sum(r['flat_type'] == ft for r in window)
    summary['lowest_4_room'] = sorted(({'price': price(r), 'town': r['town'], 'lease': r['remaining_lease'], 'month': r['month']}
                                       for r in of(window, '4 ROOM')), key=lambda x: x['price'])[:25]
    (DATA_DIR / 'cheapest.json').write_text(json.dumps(cheapest, indent=1))

    # Rents: islandwide medians from approvals, and how many towns moved.
    approvals = json.loads((DATA_DIR / 'renting-out.json').read_text())
    arows = lambda months: [r for m in months for r in approvals[m]]
    summary['rent_islandwide'] = {}
    for ft in ['3-ROOM', '4-ROOM', '5-ROOM', 'EXECUTIVE']:
        med = lambda months: st.median([float(r['monthly_rent']) for r in arows(months) if r['flat_type'] == ft])
        summary['rent_islandwide'][ft] = {'quarter': med(QUARTER), 'prev': med(PREV_QUARTER), 'year_ago': med(YEAR_AGO_QUARTER), 'since': med(SINCE_QUARTER)}
    summary['rent_approvals_in_dataset'] = {'quarter': len(arows(QUARTER)), 'year_ago': len(arows(YEAR_AGO_QUARTER))}

    rent = json.loads((DATA_DIR / 'median-rent.json').read_text())
    value = lambda r: float(r['median_rent']) if r['median_rent'].replace('.', '').isdigit() else None
    summary['rent_town_moves'] = {}
    for code in ['3-RM', '4-RM', '5-RM']:
        def moves(old_q):
            now = {r['town']: value(r) for r in rent if r['quarter'] == RENT_QUARTER and r['flat_type'] == code and value(r)}
            old = {r['town']: value(r) for r in rent if r['quarter'] == old_q and r['flat_type'] == code and value(r)}
            pairs = [(old[t], now[t]) for t in now if t in old]
            return {'towns': len(pairs), 'up': sum(n > o for o, n in pairs), 'down': sum(n < o for o, n in pairs),
                    'median_change': round(st.median([(n / o - 1) * 100 for o, n in pairs]), 1)}
        summary['rent_town_moves'][code] = {'qoq': moves(RENT_PREV_QUARTER), 'yoy': moves(RENT_YEAR_AGO)}

    (DATA_DIR / 'summary.json').write_text(json.dumps(summary, indent=1))
    print(f'wrote town-quarter.json, cheapest.json and summary.json to {DATA_DIR}')


if __name__ == '__main__':
    main()
