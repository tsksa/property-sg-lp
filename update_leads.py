#!/usr/bin/env python3
"""update_leads.py - Maintain the Home Valuation Leads Google Sheet.

Re-runnable tool. To add new leads or backfill, edit the CONFIG block below
and run:

    pip install gspread google-auth-oauthlib
    python update_leads.py

First-run setup (one-time):
  1. https://console.cloud.google.com -> create or pick a project
  2. APIs & Services -> Library -> enable BOTH:
       - Google Sheets API
       - Google Drive API
  3. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
       - Application type: Desktop app
       - Download the JSON, rename to credentials.json, drop it next to this script
  4. Run the script. A browser tab opens for consent. After approving,
     a token.json is cached locally and used for all subsequent runs.

Note: the original spec mentioned oauth2client, but that library is
officially deprecated. gspread.oauth() uses google-auth-oauthlib instead
- same credentials.json (Desktop app), same one-time browser flow.
"""

import sys
from pathlib import Path

# =============================================================================
# CONFIG - edit this block to add new leads or backfill existing ones
# =============================================================================

SPREADSHEET_ID = "11oI0Ga6goPFNQDgVTssEC7SBkB7AQTEAC2SX0kL5r2Q"
SHEET_GID = 1124990297

# Columns that already exist on the sheet, in order. The script bails if
# this no longer matches what's on the live sheet.
EXISTING_HEADERS = [
    "Timestamp",
    "Source Site",
    "Lead Type",
    "Full Name",
    "Mobile",
    "Email",
    "Property Type",
    "Detected Address",
    "Detected Postal",
    "HDB (room type)",
    "Comments",
]

# Columns to add (to the right of EXISTING_HEADERS). dropdown=None means
# free-text. Order here defines the order on the sheet.
NEW_COLUMNS = [
    {
        "name": "Source Channel",
        "dropdown": ["GAds", "WebCall", "WebForm", "FB", "SMS", "Mailer", "Ref", "WalkIn"],
    },
    {
        "name": "Seller Type",
        "dropdown": ["Estate-Exec", "Upgrader", "Downgrader", "Investor",
                     "Owner-Occupier", "1st-Time", "Inheritor"],
    },
    {
        "name": "Stage",
        "dropdown": ["New", "Working", "Val-sent", "Meet-set",
                     "Closed-won", "Closed-lost", "Nurture", "Fake"],
    },
    {"name": "Next Action", "dropdown": None},
    {"name": "X-Value",     "dropdown": None},
]

# Leads to append as new rows. Each dict's keys must be column names.
# Missing keys become blank cells.
NEW_LEADS = [
    {
        "Timestamp": "2026-05-21 14:19",
        "Source Site": "joetay.com",
        "Lead Type": "consultation",
        "Full Name": "Joseph",
        "Mobile": "81508200",
        "Email": "",
        "Property Type": "HDB",
        "Detected Address": "166A Teck Whye Crescent #17-347",
        "Detected Postal": "681166",
        "HDB (room type)": "2-room",
        "Comments": "Executor of estate. Travelling now. Wed meet locked.",
        "Source Channel": "WebCall",
        "Seller Type": "Estate-Exec",
        "Stage": "Meet-set",
        "Next Action": "Wed 27 May meet - prep valuation deck + request probate docs",
        "X-Value": "$368,000",
    },
]

# Backfill existing rows. Key = Full Name (matched case-sensitively, trimmed).
# Only listed fields are written. If a cell already has a value, it is NOT
# overwritten - a warning is logged.
BACKFILLS = {
    "Ellen":             {"Source Channel": "GAds", "Stage": "Meet-set"},
    "Hui ching":         {"Source Channel": "GAds", "Seller Type": "Upgrader", "Stage": "Working"},
    "TEO TECK NAM":      {"Source Channel": "GAds", "Stage": "Fake"},
    "Mln Chan Daim":     {"Source Channel": "GAds", "Stage": "Fake"},
    "Komathi Kailasam":  {"Source Channel": "GAds", "Stage": "Val-sent"},
    "Audrey":            {"Source Channel": "GAds", "Stage": "Closed-lost"},
    "Richelle Patricio": {"Source Channel": "GAds", "Stage": "Val-sent"},
    "mohd feroz":        {"Source Channel": "GAds", "Stage": "Closed-lost"},
    "Lim xin hui":       {"Source Channel": "GAds", "Stage": "Closed-lost"},
    "chengminwai":       {"Source Channel": "GAds", "Stage": "Closed-lost"},
    "Jack Iskhander":    {"Source Channel": "GAds", "Stage": "Nurture"},
    "LINGXUHAN":         {"Source Channel": "GAds", "Stage": "Fake"},
    "AungMyoThu":        {"Source Channel": "GAds", "Stage": "Fake"},
    "R NAGARAJU":        {"Source Channel": "GAds", "Stage": "Fake"},
    "Lwin ko aung":      {"Source Channel": "GAds", "Stage": "Fake"},
    "William":           {"Source Channel": "GAds", "Stage": "Val-sent"},
    "Natasha":           {"Source Channel": "GAds", "Seller Type": "Investor", "Stage": "Val-sent"},
    "jon":               {"Source Channel": "GAds", "Stage": "Val-sent"},
    "Lee":               {"Source Channel": "GAds", "Stage": "Nurture"},
    "francis":           {"Source Channel": "GAds", "Stage": "Fake"},
}

