"""Remove a Premium PDF report.

Default is a SOFT delete (``is_active = FALSE``) — the row and the R2 object stay,
so it can be restored by re-uploading. Pass ``--hard`` to also delete the object
from R2 and drop the metadata row permanently.

Usage (run from the backend/ directory, with .env present):
    python remove_report.py report_FPT_2026-06-29.pdf
    python remove_report.py report_FPT_2026-06-29.pdf --hard

Requires DATABASE_URL (and R2_* for --hard). See REPORTS_SETUP.md.
"""

import os
import re
import sys
import argparse

from db.report_queries import deactivate_report, delete_report

FILENAME_RE = re.compile(r"^report_([A-Za-z0-9]+)_(\d{4}-\d{2}-\d{2})\.pdf$")


def object_key_for(filename: str) -> str:
    """Rebuild the deterministic object_key from a report filename."""
    base = os.path.basename(filename)
    m = FILENAME_RE.match(base)
    if not m:
        print(f"ERROR: filename '{base}' must match report_<STOCK>_<YYYY-MM-DD>.pdf")
        sys.exit(1)
    stock = m.group(1).upper()
    date_str = m.group(2)
    return f"reports/{stock}/report_{stock}_{date_str}.pdf"


def main():
    parser = argparse.ArgumentParser(description="Remove a Premium PDF report.")
    parser.add_argument("filename", help="report_<STOCK>_<YYYY-MM-DD>.pdf")
    parser.add_argument(
        "--hard", action="store_true",
        help="Also delete the R2 object and drop the metadata row permanently.",
    )
    args = parser.parse_args()

    object_key = object_key_for(args.filename)

    if args.hard:
        # Lazy import so a soft delete never needs R2 configured.
        from db.r2 import delete_object
        print(f"Hard-deleting R2 object: {object_key}")
        try:
            delete_object(object_key)
        except Exception as e:
            print(f"  ! R2 delete warning (continuing to remove metadata): {e}")
        removed = delete_report(object_key)
        print("Metadata row deleted." if removed else "No matching metadata row found.")
    else:
        deactivated = deactivate_report(object_key)
        if deactivated:
            print(f"Soft-deleted (is_active=FALSE): {object_key}")
        else:
            print(f"No matching active report found for: {object_key}")


if __name__ == "__main__":
    main()
