"""Manual upload script for Premium PDF Reports.

Validates the filename, derives the sector from the dashboard category mapping,
computes a sha256 checksum + size, uploads the PDF to Cloudflare R2, and upserts
the metadata row in NeonDB (idempotent on object_key — re-running updates the row).

Usage (run from the backend/ directory, with .env present):
    python upload_report.py path/to/report_FPT_2026-06-29.pdf
    python upload_report.py report_GAS_2026-06-26.pdf --title "GAS — Q2 Update"

Requires the R2_* and DATABASE_URL env vars (see REPORTS_SETUP.md).
"""

import os
import re
import sys
import argparse
import hashlib
from datetime import datetime

from db.r2 import put_object
from db.report_queries import upsert_report
from db.models_report import run_report_migration

# Sector names are Vietnamese (e.g. "Công nghệ"); force UTF-8 so printing them
# doesn't crash on the default Windows console (cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# report_<STOCK>_<YYYY-MM-DD>.pdf  (case-insensitive; STOCK normalized to upper)
FILENAME_RE = re.compile(r"^report_([A-Za-z0-9]+)_(\d{4}-\d{2}-\d{2})\.pdf$")

# Same source of truth as GET /api/sectors and the dashboard.
_CATEGORIES_PATHS = [
    "config/categories.txt",
    "../daily_suggestion_system/categories.txt",
]


def load_sector_map() -> dict:
    """Return {TICKER: sector} parsed from categories.txt (mirrors /api/sectors)."""
    path = next((p for p in _CATEGORIES_PATHS if os.path.exists(p)), None)
    if not path:
        return {}
    mapping = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or ":" not in line:  # skips the flat all-tickers header line
                continue
            sector, tickers_str = line.split(":", 1)
            for t in tickers_str.split(","):
                t = t.strip().upper()
                if t:
                    mapping.setdefault(t, sector.strip())
    return mapping


def derive_sector(stock: str, sector_map: dict) -> str:
    """Reverse-lookup the sector for a ticker; default 'Khác' with a warning."""
    sector = sector_map.get(stock.upper())
    if not sector:
        print(f"  ! WARNING: '{stock}' not found in categories.txt — sector set to 'Khác'.")
        return "Khác"
    return sector


def main():
    parser = argparse.ArgumentParser(description="Upload a Premium PDF report to R2 + NeonDB.")
    parser.add_argument("pdf_path", help="Path to report_<STOCK>_<YYYY-MM-DD>.pdf")
    parser.add_argument("--title", default=None, help="Optional human-readable title")
    args = parser.parse_args()

    pdf_path = args.pdf_path
    if not os.path.isfile(pdf_path):
        print(f"ERROR: file not found: {pdf_path}")
        sys.exit(1)

    base = os.path.basename(pdf_path)
    m = FILENAME_RE.match(base)
    if not m:
        print(f"ERROR: filename '{base}' must match report_<STOCK>_<YYYY-MM-DD>.pdf")
        sys.exit(1)

    stock = m.group(1).upper()
    date_str = m.group(2)
    try:
        report_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        print(f"ERROR: '{date_str}' is not a valid calendar date.")
        sys.exit(1)

    # Canonical filename / object_key (deterministic → idempotent upsert).
    file_name = f"report_{stock}_{date_str}.pdf"
    object_key = f"reports/{stock}/{file_name}"

    with open(pdf_path, "rb") as f:
        data = f.read()
    file_size_bytes = len(data)
    checksum = hashlib.sha256(data).hexdigest()

    sector = derive_sector(stock, load_sector_map())
    title = args.title  # may be None → frontend falls back to file_name

    print(f"Stock:      {stock}")
    print(f"Date:       {report_date}")
    print(f"Sector:     {sector}")
    print(f"Size:       {file_size_bytes:,} bytes")
    print(f"Checksum:   {checksum}")
    print(f"Object key: {object_key}")

    print("Uploading to R2 ...")
    put_object(object_key, data)

    # Idempotent: ensure the reports table exists even if the backend has never
    # been started against this database.
    run_report_migration()

    print("Upserting metadata ...")
    report_id = upsert_report({
        "stock_id": stock,
        "sector": sector,
        "report_date": report_date,
        "title": title,
        "file_name": file_name,
        "object_key": object_key,
        "file_size_bytes": file_size_bytes,
        "checksum": checksum,
    })

    print(f"Done. report id = {report_id}")


if __name__ == "__main__":
    main()