# Auto-derive "Next Action" from Stage during backfill, unless the backfill
# entry already specifies a Next Action. Stages absent here -> Next Action
# left blank (e.g. Closed-lost, Fake, Closed-won).
NEXT_ACTION_BY_STAGE = {
    "Val-sent": "Follow-up message - meet ask",
    "Working":  "Active engagement",
    "Meet-set": "Confirm meet",
    "Nurture":  "60-day re-touch",
}

# Local auth files (placed next to this script).
CREDENTIALS_PATH = "credentials.json"
TOKEN_PATH       = "token.json"

# =============================================================================
# Implementation - usually no need to edit below
# =============================================================================


def authorize():
    """OAuth via gspread.oauth(). First run pops a browser; later runs use token.json."""
    try:
        import gspread  # noqa: F401
    except ImportError:
        sys.exit("Missing dependency. Run:  pip install gspread google-auth-oauthlib")

    if not Path(CREDENTIALS_PATH).exists():
        sys.exit(
            f"Missing {CREDENTIALS_PATH} next to this script.\n\n"
            "One-time setup:\n"
            "  1. https://console.cloud.google.com -> create or select a project\n"
            "  2. APIs & Services -> Library -> enable Google Sheets API AND Google Drive API\n"
            "  3. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID\n"
            "       Application type: Desktop app\n"
            "       Download JSON, rename to credentials.json, put it in this directory\n"
            "  4. Re-run. A browser will open for consent on first run only.\n"
        )

    import gspread
    try:
        return gspread.oauth(
            credentials_filename=CREDENTIALS_PATH,
            authorized_user_filename=TOKEN_PATH,
        )
    except Exception as exc:
        sys.exit(
            f"OAuth failed: {exc}\n\n"
            "Recovery checklist:\n"
            f"  - Delete {TOKEN_PATH} and re-run to redo consent.\n"
            "  - Confirm the OAuth client type is 'Desktop app' (not Web).\n"
            "  - Confirm Sheets API AND Drive API are both enabled.\n"
            "  - Confirm the signed-in Google account can open the spreadsheet.\n"
            "  - If 'access blocked: not verified', add your email as a test user\n"
            "    on the OAuth consent screen.\n"
        )


def open_worksheet(client):
    spreadsheet = client.open_by_key(SPREADSHEET_ID)
    for ws in spreadsheet.worksheets():
        if ws.id == SHEET_GID:
            return spreadsheet, ws
    sys.exit(f"No worksheet with gid={SHEET_GID} in spreadsheet {SPREADSHEET_ID}.")


def col_a1(idx_1based):
    """1 -> A, 27 -> AA, etc."""
    out, n = "", idx_1based
    while n > 0:
        n, r = divmod(n - 1, 26)
        out = chr(65 + r) + out
    return out


def check_structure(headers):
    actual = [h.strip() for h in headers[: len(EXISTING_HEADERS)]]
    if actual != EXISTING_HEADERS:
        print("Sheet structure has changed from what this script expects.", file=sys.stderr)
        print(f"  Expected first {len(EXISTING_HEADERS)} headers: {EXISTING_HEADERS}", file=sys.stderr)
        print(f"  Found:                                   {actual}", file=sys.stderr)
        sys.exit("Reconcile EXISTING_HEADERS in this script (or fix the sheet) and re-run.")


def ensure_new_columns(ws, headers):
    """Append any of NEW_COLUMNS that are missing from the header row."""
    want = [c["name"] for c in NEW_COLUMNS]
    missing = [n for n in want if n not in headers]
    if not missing:
        print(f"All {len(want)} new columns already present in header row.")
        return headers

    print(f"Adding {len(missing)} new header(s): {missing}")
    start = len(headers) + 1
    end   = start + len(missing) - 1
    rng   = f"{col_a1(start)}1:{col_a1(end)}1"
    ws.update(values=[missing], range_name=rng)
    return headers + missing


def apply_dropdowns(ws, headers, total_rows):
    """Apply ONE_OF_LIST data validation to every dropdown column on all data rows."""
    requests = []
    for col in NEW_COLUMNS:
        if not col["dropdown"]:
            continue
        col_idx = headers.index(col["name"])  # 0-based
        requests.append({
            "setDataValidation": {
                "range": {
                    "sheetId":          SHEET_GID,
                    "startRowIndex":    1,           # skip header
                    "endRowIndex":      total_rows,  # exclusive
                    "startColumnIndex": col_idx,
                    "endColumnIndex":   col_idx + 1,
                },
                "rule": {
                    "condition": {
                        "type":   "ONE_OF_LIST",
                        "values": [{"userEnteredValue": v} for v in col["dropdown"]],
                    },
                    "strict":       True,
                    "showCustomUi": True,
                },
            },
        })
    if not requests:
        return
    ws.spreadsheet.batch_update({"requests": requests})
    print(f"Applied data validation to {len(requests)} dropdown column(s) across rows 2..{total_rows}.")


