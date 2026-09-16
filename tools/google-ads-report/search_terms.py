#!/usr/bin/env python3
"""Search terms report - what people actually typed to trigger your ads.

Highlights spend that produced no conversions, which is the raw material for
negative keywords. Read-only, like the campaign report.

    python search_terms.py --days 30
    python search_terms.py --days 90 --format csv > terms.csv
"""

import argparse
import csv
import json
import sys
from datetime import date, timedelta

from google.ads.googleads.errors import GoogleAdsException

# Share the credential handling and id normalisation with the campaign report.
from google_ads_report import build_client, digits

QUERY = """
    SELECT
        search_term_view.search_term,
        search_term_view.status,
        segments.keyword.info.text,
        segments.keyword.info.match_type,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '{start}' AND '{end}'
    ORDER BY metrics.cost_micros DESC
"""


def fetch(client, customer_id, start, end):
    service = client.get_service("GoogleAdsService")
    rows = []
    for batch in service.search_stream(customer_id=customer_id,
                                       query=QUERY.format(start=start, end=end)):
        for row in batch.results:
            m = row.metrics
            rows.append({
                "term": row.search_term_view.search_term,
                # ADDED / EXCLUDED / NONE - whether it is already a keyword or negative.
                "status": row.search_term_view.status.name,
                "keyword": row.segments.keyword.info.text,
                "match": row.segments.keyword.info.match_type.name,
                "campaign": row.campaign.name,
                "impressions": m.impressions,
                "clicks": m.clicks,
                "cost": m.cost_micros / 1e6,
                "conversions": m.conversions,
                "conv_value": m.conversions_value,
            })
    return rows


def table(rows, title, note=None):
    if not rows:
        print(f"\n{title}\n  (none)")
        return
    print(f"\n{title}")
    if note:
        print(f"  {note}")
    print("-" * 104)
    print(f"{'Search term':<44}{'Impr.':>8}{'Clicks':>8}{'Cost':>10}"
          f"{'Conv.':>8}{'Match':>10}{'Status':>10}")
    print("-" * 104)
    for r in rows:
        term = r["term"] if len(r["term"]) <= 43 else r["term"][:42] + "…"
        print(f"{term:<44}{r['impressions']:>8,}{r['clicks']:>8,}"
              f"{r['cost']:>10,.2f}{r['conversions']:>8,.2f}"
              f"{r['match'][:9]:>10}{r['status'][:9]:>10}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--end", default=None)
    p.add_argument("--customer-id", default=None)
    p.add_argument("--min-cost", type=float, default=0.0,
                   help="ignore terms costing less than this (default: 0)")
    p.add_argument("--format", choices=("table", "csv", "json"), default="table")
    args = p.parse_args()

    import os
    customer_id = digits(args.customer_id or os.environ.get("GOOGLE_ADS_CUSTOMER_ID", ""))
    if not customer_id:
        sys.exit("No account given. Pass --customer-id or set GOOGLE_ADS_CUSTOMER_ID.")

    end = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)
    start = end - timedelta(days=args.days - 1)

    try:
        rows = fetch(build_client(), customer_id, start, end)
    except GoogleAdsException as error:
        print(f"Google Ads API request failed (request_id {error.request_id}):",
              file=sys.stderr)
        for f in error.failure.errors:
            print(f"  {f.message}", file=sys.stderr)
        sys.exit(1)

    rows = [r for r in rows if r["cost"] >= args.min_cost]

    if args.format == "json":
        json.dump({"start": str(start), "end": str(end), "terms": rows},
                  sys.stdout, indent=2, default=float)
        print()
        return
    if args.format == "csv":
        w = csv.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()) if rows else [])
        w.writeheader()
        w.writerows(rows)
        return

    total_cost = sum(r["cost"] for r in rows)
    converting = [r for r in rows if r["conversions"] > 0]
    # Spend that bought clicks but no conversions - the negative-keyword shortlist.
    waste = [r for r in rows if r["conversions"] == 0 and r["clicks"] > 0]
    wasted = sum(r["cost"] for r in waste)

    print(f"\nSearch terms  |  {customer_id}  |  {start} to {end}")
    print(f"{len(rows)} terms, SGD {total_cost:,.2f} total spend")

    table(converting, "CONVERTED - protect and expand these",
          f"{len(converting)} terms produced "
          f"{sum(r['conversions'] for r in converting):.2f} conversions")

    table(sorted(waste, key=lambda r: -r["cost"])[:25],
          "CLICKS BUT NO CONVERSIONS - negative keyword candidates",
          f"SGD {wasted:,.2f} ({wasted / total_cost * 100:.1f}% of spend) "
          f"across {len(waste)} terms" if total_cost else None)

    if total_cost:
        print(f"\nRecovering that SGD {wasted:,.2f} would fund roughly "
              f"{wasted / 20:.0f} extra days at the current SGD 20/day cap.")
    print()


if __name__ == "__main__":
    main()
