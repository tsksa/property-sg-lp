# Quarterly market articles

Builds the five data-led guides in `insights/` (JOE-389):

- `hdb-resale-prices-2q-2026-by-town.html`
- `15-month-wait-out-removed-private-owners-hdb.html`
- `cheapest-4-room-5-room-hdb-resale-flats.html`
- `singapore-rental-market-2q-2026.html`
- `new-condo-launches-2026-2027-calendar.html`

## Refresh for a new quarter

1. Edit `config.py`: the quarter's months, the previous and year-ago quarters, the months since, the six-month cheapest window and the rent quarters.
2. Download and analyse. Data goes to `$MARKET_DATA_DIR` (default `/tmp/joetay-market-data`), never into the repo, because Netlify publishes the repo root.
   ```bash
   python3 scripts/market-articles/fetch_data.py
   python3 scripts/market-articles/analyse.py
   ```
3. Compare `summary.json` with the prose in `build_articles.py` and rewrite every figure that changed. The official HDB and URA figures (price index, transaction counts, rental approvals, vacancy) come from the quarter's press releases, not from these datasets; update them and their source links by hand.
4. Build, then re-apply the TOC and run the checks:
   ```bash
   python3 scripts/market-articles/build_articles.py
   npm run apply:article-toc
   npm run check
   ```
5. For a new quarter, consider new slugs (for example `hdb-resale-prices-3q-2026-by-town`) and update the insights index, both feeds, the sitemap, llms.txt and the sibling-link lists in `generate-hdb-loan-cluster.mjs`, `generate-hdb-grants-cluster.mjs` and the hand-built articles.

The launch calendar reads `new-launches/projects.json`; rebuild it whenever a launch date is confirmed or moves.

Requires Python 3.9+ and network access; no third-party packages.
