#!/usr/bin/env python3
"""One-off helper: exchange your OAuth client for a refresh token.

Run this once. It opens a browser, you approve access to your own Google Ads
account, and it prints a refresh token to paste into your environment.

    export GOOGLE_ADS_CLIENT_ID=...
    export GOOGLE_ADS_CLIENT_SECRET=...
    python get_refresh_token.py
"""

import os
import pathlib
import re
import sys

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    sys.exit("Missing dependency. Run: pip install -r requirements.txt")

SCOPES = ["https://www.googleapis.com/auth/adwords"]


def main():
    client_id = os.environ.get("GOOGLE_ADS_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_ADS_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("Set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET first.")

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        },
        scopes=SCOPES,
    )

    # prompt="consent" forces Google to return a refresh token even if this
    # client was authorised before.
    credentials = flow.run_local_server(port=0, prompt="consent")

    token = credentials.refresh_token
    if not token:
        sys.exit("Google returned no refresh token. Re-run - the consent prompt "
                 "must be accepted fresh.")

    # Written straight into .env rather than printed, so the token never lands
    # in terminal scrollback.
    env = pathlib.Path(".env")
    if not env.is_file():
        sys.exit("No .env in the current directory. Run this from the tool's folder.")

    text = env.read_text()
    text = re.sub(r"^export GOOGLE_ADS_REFRESH_TOKEN=.*$",
                  f"export GOOGLE_ADS_REFRESH_TOKEN={token}",
                  text, flags=re.MULTILINE)
    env.write_text(text)

    print(f"Refresh token written to .env ({len(token)} chars, ends ...{token[-4:]}).")


if __name__ == "__main__":
    main()
