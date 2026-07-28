"""
One-shot backfill: rebuild every BCD signal and trade under the entry rule that
waits for the B->C line.

Rows written before this change recorded an entry on the breakdown day at a
projected line price the stock often never traded at (KLB 2026-07-21 booked an
entry of 10.30 against a 11.80-12.35 range, then "took profit" the same day for
+15%). Those trades cannot be repaired in place, so this rebuilds them:

    1. Recompute each signal's B->C line and reset it to WAITING.
    2. Re-derive the fills from stored OHLC (bcd_signal_trigger, rescan_all).
    3. Drop bcd_trade_history entirely and let the tracker rebuild it.

DESTRUCTIVE and writes to whatever DATABASE_URL points at — in this project
that is the shared production database. Requires --yes.

    cd daily_suggestion_system/src/daily_pipeline
    python bcd_backfill_entries.py --dry-run     # report only, no writes
    python bcd_backfill_entries.py --yes
"""
import argparse
import logging
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import text

SRC_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC_DIR))

from bcd_signal_trigger import _ensure_columns, evaluate_bcd_triggers
from bcd_trade_tracker import update_bcd_trades
from data_access.db_connection import get_engine
from features.bcd_features import calc_bc_line, expiry_date

log = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parents[2] / "model" / "bcd_model.pkl"

# Signals joined to their breakdown candle — calc_bc_line needs that day's
# open/close for the flat-line fallback when B and C are under 2% apart.
# Deliberately reads only pre-existing columns, so --dry-run works against a
# table that has not been migrated yet.
_LOAD_SQL = text("""
SELECT s.id, s.date AS "Ngay", s.stock_id,
       s.b_date AS "B_Ngay", s.b_price AS "B_close",
       s.c_date AS "C_Ngay", s.c_price AS "C_close",
       o.open, o.close
FROM bcd_signals s
LEFT JOIN stock_ohlc o ON o.stock_id = s.stock_id AND o."Ngay" = s.date
ORDER BY s.date, s.stock_id
""")

_RESET_SQL = text("""
UPDATE bcd_signals
   SET status            = 'WAITING',
       entry_date        = NULL,
       entry_price       = NULL,
       tp_price          = NULL,
       sl_price          = NULL,
       expires_on        = :expires_on,
       line_anchor_date  = :line_anchor_date,
       line_anchor_price = :line_anchor_price,
       line_slope        = :line_slope,
       model_threshold   = COALESCE(model_threshold, :model_threshold)
 WHERE id = :id
""")


def _current_threshold() -> float | None:
    """The threshold these historical rows were actually scored against.

    Read from the shipped pickle rather than hard-coded, and only ever written
    where the column is still NULL, so a later retrain does not rewrite how old
    signals were judged.
    """
    if not MODEL_PATH.exists():
        log.warning(f"No model at {MODEL_PATH} — leaving model_threshold as-is")
        return None
    import joblib
    return float(joblib.load(MODEL_PATH).get("best_threshold", 0.71))


def backfill(dry_run: bool = False) -> dict | None:
    engine = get_engine()
    if engine is None:
        log.error("Backfill: no database engine available")
        return None

    signals = pd.read_sql(_LOAD_SQL, engine)
    if signals.empty:
        log.info("Backfill: bcd_signals is empty, nothing to do")
        return {"reset": 0}

    threshold = _current_threshold()

    updates, skipped = [], []
    for _, row in signals.iterrows():
        line = calc_bc_line(row)
        if line is None:
            skipped.append(f"{row['stock_id']} {row['Ngay']}")
            continue
        anchor_date, anchor_price, slope = line
        updates.append({
            "id": int(row["id"]),
            "expires_on": str(expiry_date(row["Ngay"])),
            "line_anchor_date": str(anchor_date),
            "line_anchor_price": anchor_price,
            "line_slope": slope,
            "model_threshold": threshold,
        })

    log.info(f"Backfill: {len(updates)} signals to reset, {len(skipped)} without a usable line")
    if skipped:
        log.warning("  no line for: " + ", ".join(skipped))

    if dry_run:
        log.info("Backfill: --dry-run, no writes performed")
        by_id = {int(r["id"]): r for _, r in signals.iterrows()}
        for u in updates:
            r = by_id[u["id"]]
            log.info(
                f"  {r['stock_id']} {r['Ngay']}: anchor={u['line_anchor_date']}@"
                f"{u['line_anchor_price']:.4f} slope={u['line_slope']:.4f}/day "
                f"expires={u['expires_on']}"
            )
        return {"reset": len(updates), "dry_run": True}

    _ensure_columns(engine)

    with engine.begin() as conn:
        if updates:
            conn.execute(_RESET_SQL, updates)
        # Every existing trade came from the old breakdown-day fill, so there is
        # nothing worth keeping; the tracker rebuilds from TRIGGERED signals.
        deleted = conn.execute(text("DELETE FROM bcd_trade_history")).rowcount
    log.info(f"Backfill: reset {len(updates)} signals, deleted {deleted} old trades")

    triggers = evaluate_bcd_triggers(engine, rescan_all=True)

    # update_bcd_trades resolves open positions BEFORE opening new ones, so the
    # first pass only creates the trades. A second pass walks them through
    # TP/SL/TIMEOUT — the daily run gets this for free the next morning, but a
    # backfill has to close the loop itself.
    update_bcd_trades()
    tracked = update_bcd_trades()

    return {"reset": len(updates), "deleted_trades": deleted,
            "triggers": triggers, "trades": tracked}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="confirm the destructive rebuild")
    parser.add_argument("--dry-run", action="store_true", help="report what would change, write nothing")
    args = parser.parse_args()

    if not (args.yes or args.dry_run):
        parser.error("refusing to run without --yes (or use --dry-run)")

    for _cand in [Path(__file__).resolve().parents[2] / ".env",
                  Path(__file__).resolve().parents[3] / "backend" / ".env"]:
        if _cand.exists():
            from dotenv import load_dotenv
            load_dotenv(_cand)
            break

    result = backfill(dry_run=args.dry_run)
    log.info(f"Backfill result: {result}")
