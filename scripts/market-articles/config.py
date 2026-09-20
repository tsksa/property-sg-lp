"""Periods for the quarterly market articles. Update these for each refresh.

Quarters follow the resale dataset's registration month, so 2Q = April to June.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get('MARKET_DATA_DIR', '/tmp/joetay-market-data'))

QUARTER = ['2026-04', '2026-05', '2026-06']          # the quarter being reported
PREV_QUARTER = ['2026-01', '2026-02', '2026-03']
YEAR_AGO_QUARTER = ['2025-04', '2025-05', '2025-06']
SINCE_QUARTER = ['2026-07', '2026-08']               # months after the quarter, for the early read
CHEAPEST_WINDOW = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']  # six months

RENT_QUARTER, RENT_PREV_QUARTER, RENT_YEAR_AGO = '2026-Q2', '2026-Q1', '2025-Q2'

RESALE_MONTHS = sorted(set(QUARTER + PREV_QUARTER + YEAR_AGO_QUARTER + SINCE_QUARTER + CHEAPEST_WINDOW))
RENT_MONTHS = sorted(set(QUARTER + PREV_QUARTER + YEAR_AGO_QUARTER + SINCE_QUARTER))

# Minimum deals before a median is shown.
MIN_DEALS = 10          # town medians in the price and cheapest tables
MIN_DEALS_YIELD = 20    # resale deals behind a gross-yield figure
