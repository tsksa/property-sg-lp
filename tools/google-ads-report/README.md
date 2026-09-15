# Google Ads reporting

Pulls campaign performance from the Google Ads API instead of reading the web UI.

Lives in the joetay.com repo because these campaigns drive traffic here.

| | |
|---|---|
| Manager (MCC) | `948-996-2292` — Joe Tay |
| Ads account | `435-311-8591` — where the campaigns live |
| Site | joetay.com (this repo) |
| GA4 | `G-1YQE8JN66P` |
| Ads conversion | `AW-18046717591` |

The conversion tag is already wired into `index.html` and `valuation.html`, which
is why this account reports real conversions. Numbers from the API should
reconcile against that tag - if they ever diverge, suspect the tag, not the API.

## Setup

Four things are needed. The developer token is the slow one — start there.

### 1. Developer token

Google Ads → **Tools → API Center** (on the **manager** account, 948-996-2292).

A token is issued immediately, but it starts at **Test Access**, which can only
query *test* accounts — it will not return data for 435-311-8591. You must apply
for **Basic Access** and wait for approval. This is usually a day or two but can
be longer, and it is the one step that cannot be rushed or worked around.

### 2. OAuth client — DONE

Already set up on 2026-09-06, in a dedicated project so nothing shares config
with Ellie Calendar or Runjio Development:

| | |
|---|---|
| Cloud project | `JoeTay Ads API` (`joetay-ads-api`), org joetay.com |
| Google Ads API | Enabled |
| Consent screen | `JoeTay Ads Reporting`, audience **Internal** |
| OAuth client | `ads-report-cli`, type **Desktop app** |

Because the audience is **Internal** (possible only on a Workspace domain), the
app needs no verification and no publishing, and — the part that matters —
refresh tokens do **not** expire after 7 days the way they do for an External
app left in Testing. There is nothing to re-do weekly.

Get the client ID and secret from
[Clients → ads-report-cli](https://console.cloud.google.com/auth/clients?project=joetay-ads-api)
and put them straight into `.env`.

### 3. Refresh token

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

export GOOGLE_ADS_CLIENT_ID=...
export GOOGLE_ADS_CLIENT_SECRET=...
.venv/bin/python get_refresh_token.py
```

A browser opens, you approve, and it prints the refresh token.

### 4. Environment

```bash
cp .env.example .env      # fill it in
set -a && source .env && set +a
```

`.env` is gitignored. Nothing is ever read from the command line or hard-coded.

## Status

Fully configured and verified. All six credentials are in `.env` and authenticate
correctly against `googleads.googleapis.com` (v25).

**Basic Access application submitted 2026-09-06.** Google acknowledged receipt and
quotes an initial review within 5 business days (so roughly 2026-09-11 to 09-15),
without guaranteeing a final decision in that window. Watch **joe@joetay.com** —
reviewers may ask for clarification, and an unanswered query stalls the application.

Until it is approved the API answers every query with:

> The developer token is only approved for use with test accounts. To access
> non-test accounts, apply for Basic or Standard access.

That is the expected response, not a misconfiguration.

### What was declared

Keep the tool consistent with this, or a later review may object:

| | |
|---|---|
| Capabilities | Reporting only |
| Campaign types | Search |
| Access | Internal, single user |
| Operations | Read-only; no mutates |
| Services used | `GoogleAdsService.SearchStream` on `campaign` |

Supporting design document: `JoeTay-Ads-API-Design-Document.pdf` (in this folder).

### Optional: expedite

Google offers faster processing if you complete **brand verification** for the
`joetay-ads-api` Cloud project.

### Outstanding

API Center Developer Details still show `freevaluation.sg` and
`andylaubot@gmail.com`, while the application declares `joetay.com` and
`joe@joetay.com`. Worth aligning - a mismatch is a common cause of reviewer queries.

Note: revealing the developer token in the UI requires a passkey re-auth, so it
cannot be re-copied unattended.

## Use

```bash
# Last 30 days for the default account
.venv/bin/python google_ads_report.py

# With period-over-period deltas
.venv/bin/python google_ads_report.py --compare

# Last 7 days
.venv/bin/python google_ads_report.py --days 7

# A fixed window, as CSV
.venv/bin/python google_ads_report.py --days 30 --end 2026-09-05 --format csv > sept.csv

# Machine-readable
.venv/bin/python google_ads_report.py --format json
```

The reporting window ends **yesterday** by default, because Google Ads reporting
is not real-time and today's numbers are always partial.

## The column that matters

`BudgetLost` is `search_budget_lost_impression_share` — the share of impressions
you were eligible for but lost purely because the daily budget ran out. This is
the metric behind the "Limited by budget" warning in the UI, and it is the thing
worth watching on `Search - HDB Seller - Singapore`, which is capped at
SGD 20/day and spending essentially all of it.

A dash means Google withheld the figure for want of data, which is not the same
as zero — the script distinguishes the two rather than printing 0.0%.

## Scheduling

Once it runs cleanly, a weekly snapshot is just cron:

```
0 9 * * MON  cd /path/to/google-ads-report && set -a && . ./.env && set +a && \
             .venv/bin/python google_ads_report.py --compare >> history.log 2>&1
```