def find_row(rows, headers, full_name):
    """Return (1-based sheet row number, row data) for a Full Name match, else (None, None)."""
    name_col = headers.index("Full Name")
    target = full_name.strip()
    for i, row in enumerate(rows, start=2):  # data starts at sheet row 2
        if len(row) > name_col and row[name_col].strip() == target:
            return i, row
    return None, None


def derive_next_action(fields):
    """If Stage set but Next Action absent, fill from NEXT_ACTION_BY_STAGE (when mapped)."""
    if "Next Action" not in fields and fields.get("Stage") in NEXT_ACTION_BY_STAGE:
        fields["Next Action"] = NEXT_ACTION_BY_STAGE[fields["Stage"]]
    return fields


def backfill(ws, headers, rows):
    print(f"\nBackfilling {len(BACKFILLS)} existing row(s)...")
    updates, warnings, not_found = [], [], []

    for name, raw_fields in BACKFILLS.items():
        fields = derive_next_action(dict(raw_fields))
        row_num, row = find_row(rows, headers, name)
        if row_num is None:
            not_found.append(name)
            continue
        for col_name, value in fields.items():
            if col_name not in headers:
                warnings.append(f"  ! {name}: column '{col_name}' not in sheet, skipping")
                continue
            col_idx = headers.index(col_name)
            existing = row[col_idx] if col_idx < len(row) else ""
            if existing.strip():
                if existing.strip() != str(value).strip():
                    warnings.append(
                        f"  ! {name} / {col_name}: already '{existing}', "
                        f"not overwriting with '{value}'"
                    )
                continue
            a1 = f"{col_a1(col_idx + 1)}{row_num}"
            updates.append({"range": a1, "values": [[value]]})

    if updates:
        ws.batch_update(updates, value_input_option="USER_ENTERED")
        print(f"  Wrote {len(updates)} cell update(s).")
    else:
        print("  No cells needed updating.")

    for w in warnings:
        print(w)
    if not_found:
        print(f"  Could not find rows for: {not_found}")


def append_leads(ws, headers):
    if not NEW_LEADS:
        return 0
    print(f"\nAppending {len(NEW_LEADS)} new lead row(s)...")
    payload = [[lead.get(h, "") for h in headers] for lead in NEW_LEADS]
    ws.append_rows(payload, value_input_option="USER_ENTERED")
    for lead in NEW_LEADS:
        print(f"  + {lead.get('Full Name', '?')}")
    return len(payload)


def verify(ws):
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)

    all_values = ws.get_all_values()
    headers = all_values[0]
    data = all_values[1:]

    print("\n1) Column headers:")
    for i, h in enumerate(headers, 1):
        print(f"   {i:2d}. {h}")

    print(f"\n2) Total rows: {len(all_values)}  (1 header + {len(data)} data rows)")

    print("\n3) Joseph's row:")
    joseph = next((r for r in data if len(r) > 3 and r[3].strip() == "Joseph"), None)
    if joseph:
        # pad to header length so zip doesn't truncate trailing blanks
        joseph = joseph + [""] * (len(headers) - len(joseph))
        width = max(len(h) for h in headers)
        for h, v in zip(headers, joseph):
            print(f"   {h:<{width}} : {v}")
    else:
        print("   Joseph row not found.")

    print("\n4) Stage counts:")
    if "Stage" not in headers:
        print("   Stage column missing.")
        return
    stage_col = headers.index("Stage")
    counts = {}
    for r in data:
        s = r[stage_col].strip() if len(r) > stage_col else ""
        key = s or "(blank)"
        counts[key] = counts.get(key, 0) + 1
    for s, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"   {s:<14}: {n}")


def main():
    print("Authorizing...")
    client = authorize()
    spreadsheet, ws = open_worksheet(client)
    print(f"Opened: {spreadsheet.title!r} / sheet {ws.title!r} (gid={ws.id})")

    snapshot = ws.get_all_values()
    if not snapshot:
        sys.exit("Sheet is empty - refusing to proceed.")
    headers, rows = snapshot[0], snapshot[1:]

    check_structure(headers)

    # 1) Header row: add missing new columns
    headers = ensure_new_columns(ws, headers)

    # 2) Backfill existing rows BEFORE appending new ones, so the snapshot
    #    indices stay valid.
    backfill(ws, headers, rows)

    # 3) Append new leads
    added = append_leads(ws, headers)

    # 4) Data validation across header + existing + new rows
    total_rows = 1 + len(rows) + added
    apply_dropdowns(ws, headers, total_rows)

    # 5) Verify
    verify(ws)
    print("\nDone.")


if __name__ == "__main__":
    main()
