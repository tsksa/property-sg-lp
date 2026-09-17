#!/usr/bin/env python3
"""Download the data.gov.sg datasets behind the quarterly market articles.

    python3 scripts/market-articles/fetch_data.py

Writes to $MARKET_DATA_DIR (default /tmp/joetay-market-data), never into the
repo: Netlify publishes the repo root, and the raw files are ~25 MB.

  resale.json        HDB resale flat prices (d_8b84c4ee58e3cfc0ece0d773c8ca6abc), by month
  median-rent.json   HDB median rent by town and flat type (d_23000a00c52996c55106084ed0339566)
  renting-out.json   HDB approvals to rent out flats (d_c9f57187485a850908655db0e8cfe651), by month

All three are HDB data under the Singapore Open Data Licence. Months are set in
config.py; change them there for the next quarter.
"""
import json
import time
import urllib.parse
import urllib.request

from config import DATA_DIR, RESALE_MONTHS, RENT_MONTHS

API = 'https://data.gov.sg/api/action/datastore_search'
UA = {'User-Agent': 'joetay.com market articles (joe@joetay.com)'}
RESALE = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc'
MEDIAN_RENT = 'd_23000a00c52996c55106084ed0339566'
RENTING_OUT = 'd_c9f57187485a850908655db0e8cfe651'


def get(params):
    url = f'{API}?{urllib.parse.urlencode(params)}'
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as response:
                return json.load(response)['result']
        except Exception:  # data.gov.sg rate-limits bursts with 429s
            time.sleep(8 * (attempt + 1))
    raise SystemExit(f'data.gov.sg request failed: {url}')


def by_month(resource, field, months):
    out = {}
    for month in months:
        rows, offset = [], 0
        while True:
            result = get({'resource_id': resource, 'filters': json.dumps({field: month}), 'limit': 5000, 'offset': offset})
            rows += result['records']
            if len(result['records']) < 5000:
                break
            offset += 5000
        out[month] = rows
        print(f'{resource} {month}: {len(rows)} rows', flush=True)
        time.sleep(2)
    return out


def all_rows(resource):
    # The median-rent dataset cannot be filtered or sorted by quarter, so page through all of it.
    rows, offset = [], 0
    while True:
        result = get({'resource_id': resource, 'limit': 5000, 'offset': offset})
        rows += result['records']
        if len(result['records']) < 5000:
            return rows
        offset += 5000
        time.sleep(2)


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / 'resale.json').write_text(json.dumps(by_month(RESALE, 'month', RESALE_MONTHS)))
    (DATA_DIR / 'renting-out.json').write_text(json.dumps(by_month(RENTING_OUT, 'rent_approval_date', RENT_MONTHS)))
    rent = all_rows(MEDIAN_RENT)
    for row in rent:
        row['town'] = row['town'].strip()  # "QUEENSTOWN " carries a trailing space in the source
    (DATA_DIR / 'median-rent.json').write_text(json.dumps(rent))
    print(f'median rent: {len(rent)} rows; wrote {DATA_DIR}')


if __name__ == '__main__':
    main()
