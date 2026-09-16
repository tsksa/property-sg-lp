#!/usr/bin/env python3
"""Pull Google Ads campaign performance via the Google Ads API.

Credentials come from environment variables only - never hard-code them.
See README.md for setup.
"""

import argparse
import csv
import json
import os
import sys
from datetime import date, timedelta

try:
    from google.ads.googleads.client import GoogleAdsClient
    from google.ads.googleads.errors import GoogleAdsException
except ImportError:
    sys.exit("Missing dependency. Run: pip install -r requirements.txt")


REQUIRED_ENV = (
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
)

# Fields we pull per campaign. Metrics with a `_micros` suffix are integers
# scaled by 1e6; impression-share metrics are fractions in [0, 1].
QUERY = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_per_conversion,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '{start}' AND '{end}'
    ORDER BY metrics.cost_micros DESC
"""


def digits(value):
    """Google customer IDs are often written 123-456-7890; the API wants digits."""
    return "".join(c for c in str(value) if c.isdigit())


def build_client():
    missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
    if missing:
        sys.exit(
            "Missing environment variables: "
            + ", ".join(missing)
            + "\nSee README.md, or copy .env.example and source it."
        )

    config = {
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "use_proto_plus": True,
    }

    # Required when the credentials belong to a manager (MCC) account and you
    # are querying one of its sub-accounts.
    login_cid = os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
    if login_cid:
        config["login_customer_id"] = digits(login_cid)

    return GoogleAdsClient.load_from_dict(config)


def optional(message, field):
    """Return an optional proto field, or None when the API left it unset.

    Impression-share metrics are withheld when there is too little data, and
    an unset proto double reads back as 0.0 - which would otherwise look like
    a real zero.
    """
    try:
        if field in message:
            return getattr(message, field)
        return None
    except (TypeError, ValueError):
        value = getattr(message, field, None)
        return value


def fetch(client, customer_id, start, end):
    service = client.get_service("GoogleAdsService")
    query = QUERY.format(start=start, end=end)

    rows = []
    for batch in service.search_stream(customer_id=customer_id, query=query):
        for row in batch.results:
            metrics = row.metrics
            rows.append(
                {
                    "campaign_id": row.campaign.id,
                    "campaign": row.campaign.name,
                    "status": row.campaign.status.name,
                    "channel": row.campaign.advertising_channel_type.name,
                    "daily_budget": row.campaign_budget.amount_micros / 1e6,
                    "impressions": metrics.impressions,
                    "clicks": metrics.clicks,
                    "ctr": metrics.ctr * 100,
                    "avg_cpc": metrics.average_cpc / 1e6,
                    "cost": metrics.cost_micros / 1e6,
                    "conversions": metrics.conversions,
                    "conv_value": metrics.conversions_value,
                    "cost_per_conv": metrics.cost_per_conversion / 1e6,
                    "impr_share": _pct(optional(metrics, "search_impression_share")),
                    "budget_lost_share": _pct(
                        optional(metrics, "search_budget_lost_impression_share")
                    ),
                }
            )
    return rows


def _pct(fraction):
    return None if fraction is None else fraction * 100


def totals(rows):
    cost = sum(r["cost"] for r in rows)
    clicks = sum(r["clicks"] for r in rows)
    impressions = sum(r["impressions"] for r in rows)
    conversions = sum(r["conversions"] for r in rows)
    return {
        "campaign": "TOTAL",
        "impressions": impressions,
        "clicks": clicks,
        "ctr": (clicks / impressions * 100) if impressions else 0.0,
        "avg_cpc": (cost / clicks) if clicks else 0.0,
        "cost": cost,
        "conversions": conversions,
        "conv_value": sum(r["conv_value"] for r in rows),
        "cost_per_conv": (cost / conversions) if conversions else 0.0,
    }


COLUMNS = [
    ("campaign", "Campaign", 34, "{:<}"),
    ("status", "Status", 8, "{:<}"),
    ("impressions", "Impr.", 9, "{:,.0f}"),
    ("clicks", "Clicks", 8, "{:,.0f}"),
    ("ctr", "CTR", 7, "{:.2f}%"),
    ("avg_cpc", "Avg CPC", 9, "{:,.2f}"),
    ("cost", "Cost", 11, "{:,.2f}"),
    ("conversions", "Conv.", 8, "{:,.2f}"),
    ("cost_per_conv", "Cost/conv", 11, "{:,.2f}"),
    ("budget_lost_share", "BudgetLost", 11, "{:.1f}%"),
]


def render(cell, spec, width):
    if cell is None:
        return "-".rjust(width)
    text = spec.format(cell)
    return text.ljust(width) if spec == "{:<}" else text.rjust(width)


def print_table(rows, summary, label):
    print(f"\n{label}")
    print("-" * 128)
    header = "  ".join(title.ljust(w) if f == "{:<}" else title.rjust(w)
                       for _, title, w, f in COLUMNS)
    print(header)
    print("-" * 128)

    for row in rows:
        line = []
        for key, _, width, spec in COLUMNS:
            value = row.get(key)
            if key == "campaign" and value and len(value) > width:
                value = value[: width - 1] + "…"
            line.append(render(value, spec, width))
        print("  ".join(line))

    print("-" * 128)
    line = []
    for key, _, width, spec in COLUMNS:
        value = summary.get(key)
        if key == "status":
            value = ""
        line.append(render(value, spec, width))
    print("  ".join(line))


def print_deltas(current, previous):
    print("\nChange vs previous period")
    print("-" * 60)
    pairs = [
        ("Impressions", "impressions", "{:+,.0f}"),
        ("Clicks", "clicks", "{:+,.0f}"),
        ("Cost", "cost", "{:+,.2f}"),
        ("Conversions", "conversions", "{:+,.2f}"),
        ("Cost / conv.", "cost_per_conv", "{:+,.2f}"),
    ]
    for title, key, spec in pairs:
        delta = current[key] - previous[key]
        base = previous[key]
        pct = f"  ({delta / base * 100:+.1f}%)" if base else ""
        print(f"  {title:<15}{spec.format(delta):>14}{pct}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30,
                        help="length of the reporting window (default: 30)")
    parser.add_argument("--end", default=None,
                        help="last day of the window, YYYY-MM-DD (default: yesterday)")
    parser.add_argument("--customer-id", default=os.environ.get("GOOGLE_ADS_CUSTOMER_ID"),
                        help="account to report on; defaults to $GOOGLE_ADS_CUSTOMER_ID")
    parser.add_argument("--compare", action="store_true",
                        help="also pull the preceding window and show deltas")
    parser.add_argument("--format", choices=("table", "csv", "json"), default="table")
    args = parser.parse_args()

    if not args.customer_id:
        sys.exit("No account given. Pass --customer-id or set GOOGLE_ADS_CUSTOMER_ID.")
    customer_id = digits(args.customer_id)

    # Google Ads reporting is not real-time, so yesterday is the last
    # trustworthy full day.
    end = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)
    start = end - timedelta(days=args.days - 1)

    client = build_client()

    try:
        rows = fetch(client, customer_id, start, end)
    except GoogleAdsException as error:
        print(f"Google Ads API request failed (request_id {error.request_id}):",
              file=sys.stderr)
        for failure in error.failure.errors:
            print(f"  {failure.message}", file=sys.stderr)
            if failure.location:
                fields = ".".join(p.field_name for p in failure.location.field_path_elements)
                print(f"    at: {fields}", file=sys.stderr)
        sys.exit(1)

    if args.format == "json":
        json.dump({"start": str(start), "end": str(end), "campaigns": rows},
                  sys.stdout, indent=2, default=float)
        print()
        return

    if args.format == "csv":
        writer = csv.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()) if rows else [])
        writer.writeheader()
        writer.writerows(rows)
        return

    summary = totals(rows)
    print_table(rows, summary, f"Google Ads {customer_id}  |  {start} to {end}")

    if args.compare:
        prev_end = start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=args.days - 1)
        previous = totals(fetch(client, customer_id, prev_start, prev_end))
        print_deltas(summary, previous)

    print()


if __name__ == "__main__":
    main()
