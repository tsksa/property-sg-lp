#!/usr/bin/env python3
"""Read-only campaign audit: keywords, quality score, negatives, ads, assets,
settings, impression share, device and time segments.

    python audit.py --campaign "Search - HDB Seller - Singapore" --days 90
"""

import argparse
import os
import sys
from datetime import date, timedelta

from google.ads.googleads.errors import GoogleAdsException
from google_ads_report import build_client, digits


def run(service, cid, query):
    rows = []
    for batch in service.search_stream(customer_id=cid, query=query):
        rows.extend(batch.results)
    return rows


def section(title):
    print(f"\n{'=' * 100}\n{title}\n{'=' * 100}")


def safe(title, fn):
    section(title)
    try:
        fn()
    except GoogleAdsException as e:
        for f in e.failure.errors:
            print(f"  [query failed] {f.message}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--campaign", required=True)
    p.add_argument("--days", type=int, default=90)
    args = p.parse_args()

    cid = digits(os.environ["GOOGLE_ADS_CUSTOMER_ID"])
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=args.days - 1)
    dr = f"segments.date BETWEEN '{start}' AND '{end}'"
    camp = f"campaign.name = '{args.campaign}'"

    client = build_client()
    svc = client.get_service("GoogleAdsService")
    print(f"Audit: {args.campaign}  |  {start} to {end}")

    def settings():
        q = f"""
        SELECT campaign.id, campaign.status, campaign.bidding_strategy_type,
               campaign.maximize_conversions.target_cpa_micros,
               campaign.target_cpa.target_cpa_micros,
               campaign_budget.amount_micros, campaign_budget.delivery_method,
               campaign.network_settings.target_search_network,
               campaign.network_settings.target_content_network,
               campaign.network_settings.target_partner_search_network,
               campaign.geo_target_type_setting.positive_geo_target_type,
               campaign.optimization_score
        FROM campaign WHERE {camp}"""
        for r in run(svc, cid, q):
            c, b = r.campaign, r.campaign_budget
            print(f"  id={c.id} status={c.status.name}")
            print(f"  bidding={c.bidding_strategy_type.name}"
                  f"  maxconv_tcpa={c.maximize_conversions.target_cpa_micros/1e6:.2f}"
                  f"  tcpa={c.target_cpa.target_cpa_micros/1e6:.2f}")
            print(f"  budget=SGD {b.amount_micros/1e6:.2f}/day delivery={b.delivery_method.name}")
            n = c.network_settings
            print(f"  networks: search={n.target_search_network} display={n.target_content_network}"
                  f" search_partners={n.target_partner_search_network}")
            print(f"  geo_target_type={c.geo_target_type_setting.positive_geo_target_type.name}")
            print(f"  optimization_score={c.optimization_score:.3f}")

    def impression_share():
        q = f"""
        SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.search_impression_share, metrics.search_budget_lost_impression_share,
               metrics.search_rank_lost_impression_share,
               metrics.search_top_impression_share, metrics.search_absolute_top_impression_share,
               metrics.search_exact_match_impression_share
        FROM campaign WHERE {camp} AND {dr}"""
        for r in run(svc, cid, q):
            m = r.metrics
            print(f"  impr={m.impressions:,} clicks={m.clicks:,} cost=SGD {m.cost_micros/1e6:,.2f} conv={m.conversions:.2f}")
            print(f"  impression share       = {m.search_impression_share*100:.1f}%")
            print(f"  lost to BUDGET         = {m.search_budget_lost_impression_share*100:.1f}%")
            print(f"  lost to RANK           = {m.search_rank_lost_impression_share*100:.1f}%")
            print(f"  top-of-page share      = {m.search_top_impression_share*100:.1f}%")
            print(f"  absolute-top share     = {m.search_absolute_top_impression_share*100:.1f}%")
            print(f"  exact-match impr share = {m.search_exact_match_impression_share*100:.1f}%")

    def locations():
        q = f"""
        SELECT campaign_criterion.location.geo_target_constant, campaign_criterion.negative,
               campaign_criterion.bid_modifier, campaign_criterion.type
        FROM campaign_criterion WHERE {camp}
          AND campaign_criterion.type IN (LOCATION, LANGUAGE, DEVICE, AD_SCHEDULE, PROXIMITY)"""
        for r in run(svc, cid, q):
            cc = r.campaign_criterion
            print(f"  {cc.type_.name:<12} neg={cc.negative} bid_mod={cc.bid_modifier:.2f}"
                  f" {cc.location.geo_target_constant}")

    def negatives():
        q1 = f"""SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
                 FROM campaign_criterion WHERE {camp} AND campaign_criterion.negative = TRUE
                 AND campaign_criterion.type = KEYWORD"""
        rows = run(svc, cid, q1)
        print(f"  campaign-level negative keywords: {len(rows)}")
        for r in rows[:50]:
            k = r.campaign_criterion.keyword
            print(f"    -{k.text}  [{k.match_type.name}]")
        q2 = f"""SELECT ad_group.name, ad_group_criterion.keyword.text,
                        ad_group_criterion.keyword.match_type
                 FROM ad_group_criterion WHERE {camp} AND ad_group_criterion.negative = TRUE
                 AND ad_group_criterion.type = KEYWORD"""
        rows = run(svc, cid, q2)
        print(f"  ad-group-level negative keywords: {len(rows)}")
        for r in rows[:50]:
            k = r.ad_group_criterion.keyword
            print(f"    -{k.text}  [{k.match_type.name}]  ({r.ad_group.name})")
        q3 = f"""SELECT shared_set.name, shared_set.type, campaign_shared_set.status
                 FROM campaign_shared_set WHERE {camp}"""
        rows = run(svc, cid, q3)
        print(f"  shared negative lists attached: {len(rows)}")
        for r in rows:
            print(f"    {r.shared_set.name} [{r.shared_set.type_.name}] {r.campaign_shared_set.status.name}")

    def keywords():
        q = f"""
        SELECT ad_group.name, ad_group_criterion.criterion_id,
               ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
               ad_group_criterion.status, ad_group_criterion.approval_status,
               ad_group_criterion.quality_info.quality_score,
               ad_group_criterion.quality_info.creative_quality_score,
               ad_group_criterion.quality_info.post_click_quality_score,
               ad_group_criterion.quality_info.search_predicted_ctr,
               ad_group_criterion.final_urls,
               metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
               metrics.cost_micros, metrics.conversions, metrics.search_impression_share
        FROM keyword_view WHERE {camp} AND {dr}
        ORDER BY metrics.cost_micros DESC"""
        rows = run(svc, cid, q)
        print(f"  {len(rows)} keywords with activity")
        print(f"  {'Keyword':<38}{'Match':<8}{'St':<4}{'QS':>3}{'Rel':>7}{'LP':>7}{'CTR':>7}"
              f"{'Impr':>7}{'Clk':>5}{'Cost':>9}{'Conv':>6}{'IS':>6}  AdGroup")
        for r in rows:
            c, m, qi = r.ad_group_criterion, r.metrics, r.ad_group_criterion.quality_info
            kw = c.keyword.text[:37]
            qs = qi.quality_score if qi.quality_score else 0
            def short(e): return e.name.replace("_", "")[:6] if e else "-"
            print(f"  {kw:<38}{c.keyword.match_type.name[:7]:<8}{c.status.name[:3]:<4}"
                  f"{qs:>3}{short(qi.creative_quality_score):>7}"
                  f"{short(qi.post_click_quality_score):>7}{short(qi.search_predicted_ctr):>7}"
                  f"{m.impressions:>7,}{m.clicks:>5,}{m.cost_micros/1e6:>9.2f}"
                  f"{m.conversions:>6.1f}{m.search_impression_share*100:>5.0f}%  {r.ad_group.name[:20]}")
        q2 = f"""SELECT ad_group.name, ad_group_criterion.keyword.text,
                        ad_group_criterion.keyword.match_type, ad_group_criterion.status
                 FROM ad_group_criterion WHERE {camp} AND ad_group_criterion.type = KEYWORD
                 AND ad_group_criterion.negative = FALSE"""
        allkw = run(svc, cid, q2)
        from collections import Counter
        print(f"\n  total keywords configured: {len(allkw)}")
        print(f"  by match type: {dict(Counter(r.ad_group_criterion.keyword.match_type.name for r in allkw))}")
        print(f"  by status:     {dict(Counter(r.ad_group_criterion.status.name for r in allkw))}")
        print(f"  by ad group:   {dict(Counter(r.ad_group.name for r in allkw))}")

    def ads():
        q = f"""
        SELECT ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status,
               ad_group_ad.policy_summary.approval_status, ad_group_ad.ad_strength,
               ad_group_ad.ad.final_urls,
               ad_group_ad.ad.responsive_search_ad.headlines,
               ad_group_ad.ad.responsive_search_ad.descriptions,
               ad_group_ad.ad.responsive_search_ad.path1,
               ad_group_ad.ad.responsive_search_ad.path2,
               metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions
        FROM ad_group_ad WHERE {camp} AND {dr}"""
        for r in run(svc, cid, q):
            a, m = r.ad_group_ad, r.metrics
            print(f"\n  AD {a.ad.id} [{a.ad.type_.name}] group={r.ad_group.name}")
            print(f"    status={a.status.name} approval={a.policy_summary.approval_status.name}"
                  f" strength={a.ad_strength.name}")
            print(f"    final_url={list(a.ad.final_urls)}  path=/{a.ad.responsive_search_ad.path1}/{a.ad.responsive_search_ad.path2}")
            print(f"    impr={m.impressions:,} clicks={m.clicks:,} ctr={m.ctr*100:.2f}%"
                  f" cost=SGD {m.cost_micros/1e6:.2f} conv={m.conversions:.2f}")
            print("    HEADLINES:")
            for h in a.ad.responsive_search_ad.headlines:
                pin = f" [pinned {h.pinned_field.name}]" if h.pinned_field.name != "UNSPECIFIED" else ""
                print(f"      - {h.text}{pin}")
            print("    DESCRIPTIONS:")
            for d in a.ad.responsive_search_ad.descriptions:
                print(f"      - {d.text}")

    def assets():
        q = f"""
        SELECT campaign.name, asset.id, asset.type, asset.name,
               asset.call_asset.phone_number, asset.sitelink_asset.link_text,
               asset.callout_asset.callout_text, asset.structured_snippet_asset.header,
               asset.policy_summary.approval_status, asset.policy_summary.review_status,
               campaign_asset.field_type, campaign_asset.status
        FROM campaign_asset WHERE {camp}"""
        rows = run(svc, cid, q)
        print(f"  campaign-level assets: {len(rows)}")
        for r in rows:
            a = r.asset
            detail = a.call_asset.phone_number or a.sitelink_asset.link_text or \
                     a.callout_asset.callout_text or a.structured_snippet_asset.header or a.name
            print(f"    {r.campaign_asset.field_type.name:<20} {a.policy_summary.approval_status.name:<12}"
                  f" {r.campaign_asset.status.name:<8} {detail}")
        q2 = f"""
        SELECT campaign.name, ad_group.name, asset.type, asset.call_asset.phone_number,
               asset.sitelink_asset.link_text, asset.callout_asset.callout_text,
               asset.policy_summary.approval_status, ad_group_asset.field_type, ad_group_asset.status
        FROM ad_group_asset WHERE {camp}"""
        rows = run(svc, cid, q2)
        print(f"  ad-group-level assets: {len(rows)}")
        for r in rows:
            a = r.asset
            detail = a.call_asset.phone_number or a.sitelink_asset.link_text or a.callout_asset.callout_text
            print(f"    {r.ad_group_asset.field_type.name:<20} {a.policy_summary.approval_status.name:<12}"
                  f" {r.ad_group_asset.status.name:<8} {detail}  ({r.ad_group.name})")

    def disapproved():
        q = """SELECT asset.id, asset.type, asset.call_asset.phone_number, asset.callout_asset.callout_text,
                      asset.policy_summary.approval_status, asset.policy_summary.policy_topic_entries
               FROM asset WHERE asset.policy_summary.approval_status = DISAPPROVED"""
        for r in run(svc, cid, q):
            a = r.asset
            why = [(e.topic, e.type_.name) for e in a.policy_summary.policy_topic_entries]
            print(f"  {a.type_.name:<8} {a.call_asset.phone_number or a.callout_asset.callout_text!r:<24} {why}")

    def devices():
        q = f"""SELECT segments.device, metrics.impressions, metrics.clicks, metrics.cost_micros,
                       metrics.conversions FROM campaign WHERE {camp} AND {dr}"""
        for r in run(svc, cid, q):
            m = r.metrics
            cpc = m.cost_micros/1e6/m.clicks if m.clicks else 0
            cpa = m.cost_micros/1e6/m.conversions if m.conversions else 0
            print(f"  {r.segments.device.name:<10} impr={m.impressions:>6,} clicks={m.clicks:>4,}"
                  f" cost={m.cost_micros/1e6:>8.2f} cpc={cpc:>5.2f} conv={m.conversions:>5.2f} cpa={cpa:>7.2f}")

    def timing():
        q = f"""SELECT segments.day_of_week, metrics.clicks, metrics.cost_micros, metrics.conversions
                FROM campaign WHERE {camp} AND {dr}"""
        print("  by day of week:")
        for r in run(svc, cid, q):
            m = r.metrics
            print(f"    {r.segments.day_of_week.name:<10} clicks={m.clicks:>4,} cost={m.cost_micros/1e6:>8.2f} conv={m.conversions:.2f}")
        q = f"""SELECT segments.hour, metrics.clicks, metrics.cost_micros, metrics.conversions
                FROM campaign WHERE {camp} AND {dr} ORDER BY segments.hour"""
        print("  by hour (SGT):")
        buckets = {}
        for r in run(svc, cid, q):
            m = r.metrics
            buckets[r.segments.hour] = (m.clicks, m.cost_micros/1e6, m.conversions)
        for h in range(24):
            c, cost, conv = buckets.get(h, (0, 0, 0))
            if c or cost:
                print(f"    {h:02d}:00  clicks={c:>3}  cost={cost:>7.2f}  conv={conv:.2f}")

    def conversions():
        q = """SELECT conversion_action.id, conversion_action.name, conversion_action.type,
                      conversion_action.category, conversion_action.status,
                      conversion_action.counting_type, conversion_action.primary_for_goal,
                      conversion_action.value_settings.default_value
               FROM conversion_action"""
        for r in run(svc, cid, q):
            c = r.conversion_action
            print(f"  {c.name:<40} type={c.type_.name:<22} cat={c.category.name:<14}"
                  f" status={c.status.name:<8} count={c.counting_type.name:<9}"
                  f" primary={c.primary_for_goal} value={c.value_settings.default_value}")
        q = f"""SELECT segments.conversion_action_name, metrics.conversions, metrics.conversions_value
                FROM campaign WHERE {camp} AND {dr}"""
        print("  conversions in this campaign by action:")
        for r in run(svc, cid, q):
            print(f"    {r.segments.conversion_action_name:<40} {r.metrics.conversions:.2f}")

    def geo():
        q = f"""SELECT campaign.name, segments.geo_target_most_specific_location, metrics.clicks,
                       metrics.cost_micros, metrics.conversions
                FROM geographic_view WHERE {camp} AND {dr}
                ORDER BY metrics.cost_micros DESC LIMIT 25"""
        hits = run(svc, cid, q)
        ids = [r.segments.geo_target_most_specific_location.split("/")[-1] for r in hits]
        names = {}
        if ids:
            for r in run(svc, cid, f"""SELECT geo_target_constant.id, geo_target_constant.canonical_name
                    FROM geo_target_constant WHERE geo_target_constant.id IN ({",".join(ids)})"""):
                names[str(r.geo_target_constant.id)] = r.geo_target_constant.canonical_name
        for r in hits:
            m = r.metrics
            gid = r.segments.geo_target_most_specific_location.split("/")[-1]
            print(f"  {names.get(gid, gid):<36} clicks={m.clicks:>4} cost={m.cost_micros/1e6:>7.2f} conv={m.conversions:.2f}")

    safe("CAMPAIGN SETTINGS", settings)
    safe(f"IMPRESSION SHARE ({args.days}d)", impression_share)
    safe("TARGETING CRITERIA", locations)
    safe("NEGATIVE KEYWORDS", negatives)
    safe(f"KEYWORDS + QUALITY SCORE ({args.days}d)", keywords)
    safe(f"ADS ({args.days}d)", ads)
    safe("ASSETS / EXTENSIONS", assets)
    safe("DISAPPROVED ASSETS (account-wide)", disapproved)
    safe(f"DEVICES ({args.days}d)", devices)
    safe(f"TIMING ({args.days}d)", timing)
    safe("CONVERSION ACTIONS", conversions)
    safe(f"GEOGRAPHY ({args.days}d)", geo)


if __name__ == "__main__":
    main()
